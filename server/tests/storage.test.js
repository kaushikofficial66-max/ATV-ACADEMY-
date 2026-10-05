/**
 * Storage integration test: Vimeo (recorded videos) + Cloudflare R2 (files).
 *
 *   DB_NAME=lms_db_test npm test
 *
 * Runs against two in-process fakes - the Vimeo API (incl. tus uploads) and an
 * S3-compatible R2 endpoint - so no real Vimeo / Cloudflare account is touched.
 * Refuses to run unless DB_NAME ends with "_test" (the database is wiped).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!/_test$/.test(process.env.DB_NAME || '')) {
  throw new Error('Refusing to run: set DB_NAME to a database ending in "_test" (it will be wiped).');
}

process.env.NODE_ENV = 'test';
// Keep test uploads out of the real uploads/ folder.
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'atv-test-uploads-'));
process.env.DISABLE_SCHEDULER = 'true';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.STORAGE_DRIVER = 'cloud';
for (const key of [
  'MAIL_HOST', 'MAIL_USER', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET',
  'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'VIMEO_ACCESS_TOKEN', 'VIMEO_FOLDER_ID', 'VIMEO_EMBED_DOMAINS',
  'VIMEO_PRIVACY_VIEW', 'VIMEO_USE_DIRECT_LINKS', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_BUCKET', 'CLOUDFLARE_R2_PUBLIC_URL'
]) {
  process.env[key] = '';
}

const BUCKET = 'atv-media';

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/vnd.vimeo.video+json' });
  res.end(JSON.stringify(body));
};

// ---------------------------------------------------------------------------
// Fake Vimeo API
// ---------------------------------------------------------------------------
const vimeo = { videos: new Map(), deleted: [], domains: [], folders: [], creates: [], nextId: 900000001 };
let vimeoServer;

const videoObject = (id) => {
  const v = vimeo.videos.get(id);
  return {
    uri: `/videos/${id}`,
    name: v.name,
    link: `https://vimeo.com/${id}/abc123`,
    player_embed_url: `https://player.vimeo.com/video/${id}?h=abc123`,
    duration: v.state === 'ready' ? 120 : 0,
    status: v.state === 'ready' ? 'available' : v.state === 'failed' ? 'transcoding_error' : 'transcoding',
    transcode: { status: v.state === 'ready' ? 'complete' : v.state === 'failed' ? 'error' : 'in_progress' },
    upload: { status: 'complete' },
    pictures: { base_link: `https://i.vimeocdn.com/video/${id}`, sizes: [{ width: 1280, link: `https://i.vimeocdn.com/video/${id}_1280.jpg` }, { width: 640, link: `https://i.vimeocdn.com/video/${id}_640.jpg` }] },
    privacy: v.privacy
  };
};

const startVimeoFake = () =>
  new Promise((resolve) => {
    vimeoServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const body = await readBody(req);
      const self = `http://127.0.0.1:${vimeoServer.address().port}`;

      if (url.pathname.startsWith('/tus/')) {
        const id = url.pathname.split('/').pop();
        const v = vimeo.videos.get(id);
        assert.equal(req.method, 'PATCH');
        assert.equal(Number(req.headers['upload-offset']), v.bytes, 'tus offsets must be sequential');
        assert.equal(req.headers['content-type'], 'application/offset+octet-stream');
        v.bytes += body.length;
        res.writeHead(204, { 'Upload-Offset': String(v.bytes), 'Tus-Resumable': '1.0.0' });
        return res.end();
      }
      if (req.headers.authorization !== 'bearer vimeo-token') return json(res, 401, { error: 'Unauthorized', developer_message: 'invalid token' });

      if (req.method === 'GET' && url.pathname === '/oauth/verify') {
        return json(res, 200, { scope: 'public private create edit delete upload video_files', user: { name: 'ATV', account: 'standard', upload_quota: { space: { free: 1e12 } } } });
      }
      if (req.method === 'POST' && url.pathname === '/me/videos') {
        const payload = JSON.parse(body.toString());
        assert.equal(payload.upload.approach, 'tus');
        const id = String(vimeo.nextId++);
        vimeo.videos.set(id, { name: payload.name, bytes: 0, expected: Number(payload.upload.size), state: 'transcoding', privacy: payload.privacy });
        vimeo.creates.push(payload);
        return json(res, 200, { ...videoObject(id), upload: { approach: 'tus', upload_link: `${self}/tus/${id}`, size: payload.upload.size } });
      }
      let m = url.pathname.match(/^\/videos\/(\d+)\/privacy\/domains\/(.+)$/);
      if (m && req.method === 'PUT') {
        vimeo.domains.push(`${m[1]}:${decodeURIComponent(m[2])}`);
        res.writeHead(204);
        return res.end();
      }
      m = url.pathname.match(/^\/me\/projects\/(\w+)\/videos\/(\d+)$/);
      if (m && req.method === 'PUT') {
        vimeo.folders.push(`${m[1]}:${m[2]}`);
        res.writeHead(204);
        return res.end();
      }
      m = url.pathname.match(/^\/videos\/(\d+)$/);
      if (m) {
        const id = m[1];
        if (!vimeo.videos.has(id)) return json(res, 404, { error: 'The requested video could not be found' });
        if (req.method === 'DELETE') {
          vimeo.videos.delete(id);
          vimeo.deleted.push(id);
          res.writeHead(204);
          return res.end();
        }
        if (url.searchParams.get('fields') === 'play') {
          return json(res, 200, { play: { hls: { link: `https://hls.vimeo.test/${id}.m3u8`, link_expiration_time: '2030-01-01T00:00:00+00:00' }, progressive: [{ height: 720, link: `https://mp4.vimeo.test/${id}_720.mp4` }] } });
        }
        return json(res, 200, videoObject(id));
      }
      return json(res, 404, { error: `no fake route for ${req.method} ${url.pathname}` });
    });
    vimeoServer.listen(0, '127.0.0.1', resolve);
  });

// ---------------------------------------------------------------------------
// Fake R2 (S3 path-style)
// ---------------------------------------------------------------------------
const r2 = { objects: new Map() };
let r2Server;

/** Decodes "aws-chunked" bodies in case the client streams with chunk framing. */
const decodeAwsChunked = (buf) => {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const lineEnd = buf.indexOf('\r\n', i);
    const size = parseInt(buf.slice(i, lineEnd).toString().split(';')[0], 16);
    if (!size) break;
    out.push(buf.slice(lineEnd + 2, lineEnd + 2 + size));
    i = lineEnd + 2 + size + 2;
  }
  return Buffer.concat(out);
};

const startR2Fake = () =>
  new Promise((resolve) => {
    r2Server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let body = await readBody(req);
      const [, bucket, ...rest] = decodeURIComponent(url.pathname).split('/');
      const key = rest.join('/');
      if (!String(req.headers.authorization || '').includes('Credential=r2-key/')) {
        res.writeHead(403);
        return res.end();
      }
      if (bucket !== BUCKET) {
        res.writeHead(404);
        return res.end();
      }
      if (req.method === 'HEAD' && !key) {
        res.writeHead(200);
        return res.end();
      }
      if (req.method === 'PUT') {
        if (String(req.headers['content-encoding'] || '').includes('aws-chunked')) body = decodeAwsChunked(body);
        r2.objects.set(key, { body, type: req.headers['content-type'] });
        res.writeHead(200, { ETag: `"${crypto.createHash('md5').update(body).digest('hex')}"` });
        return res.end();
      }
      if (req.method === 'GET') {
        const obj = r2.objects.get(key);
        if (!obj) {
          res.writeHead(404, { 'Content-Type': 'application/xml' });
          return res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        }
        res.writeHead(200, { 'Content-Type': obj.type, 'Content-Length': obj.body.length });
        return res.end(obj.body);
      }
      if (req.method === 'DELETE') {
        r2.objects.delete(key);
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(400);
      return res.end();
    });
    r2Server.listen(0, '127.0.0.1', resolve);
  });

// ---------------------------------------------------------------------------

let request;
let app;
let models;
let videoService;
const ADMIN = { email: 'admin@test.local', password: 'Admin12345' };
const state = {};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await startVimeoFake();
  await startR2Fake();
  process.env.VIMEO_API_BASE = `http://127.0.0.1:${vimeoServer.address().port}`;
  process.env.CLOUDFLARE_R2_ENDPOINT = `http://127.0.0.1:${r2Server.address().port}`;

  const env = { ...process.env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password };
  execFileSync(process.execPath, ['scripts/migrate.js', '--fresh'], { cwd: ROOT, env, stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });

  ({ default: request } = await import('supertest'));
  ({ default: app } = await import('../index.js'));
  models = await import('../models/index.js');
  videoService = await import('../services/videoService.js');
});

after(async () => {
  await models.sequelize.close();
  vimeoServer.close();
  r2Server.close();
});

test('storage settings: uploads fail clearly until Vimeo / R2 are configured', async () => {
  const login = await request(app).post('/api/v1/auth/login').send(ADMIN);
  state.admin = login.body.data.token;

  const cats = await request(app).get('/api/v1/public/categories');
  state.categoryId = cats.body.data.categories[0].id;
  const blocked = await request(app)
    .post('/api/v1/admin/courses')
    .set(auth(state.admin))
    .field('title', 'No storage yet')
    .field('category_id', String(state.categoryId))
    .attach('thumbnail', Buffer.from('img'), { filename: 'a.png', contentType: 'image/png' });
  assert.equal(blocked.status, 503, 'driver=cloud without credentials must refuse uploads');

  const save = await request(app)
    .put('/api/v1/admin/settings/storage')
    .set(auth(state.admin))
    .send({
      vimeo_access_token: 'vimeo-token',
      vimeo_folder_id: '777',
      vimeo_embed_domains: 'https://atv.test, localhost',
      cloudflare_account_id: 'acc123',
      cloudflare_r2_access_key_id: 'r2-key',
      cloudflare_r2_secret_access_key: 'r2-secret',
      cloudflare_r2_bucket: BUCKET,
      cloudflare_r2_public_url: 'https://media.atv.test'
    });
  assert.equal(save.status, 200, save.body.message);
  assert.ok(save.body.data.settings.storage.vimeo_access_token.value.startsWith('*'), 'token is masked');

  const check = await request(app).post('/api/v1/admin/settings/storage/test').set(auth(state.admin));
  assert.equal(check.status, 200, JSON.stringify(check.body));
  assert.equal(check.body.data.vimeo.ok, true);
  assert.equal(check.body.data.vimeo.account, 'standard');
  assert.equal(check.body.data.r2.ok, true);
});

test('R2: images go to the public bucket, documents stay private and stream through the API', async () => {
  const course = await request(app)
    .post('/api/v1/admin/courses')
    .set(auth(state.admin))
    .field('title', 'Cloud course')
    .field('category_id', String(state.categoryId))
    .field('price', '0')
    .field('status', 'published')
    .attach('thumbnail', Buffer.from('PNGDATA'), { filename: 'thumb.png', contentType: 'image/png' });
  assert.equal(course.status, 201, course.body.message);
  state.courseId = course.body.data.course.id;
  const thumb = course.body.data.course.thumbnail_url;
  assert.match(thumb, /^https:\/\/media\.atv\.test\/images\/.+\.png$/);
  assert.equal(r2.objects.get(thumb.replace('https://media.atv.test/', '')).body.toString(), 'PNGDATA');

  const section = await request(app).post(`/api/v1/admin/courses/${state.courseId}/sections`).set(auth(state.admin)).send({ title: 'Intro' });
  state.sectionId = section.body.data.section.id;
  const lecture = await request(app).post(`/api/v1/admin/sections/${state.sectionId}/lectures`).set(auth(state.admin)).send({ title: 'Welcome', lecture_type: 'video' });
  state.lectureId = lecture.body.data.lecture.id;

  const resource = await request(app)
    .post(`/api/v1/admin/courses/${state.courseId}/resources`)
    .set(auth(state.admin))
    .field('title', 'Slides')
    .attach('resource_file', Buffer.from('%PDF-slides'), { filename: 'slides.pdf', contentType: 'application/pdf' });
  assert.equal(resource.status, 201, resource.body.message);
  assert.match(resource.body.data.resource.file_url, /^r2:documents\//);
  state.resourceId = resource.body.data.resource.id;
  const localDocs = fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'documents'));
  assert.ok(!localDocs.some((f) => resource.body.data.resource.file_url.endsWith(f)), 'local temp copy removed');
  const fileRow = await models.FileModel.findOne({ where: { entity_type: 'course_resource', entity_id: state.resourceId } });
  assert.equal(fileRow.storage_provider, 'cloudflare_r2');

  const reg = await request(app).post('/api/v1/auth/register').send({ first_name: 'Ria', email: 'ria@test.local', password: 'Student123' });
  state.student = reg.body.data.token;
  state.studentId = reg.body.data.user.id;
  await request(app).post(`/api/v1/admin/students/${state.studentId}/enrollments`).set(auth(state.admin)).send({ course_id: state.courseId }).expect(201);
  const dl = await request(app).get(`/api/v1/student/resources/${state.resourceId}/download`).set(auth(state.student)).buffer(true);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers['content-type'], 'application/pdf');
  assert.match(dl.headers['content-disposition'], /attachment; filename="slides\.pdf"/);
  assert.equal(dl.body.toString(), '%PDF-slides');

  const removed = await request(app).delete(`/api/v1/admin/resources/${state.resourceId}`).set(auth(state.admin));
  assert.equal(removed.status, 200);
  assert.equal(r2.objects.has(resource.body.data.resource.file_url.slice(3)), false, 'R2 object deleted');
});

test('Vimeo: server upload via tus with privacy, folder and embed domains; sync to ready; playback for enrolled students only', async () => {
  const size = 70 * 1024 * 1024 + 321; // more than one 64 MB tus chunk
  const upload = await request(app)
    .post(`/api/v1/admin/courses/${state.courseId}/videos`)
    .set(auth(state.admin))
    .field('lecture_id', String(state.lectureId))
    .field('title', 'Welcome video')
    .attach('video_file', Buffer.alloc(size, 1), { filename: 'welcome.mp4', contentType: 'video/mp4' });
  assert.equal(upload.status, 201, upload.body.message);
  const video = upload.body.data.video;
  assert.equal(upload.body.data.storage_provider, 'vimeo');
  assert.equal(video.status, 'processing');
  assert.match(video.vimeo_video_id, /^\d+$/);
  assert.equal(video.storage_key, null);
  assert.equal(video.video_url, `https://player.vimeo.com/video/${video.vimeo_video_id}?h=abc123`, 'embed URL stored in the database');
  assert.equal(vimeo.videos.get(video.vimeo_video_id).bytes, size, 'all bytes uploaded in tus chunks');
  const created = vimeo.creates[0];
  assert.equal(created.name, 'Welcome video');
  assert.deepEqual({ view: created.privacy.view, embed: created.privacy.embed, download: created.privacy.download }, { view: 'disable', embed: 'whitelist', download: false });
  assert.deepEqual(vimeo.domains.filter((d) => d.startsWith(video.vimeo_video_id)), [`${video.vimeo_video_id}:atv.test`, `${video.vimeo_video_id}:localhost`]);
  assert.ok(vimeo.folders.includes(`777:${video.vimeo_video_id}`));
  assert.equal(fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'videos')).length, 0, 'temp video file removed');
  const fileRow = await models.FileModel.findOne({ where: { storage_provider: 'vimeo', storage_key: video.vimeo_video_id } });
  assert.ok(fileRow, 'files row recorded');
  state.videoId = video.id;
  state.vimeoId = video.vimeo_video_id;

  const hidden = await request(app).get(`/api/v1/student/lectures/${state.lectureId}`).set(auth(state.student));
  assert.equal(hidden.body.data.video, null, 'processing videos are not playable');
  const early = await request(app).put(`/api/v1/admin/videos/${state.videoId}`).set(auth(state.admin)).send({ status: 'published' });
  assert.equal(early.status, 409);

  vimeo.videos.get(state.vimeoId).state = 'ready';
  const sync = await request(app).post(`/api/v1/admin/videos/${state.videoId}/sync`).set(auth(state.admin));
  assert.equal(sync.status, 200);
  assert.equal(sync.body.data.video.status, 'ready');
  assert.equal(sync.body.data.video.duration_seconds, 120);
  assert.equal(sync.body.data.video.thumbnail_url, `https://i.vimeocdn.com/video/${state.vimeoId}_640.jpg`);
  assert.equal((await models.Lecture.findByPk(state.lectureId)).duration_seconds, 120, 'lecture duration filled from Vimeo');

  const lec = await request(app).get(`/api/v1/student/lectures/${state.lectureId}`).set(auth(state.student));
  assert.equal(lec.status, 200);
  const playback = lec.body.data.video.playback;
  assert.equal(playback.provider, 'vimeo');
  assert.equal(playback.vimeo_video_id, state.vimeoId);
  const embed = new URL(playback.embed_url);
  assert.equal(embed.origin + embed.pathname, `https://player.vimeo.com/video/${state.vimeoId}`);
  assert.equal(embed.searchParams.get('h'), 'abc123');
  assert.equal(embed.searchParams.get('dnt'), '1');
  assert.equal(lec.body.data.video.stream_url, playback.embed_url);
  assert.equal(playback.hls_url, null, 'direct links off by default');

  const outsider = await request(app).post('/api/v1/auth/register').send({ first_name: 'Out', email: 'out@test.local', password: 'Student123' });
  const denied = await request(app).get(`/api/v1/student/lectures/${state.lectureId}`).set(auth(outsider.body.data.token));
  assert.equal(denied.status, 403, 'non-enrolled users get no player URL');

  const progress = await request(app).post(`/api/v1/student/lectures/${state.lectureId}/progress`).set(auth(state.student)).send({ watched_seconds: 110 });
  assert.equal(progress.body.data.lecture_progress.completed, true, '90% rule uses the Vimeo duration');

  await request(app).put('/api/v1/admin/settings/storage').set(auth(state.admin)).send({ vimeo_use_direct_links: 'true' }).expect(200);
  const direct = await request(app).get(`/api/v1/student/lectures/${state.lectureId}`).set(auth(state.student));
  assert.equal(direct.body.data.video.playback.hls_url, `https://hls.vimeo.test/${state.vimeoId}.m3u8`);
  assert.equal(direct.body.data.video.playback.mp4_url, `https://mp4.vimeo.test/${state.vimeoId}_720.mp4`);
  await request(app).put('/api/v1/admin/settings/storage').set(auth(state.admin)).send({ vimeo_use_direct_links: 'false' }).expect(200);
});

test('Vimeo: direct browser (tus) upload, background sync, failure notification', async () => {
  const missing = await request(app).post(`/api/v1/admin/courses/${state.courseId}/videos/direct-upload`).set(auth(state.admin)).send({ section_id: state.sectionId });
  assert.equal(missing.status, 400, 'upload_length is required');

  const direct = await request(app)
    .post(`/api/v1/admin/courses/${state.courseId}/videos/direct-upload`)
    .set(auth(state.admin))
    .send({ section_id: state.sectionId, title: 'Bonus', create_lecture: true, upload_length: 3 * 1024 * 1024 * 1024 });
  assert.equal(direct.status, 201, direct.body.message);
  assert.equal(direct.body.data.upload.method, 'tus');
  assert.match(direct.body.data.upload.url, /\/tus\/\d+$/);
  const bonus = direct.body.data.video;
  assert.equal(bonus.status, 'processing');
  assert.equal(bonus.vimeo_video_id, direct.body.data.upload.video_id);
  assert.ok(bonus.lecture_id, 'lecture created');
  state.bonus = bonus;

  const doomed = await request(app)
    .post(`/api/v1/admin/courses/${state.courseId}/videos/direct-upload`)
    .set(auth(state.admin))
    .send({ section_id: state.sectionId, title: 'Doomed', upload_length: 1000 });
  state.doomed = doomed.body.data.video;

  // The scheduler job picks up transcoding results.
  vimeo.videos.get(bonus.vimeo_video_id).state = 'ready';
  vimeo.videos.get(state.doomed.vimeo_video_id).state = 'failed';
  const synced = await videoService.syncProcessingVideos();
  assert.equal(synced, 2);
  assert.equal((await models.RecordedVideo.findByPk(bonus.id)).status, 'ready');
  assert.equal((await models.RecordedVideo.findByPk(state.doomed.id)).status, 'failed');
  const note = await models.Notification.findOne({ where: { type: 'video_failed', reference_id: state.doomed.id } });
  assert.ok(note, 'uploader notified about the failed video');
});

test('Vimeo: link an existing video by URL; deletes only remove videos the LMS uploaded', async () => {
  vimeo.videos.set('123456789', { name: 'Existing', bytes: 0, state: 'ready', privacy: { view: 'disable' } });
  const linked = await request(app)
    .post(`/api/v1/admin/courses/${state.courseId}/videos`)
    .set(auth(state.admin))
    .field('section_id', String(state.sectionId))
    .field('title', 'From my Vimeo')
    .field('vimeo_url', 'https://vimeo.com/123456789/abc123');
  assert.equal(linked.status, 201, linked.body.message);
  assert.equal(linked.body.data.video.vimeo_video_id, '123456789');
  assert.equal(linked.body.data.video.status, 'ready');
  assert.equal(linked.body.data.video.duration_seconds, 120);

  const badLink = await request(app).post(`/api/v1/admin/courses/${state.courseId}/videos`).set(auth(state.admin)).field('section_id', String(state.sectionId)).field('vimeo_url', 'https://vimeo.com/987654321');
  assert.equal(badLink.status, 404, 'unknown Vimeo video is rejected');

  await request(app).delete(`/api/v1/admin/videos/${linked.body.data.video.id}`).set(auth(state.admin)).expect(200);
  assert.ok(!vimeo.deleted.includes('123456789'), 'linked video stays on Vimeo');
  assert.ok(vimeo.videos.has('123456789'));

  // Replace via direct upload: the old LMS-uploaded Vimeo video is deleted.
  const replace = await request(app).post(`/api/v1/admin/videos/${state.videoId}/direct-upload`).set(auth(state.admin)).send({ upload_length: 5000 });
  assert.equal(replace.status, 201, replace.body.message);
  assert.notEqual(replace.body.data.video.vimeo_video_id, state.vimeoId);
  assert.ok(vimeo.deleted.includes(state.vimeoId));

  await request(app).delete(`/api/v1/admin/videos/${state.doomed.id}`).set(auth(state.admin)).expect(200);
  assert.ok(vimeo.deleted.includes(state.doomed.vimeo_video_id), 'LMS-uploaded video deleted on Vimeo');
});

test('R2: project submissions and report exports are stored privately', async () => {
  const project = await request(app).post(`/api/v1/admin/courses/${state.courseId}/projects`).set(auth(state.admin)).send({ title: 'Final', instructions: 'Build it' });
  assert.equal(project.status, 201);
  // Reach the 90% cap: one counted play at a 90% increment (a Vimeo video that is ready).
  await request(app).put('/api/v1/admin/settings/general').set(auth(state.admin)).send({ progress_increment_percent: '90' }).expect(200);
  const play = await request(app).post(`/api/v1/student/videos/${state.bonus.id}/play`).set(auth(state.student));
  assert.equal(play.status, 200, play.body.message);
  assert.equal(play.body.data.progress.completion_percentage, 90);
  assert.equal(play.body.data.progress.status, 'project_unlocked');
  const submit = await request(app)
    .post(`/api/v1/student/projects/${project.body.data.project.id}/submit`)
    .set(auth(state.student))
    .attach('project_file', Buffer.from('ZIPDATA'), { filename: 'project.zip', contentType: 'application/zip' });
  assert.equal(submit.status, 201, submit.body.message);
  const row = await models.ProjectSubmission.findByPk(submit.body.data.submission.id);
  assert.match(row.file_url, /^r2:projects\//);
  const dl = await request(app).get(`/api/v1/admin/project-submissions/${row.id}/download`).set(auth(state.admin)).buffer(true);
  assert.equal(dl.status, 200);

  const exp = await request(app).post('/api/v1/admin/reports/course/export').set(auth(state.admin)).send({});
  assert.equal(exp.status, 201);
  assert.match(exp.body.data.export.file_url, /^r2:reports\//);
  const csv = await request(app).get(exp.body.data.download_url).set(auth(state.admin)).buffer(true);
  assert.equal(csv.status, 200);
  assert.match(csv.text || csv.body.toString(), /Cloud course/);
});
