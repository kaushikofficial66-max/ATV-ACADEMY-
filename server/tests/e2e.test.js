/**
 * End-to-end API test covering the core business flows of the spec.
 *
 *   DB_NAME=lms_db_test npm test
 *
 * Safety: refuses to run unless DB_NAME ends with "_test". The database is
 * recreated from database/schema.sql and seeded before the run. External
 * services (SMTP, Razorpay, Zoom, WhatsApp) are disabled for the run.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.NODE_ENV = 'test';
// The developer .env may hold the REAL store keys: tests must never see them.
for (const key of ['WOOCOMMERCE_ENABLED', 'WOOCOMMERCE_URL', 'WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_SECRET', 'WOOCOMMERCE_WEBHOOK_SECRET', 'WOOCOMMERCE_PAID_STATUSES']) process.env[key] = '';
// Keep test uploads out of the real uploads/ folder.
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'atv-test-uploads-'));
process.env.DISABLE_SCHEDULER = 'true';
for (const key of ['MAIL_HOST', 'MAIL_USER', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']) {
  process.env[key] = '';
}
process.env.AUTH_RATE_LIMIT = '1000';
// This suite covers local-disk storage; tests/storage.test.js covers Vimeo + Cloudflare R2.
process.env.STORAGE_DRIVER = 'local';
for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'VIMEO_ACCESS_TOKEN', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_BUCKET']) {
  process.env[key] = '';
}

if (!/_test$/.test(process.env.DB_NAME || '')) {
  throw new Error('Refusing to run: set DB_NAME to a database ending in "_test" (it will be wiped).');
}

let request;
let app;
let sequelize;

const ADMIN = { email: 'admin@test.local', password: 'Admin12345' };
const state = {};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  const env = { ...process.env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password };
  execFileSync(process.execPath, ['scripts/migrate.js', '--fresh'], { cwd: ROOT, env, stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });

  ({ default: request } = await import('supertest'));
  ({ default: app } = await import('../index.js'));
  ({ sequelize } = await import('../models/index.js'));
});

after(async () => {
  await sequelize.close();
});

const login = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.body.message);
  return res.body.data.token;
};

test('authentication, roles and tutor approval', async () => {
  state.admin = await login(ADMIN.email, ADMIN.password);

  const weak = await request(app).post('/api/v1/auth/register').send({ first_name: 'A', email: 'x@test.local', password: 'short' });
  assert.equal(weak.status, 422);

  const tutorReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ first_name: 'Tara', last_name: 'Tutor', email: 'tutor@test.local', password: 'Tutor12345', role: 'tutor' });
  assert.equal(tutorReg.status, 201);
  assert.equal(tutorReg.body.data.user.status, 'pending');
  state.tutorId = tutorReg.body.data.user.id;
  state.tutor = await login('tutor@test.local', 'Tutor12345');

  const blocked = await request(app).get('/api/v1/tutor/dashboard').set(auth(state.tutor));
  assert.equal(blocked.status, 403, 'pending tutor must not access the tutor panel');

  const pending = await request(app).get('/api/v1/admin/tutors?status=pending').set(auth(state.admin));
  assert.equal(pending.body.data.tutors.length, 1);
  const approve = await request(app).patch(`/api/v1/admin/tutors/${state.tutorId}/approval`).set(auth(state.admin)).send({ action: 'approve' });
  assert.equal(approve.status, 200);
  const dash = await request(app).get('/api/v1/tutor/dashboard').set(auth(state.tutor));
  assert.equal(dash.status, 200);

  const second = await request(app).post('/api/v1/auth/register').send({ first_name: 'Other', email: 'tutor2@test.local', password: 'Tutor12345', role: 'tutor' });
  await request(app).patch(`/api/v1/admin/tutors/${second.body.data.user.id}/approval`).set(auth(state.admin)).send({ action: 'approve' });
  state.tutor2 = await login('tutor2@test.local', 'Tutor12345');

  const studentReg = await request(app).post('/api/v1/auth/register').send({ first_name: 'Sam', last_name: 'Student', email: 'student@test.local', password: 'Student123', phone: '9876543210' });
  assert.equal(studentReg.status, 201);
  state.studentId = studentReg.body.data.user.id;
  state.student = studentReg.body.data.token;

  const other = await request(app).post('/api/v1/auth/register').send({ first_name: 'Nora', email: 'nobody@test.local', password: 'Student123' });
  state.outsider = other.body.data.token;

  const forbidden = await request(app).get('/api/v1/admin/dashboard').set(auth(state.student));
  assert.equal(forbidden.status, 403);

  const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'student@test.local' });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.data, undefined, 'reset token must never be returned in the response');
});

test('email verification link works without a frontend (GET) and via API (POST)', async () => {
  const { EmailVerification, User } = await import('../models/index.js');
  const { hashToken } = await import('../utils/helpers.js');
  const token = 'a'.repeat(64);
  await EmailVerification.create({ user_id: state.studentId, token: hashToken(token), expires_at: new Date(Date.now() + 3600000) });

  const page = await request(app).get(`/api/v1/auth/verify-email?token=${token}`);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /Email verified/);
  assert.ok((await User.findByPk(state.studentId)).email_verified_at, 'user marked verified');

  const again = await request(app).get(`/api/v1/auth/verify-email?token=${token}`);
  assert.equal(again.status, 200, 'opening the link twice is not an error');
  assert.match(again.text, /already verified/);

  const bad = await request(app).get('/api/v1/auth/verify-email?token=nope');
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Invalid link/);

  const expiredToken = 'b'.repeat(64);
  await EmailVerification.create({ user_id: state.studentId, token: hashToken(expiredToken), expires_at: new Date(Date.now() - 1000) });
  const expired = await request(app).post('/api/v1/auth/verify-email').send({ token: expiredToken });
  assert.equal(expired.status, 400);
  assert.match(expired.body.message, /expired/);
});

test('account: profile update and password change', async () => {
  const upd = await request(app).put('/api/v1/account/profile').set(auth(state.tutor)).send({ bio: 'Astrophysicist', linkedin_url: 'https://linkedin.com/in/tara', city: 'Pune' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.user.profile.bio, 'Astrophysicist');

  const bad = await request(app).put('/api/v1/account/password').set(auth(state.student)).send({ current_password: 'wrong', new_password: 'Student456' });
  assert.equal(bad.status, 400);
  const ok = await request(app).put('/api/v1/account/password').set(auth(state.student)).send({ current_password: 'Student123', new_password: 'Student456' });
  assert.equal(ok.status, 200);
  state.student = await login('student@test.local', 'Student456');
});

test('tutor course builder, videos, resources, quiz, project and admin approval', async () => {
  const cats = await request(app).get('/api/v1/public/categories');
  state.categoryId = cats.body.data.categories[0].id;

  const course = await request(app)
    .post('/api/v1/tutor/courses')
    .set(auth(state.tutor))
    .field('title', 'Intro to Black Holes')
    .field('category_id', String(state.categoryId))
    .field('price', '999')
    .field('discount_price', '499')
    .field('level', 'beginner');
  assert.equal(course.status, 201, course.body.message);
  assert.equal(course.body.data.course.status, 'draft');
  state.courseId = course.body.data.course.id;

  const notMine = await request(app).put(`/api/v1/tutor/courses/${state.courseId}`).set(auth(state.tutor2)).send({ title: 'Hijacked' });
  assert.equal(notMine.status, 403, 'tutors must not edit courses they are not assigned to');

  const section = await request(app).post(`/api/v1/tutor/courses/${state.courseId}/sections`).set(auth(state.tutor)).send({ title: 'Basics' });
  state.sectionId = section.body.data.section.id;
  const l1 = await request(app).post(`/api/v1/tutor/sections/${state.sectionId}/lectures`).set(auth(state.tutor)).send({ title: 'What is a black hole', lecture_type: 'video', is_preview: true });
  const l2 = await request(app).post(`/api/v1/tutor/sections/${state.sectionId}/lectures`).set(auth(state.tutor)).send({ title: 'Reading notes', lecture_type: 'text' });
  state.lecture1 = l1.body.data.lecture.id;
  state.lecture2 = l2.body.data.lecture.id;

  const video = await request(app)
    .post(`/api/v1/tutor/courses/${state.courseId}/videos`)
    .set(auth(state.tutor))
    .field('lecture_id', String(state.lecture1))
    .field('title', 'Black holes 101')
    .field('duration_seconds', '100')
    .attach('video_file', Buffer.alloc(4096, 7), { filename: 'lesson.mp4', contentType: 'video/mp4' });
  assert.equal(video.status, 201, video.body.message);
  state.videoId = video.body.data.video.id;
  assert.equal(video.body.data.video.lecture_id, state.lecture1);

  const res = await request(app)
    .post(`/api/v1/tutor/courses/${state.courseId}/resources`)
    .set(auth(state.tutor))
    .field('title', 'Notes')
    .field('lecture_id', String(state.lecture2))
    .attach('resource_file', Buffer.from('notes'), { filename: 'notes.txt', contentType: 'text/plain' });
  assert.equal(res.status, 201, res.body.message);
  state.resourceId = res.body.data.resource.id;

  const badQuiz = await request(app)
    .post(`/api/v1/tutor/courses/${state.courseId}/quizzes`)
    .set(auth(state.tutor))
    .send({ title: 'Bad', questions: [{ question: 'Q', answers: [{ answer_text: 'a', is_correct: true }, { answer_text: 'b', is_correct: true }] }] });
  assert.equal(badQuiz.status, 422, 'single-choice question with two correct answers must be rejected');

  const quiz = await request(app)
    .post(`/api/v1/tutor/courses/${state.courseId}/quizzes`)
    .set(auth(state.tutor))
    .send({
      title: 'Checkpoint',
      status: 'published',
      passing_percentage: 50,
      max_attempts: 2,
      questions: [
        { question: 'Light escapes a black hole?', question_type: 'true_false', correct_answer: false, marks: 1 },
        { question: 'Pick the compact objects', question_type: 'multiple', marks: 2, answers: [{ answer_text: 'Neutron star', is_correct: true }, { answer_text: 'Black hole', is_correct: true }, { answer_text: 'Comet', is_correct: false }] }
      ]
    });
  assert.equal(quiz.status, 201, quiz.body.message);
  assert.equal(Number(quiz.body.data.quiz.total_marks), 3);
  state.quiz = quiz.body.data.quiz;

  const project = await request(app).post(`/api/v1/tutor/courses/${state.courseId}/projects`).set(auth(state.tutor)).send({ title: 'Final project', instructions: 'Write a report', allowed_file_types: ['pdf', 'zip'] });
  assert.equal(project.status, 201);
  state.projectId = project.body.data.project.id;

  const hidden = await request(app).get(`/api/v1/public/courses/${state.courseId}`);
  assert.equal(hidden.status, 404, 'draft course must not be public');

  const submit = await request(app).post(`/api/v1/tutor/courses/${state.courseId}/submit`).set(auth(state.tutor));
  assert.equal(submit.status, 200);
  const publish = await request(app).patch(`/api/v1/admin/courses/${state.courseId}/approval`).set(auth(state.admin)).send({ action: 'publish' });
  assert.equal(publish.status, 200);

  const pub = await request(app).get(`/api/v1/public/courses/${state.courseId}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.course.lecture_count, 2);
  assert.equal(pub.body.data.course.effective_price, 499);
  const list = await request(app).get('/api/v1/public/courses?search=Black');
  assert.equal(list.body.data.courses.length, 1);
  const home = await request(app).get('/api/v1/public/home');
  assert.equal(home.status, 200);
  const tutors = await request(app).get('/api/v1/public/tutors');
  assert.equal(tutors.body.data.tutors.length, 1);
});

test('access control: un-enrolled users cannot reach content; private files are not public', async () => {
  const lecture = await request(app).get(`/api/v1/student/lectures/${state.lecture2}`).set(auth(state.outsider));
  assert.equal(lecture.status, 403);
  const preview = await request(app).get(`/api/v1/student/lectures/${state.lecture1}`).set(auth(state.outsider));
  assert.equal(preview.status, 200, 'preview lectures are open to logged-in users');
  const live = await request(app).get('/api/v1/community/feed').set(auth(state.outsider));
  assert.equal(live.status, 403, 'community requires a purchase');
  const staticVideo = await request(app).get('/uploads/videos/anything.mp4');
  assert.equal(staticVideo.status, 404);
  const badStream = await request(app).get(`/api/v1/media/videos/${state.videoId}/stream?token=nope`);
  assert.equal(badStream.status, 401);
});

test('cart, coupon, free checkout and enrollment', async () => {
  const coupon = await request(app)
    .post('/api/v1/admin/coupons')
    .set(auth(state.admin))
    .send({ code: 'free100', discount_type: 'percentage', discount_value: 100, expires_at: new Date(Date.now() + 86400000).toISOString(), usage_limit: 5 });
  assert.equal(coupon.status, 201, coupon.body.message);
  assert.equal(coupon.body.data.coupon.code, 'FREE100');
  state.couponId = coupon.body.data.coupon.id;

  await request(app).post('/api/v1/student/wishlist').set(auth(state.student)).send({ course_id: state.courseId }).expect(201);
  const moved = await request(app).post(`/api/v1/student/wishlist/${state.courseId}/move-to-cart`).set(auth(state.student));
  assert.equal(moved.body.data.cart.item_count, 1);
  assert.equal(moved.body.data.cart.subtotal, 499);

  const badCoupon = await request(app).post('/api/v1/student/cart/apply-coupon').set(auth(state.student)).send({ code: 'NOPE' });
  assert.equal(badCoupon.status, 400);
  const applied = await request(app).post('/api/v1/student/cart/apply-coupon').set(auth(state.student)).send({ code: 'FREE100' });
  assert.equal(applied.body.data.cart.total_amount, 0);

  const checkout = await request(app).post('/api/v1/student/checkout').set(auth(state.student)).send({ coupon_code: 'FREE100' });
  assert.equal(checkout.status, 201, checkout.body.message);
  assert.equal(checkout.body.data.is_free, true);
  assert.equal(checkout.body.data.order.status, 'paid');

  const couponAfter = await request(app).get(`/api/v1/admin/coupons/${state.couponId}`).set(auth(state.admin));
  assert.equal(couponAfter.body.data.coupon.usage_count, 1);
  assert.equal(couponAfter.body.data.usages.length, 1);

  const again = await request(app).post('/api/v1/student/cart').set(auth(state.student)).send({ course_id: state.courseId });
  assert.equal(again.status, 409, 'cannot add an owned course to the cart');

  const mine = await request(app).get('/api/v1/student/courses').set(auth(state.student));
  assert.equal(mine.body.data.enrollments.length, 1);
  const orders = await request(app).get('/api/v1/student/orders').set(auth(state.student));
  assert.equal(orders.body.data.orders.length, 1);
});

test('paid checkout is blocked without gateway config; forged payment verification is rejected', async () => {
  const course2 = await request(app).post('/api/v1/admin/courses').set(auth(state.admin)).field('title', 'Paid course').field('category_id', String(state.categoryId)).field('price', '100').field('status', 'published').field('tutor_id', String(state.tutorId));
  assert.equal(course2.status, 201, course2.body.message);
  state.course2 = course2.body.data.course.id;
  await request(app).post('/api/v1/student/cart').set(auth(state.student)).send({ course_id: state.course2 }).expect(201);
  const checkout = await request(app).post('/api/v1/student/checkout').set(auth(state.student)).send({});
  assert.equal(checkout.status, 503, 'no Razorpay keys -> payments unavailable');

  const forged = await request(app).post('/api/v1/student/payments/verify').set(auth(state.student)).send({ razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'sig' });
  assert.equal(forged.status, 404);

  // Admin marks the (failed) order as paid offline, then refunds it.
  const orders = await request(app).get('/api/v1/admin/orders?status=failed').set(auth(state.admin));
  const orderId = orders.body.data.orders[0].id;
  const paid = await request(app).patch(`/api/v1/admin/orders/${orderId}/status`).set(auth(state.admin)).send({ status: 'paid', payment_method: 'bank_transfer', transaction_reference: 'UTR123' });
  assert.equal(paid.status, 200, paid.body.message);
  let enrolled = await request(app).get(`/api/v1/student/courses/${state.course2}/learn`).set(auth(state.student));
  assert.equal(enrolled.status, 200);
  const refund = await request(app).post(`/api/v1/admin/orders/${orderId}/refund`).set(auth(state.admin)).send({ reason: 'test' });
  assert.equal(refund.status, 200, refund.body.message);
  enrolled = await request(app).get(`/api/v1/student/courses/${state.course2}/learn`).set(auth(state.student));
  assert.equal(enrolled.status, 403, 'refund revokes access');
});

test('learning: video streaming, 90% completion tracking and progress', async () => {
  const player = await request(app).get(`/api/v1/student/courses/${state.courseId}/learn`).set(auth(state.student));
  assert.equal(player.status, 200);
  assert.equal(player.body.data.curriculum[0].lectures.length, 2);

  const lecture = await request(app).get(`/api/v1/student/lectures/${state.lecture1}`).set(auth(state.student));
  const streamUrl = lecture.body.data.video.stream_url;
  assert.match(streamUrl, /\/api\/v1\/media\/videos\/\d+\/stream\?token=/);
  const stream = await request(app).get(streamUrl).set('Range', 'bytes=0-1023');
  assert.equal(stream.status, 206);
  assert.equal(stream.headers['content-range'], 'bytes 0-1023/4096');

  const tokenAsLogin = await request(app).get('/api/v1/auth/me').set(auth(new URL(`http://x${streamUrl}`).searchParams.get('token')));
  assert.equal(tokenAsLogin.status, 401, 'media tokens are not session tokens');

  // Watch tracking still ticks lectures (resume / checkmarks) but does not change course %.
  let p = await request(app).post(`/api/v1/student/lectures/${state.lecture1}/progress`).set(auth(state.student)).send({ watched_seconds: 50, completed: true });
  assert.equal(p.body.data.lecture_progress.completed, false, 'video lecture needs 90% watched');
  p = await request(app).post(`/api/v1/student/lectures/${state.lecture1}/progress`).set(auth(state.student)).send({ watched_seconds: 91 });
  assert.equal(p.body.data.lecture_progress.completed, true);
  assert.equal(p.body.data.course_progress.completion_percentage, 0, 'watch time alone does not add course progress');
  assert.equal(p.body.data.course_progress.status, 'not_started');

  // Phase 1: each play adds 10% ...
  let play = await request(app).post(`/api/v1/student/lectures/${state.lecture1}/play`).set(auth(state.student));
  assert.equal(play.status, 200, play.body.message);
  assert.equal(play.body.data.counted, true);
  assert.equal(play.body.data.increment_applied, 10);
  assert.equal(play.body.data.progress.completion_percentage, 10);
  assert.equal(play.body.data.progress.status, 'in_progress');
  // ... a repeat play of the same video within the cooldown window counts once
  play = await request(app).post(`/api/v1/student/lectures/${state.lecture1}/play`).set(auth(state.student));
  assert.equal(play.body.data.counted, false);
  assert.equal(play.body.data.reason, 'already_counted_recently');
  assert.equal(play.body.data.progress.completion_percentage, 10);

  const early = await request(app).post(`/api/v1/student/projects/${state.projectId}/submit`).set(auth(state.student)).attach('project_file', Buffer.from('%PDF'), { filename: 'report.pdf', contentType: 'application/pdf' });
  assert.equal(early.status, 403, 'project requires 90% progress');

  // With the cooldown disabled every click counts; progress caps at 90%.
  await request(app).put('/api/v1/admin/settings/general').set(auth(state.admin)).send({ progress_activity_cooldown_minutes: '0' }).expect(200);
  const videoId = lecture.body.data.video.id;
  for (let i = 0; i < 8; i += 1) {
    play = await request(app).post(`/api/v1/student/videos/${videoId}/play`).set(auth(state.student));
    assert.equal(play.body.data.counted, true);
  }
  assert.equal(play.body.data.progress.completion_percentage, 90);
  assert.equal(play.body.data.progress.status, 'project_unlocked');
  assert.equal(play.body.data.progress.can_submit_project, true);
  play = await request(app).post(`/api/v1/student/videos/${videoId}/play`).set(auth(state.student));
  assert.equal(play.body.data.counted, false);
  assert.equal(play.body.data.reason, 'cap_reached');
  assert.equal(play.body.data.progress.completion_percentage, 90, 'never above 90% without project approval');
  await request(app).put('/api/v1/admin/settings/general').set(auth(state.admin)).send({ progress_activity_cooldown_minutes: '10' }).expect(200);

  const { ProgressActivity, Notification } = await import('../models/index.js');
  assert.equal(await ProgressActivity.count({ where: { user_id: state.studentId } }), 9, 'only counted plays are stored');
  assert.ok(await Notification.findOne({ where: { user_id: state.studentId, type: 'project_unlocked' } }), 'student told the project is unlocked');

  const mine = await request(app).get('/api/v1/student/courses').set(auth(state.student));
  const enrolled = mine.body.data.enrollments.find((e) => e.course_id === state.courseId);
  assert.equal(enrolled.progress.status, 'project_unlocked');
  const playerAfter = await request(app).get(`/api/v1/student/courses/${state.courseId}/learn`).set(auth(state.student));
  assert.equal(playerAfter.body.data.progress.completion_percentage, 90);
  assert.equal(playerAfter.body.data.project.can_submit, true);

  const dl = await request(app).get(`/api/v1/student/resources/${state.resourceId}/download`).set(auth(state.student));
  assert.equal(dl.status, 200);
  const dash = await request(app).get('/api/v1/student/dashboard').set(auth(state.student));
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.overview.enrolled_courses >= 1, true);
});

test('quiz attempt, grading and attempt limits', async () => {
  const start = await request(app).post(`/api/v1/student/quizzes/${state.quiz.id}/start`).set(auth(state.student));
  assert.equal(start.status, 201, start.body.message);
  const questions = start.body.data.questions;
  assert.equal(questions[0].answers[0].is_correct, undefined, 'answer key must be hidden');

  const full = await request(app).get(`/api/v1/tutor/quizzes/${state.quiz.id}`).set(auth(state.tutor));
  const tf = full.body.data.quiz.questions.find((q) => q.question_type === 'true_false');
  const multi = full.body.data.quiz.questions.find((q) => q.question_type === 'multiple');
  const answers = [
    { question_id: tf.id, answer_id: tf.answers.find((a) => a.is_correct).id },
    { question_id: multi.id, answer_ids: multi.answers.filter((a) => a.is_correct).map((a) => a.id) }
  ];
  const submit = await request(app).post(`/api/v1/student/quiz-attempts/${start.body.data.attempt.id}/submit`).set(auth(state.student)).send({ answers });
  assert.equal(submit.status, 200, submit.body.message);
  assert.equal(submit.body.data.score, 3);
  assert.equal(submit.body.data.passed, true);

  const second = await request(app).post(`/api/v1/student/quizzes/${state.quiz.id}/submit`).set(auth(state.student)).send({ answers: [] });
  assert.equal(second.body.data.passed, false);
  const third = await request(app).post(`/api/v1/student/quizzes/${state.quiz.id}/start`).set(auth(state.student));
  assert.equal(third.status, 403, 'max_attempts enforced');

  const results = await request(app).get(`/api/v1/tutor/quizzes/${state.quiz.id}/results`).set(auth(state.tutor));
  assert.equal(results.body.data.summary.attempts, 2);
});

test('final project, tutor approval, certificate issue and download', async () => {
  const wrongType = await request(app).post(`/api/v1/student/projects/${state.projectId}/submit`).set(auth(state.student)).attach('project_file', Buffer.from('x'), { filename: 'report.txt', contentType: 'text/plain' });
  assert.equal(wrongType.status, 415);

  // Phase 2: submit at 90% -> Pending Approval
  const submit = await request(app).post(`/api/v1/student/projects/${state.projectId}/submit`).set(auth(state.student)).field('submission_note', 'Done!').attach('project_file', Buffer.from('%PDF-1.4'), { filename: 'report.pdf', contentType: 'application/pdf' });
  assert.equal(submit.status, 201, submit.body.message);
  assert.equal(submit.body.data.progress.status, 'pending_approval');
  assert.equal(submit.body.data.progress.status_label, 'Pending Approval');
  assert.equal(submit.body.data.progress.completion_percentage, 90, 'not 100% yet');
  const firstSubmissionId = submit.body.data.submission.id;

  const twice = await request(app).post(`/api/v1/student/projects/${state.projectId}/submit`).set(auth(state.student)).attach('project_file', Buffer.from('%PDF'), { filename: 'again.pdf', contentType: 'application/pdf' });
  assert.equal(twice.status, 409, 'cannot resubmit while pending');

  // Appears on tutor + admin dashboards
  const tutorDash = await request(app).get('/api/v1/tutor/dashboard').set(auth(state.tutor));
  assert.equal(tutorDash.body.data.overview.pending_project_reviews, 1);
  assert.equal(tutorDash.body.data.pending_project_approvals[0].id, firstSubmissionId);
  const adminDash = await request(app).get('/api/v1/admin/dashboard').set(auth(state.admin));
  assert.equal(adminDash.body.data.overview.pending_project_approvals, 1);
  assert.equal(adminDash.body.data.pending_project_approvals[0].student.id, state.studentId);
  const otherDash = await request(app).get('/api/v1/tutor/dashboard').set(auth(state.tutor2));
  assert.equal(otherDash.body.data.pending_project_approvals.length, 0, 'other tutors do not see it');

  const subs = await request(app).get('/api/v1/tutor/project-submissions?status=submitted').set(auth(state.tutor));
  assert.equal(subs.body.data.submissions.length, 1);
  const other = await request(app).get('/api/v1/tutor/project-submissions').set(auth(state.tutor2));
  assert.equal(other.body.data.submissions.length, 0, 'other tutors cannot see these submissions');
  const fileDl = await request(app).get(`/api/v1/tutor/project-submissions/${firstSubmissionId}/download`).set(auth(state.tutor));
  assert.equal(fileDl.status, 200);

  // Rejection: notify, stay at 90%, allow resubmit
  const noFeedback = await request(app).put(`/api/v1/tutor/project-submissions/${firstSubmissionId}/review`).set(auth(state.tutor)).send({ status: 'rejected' });
  assert.equal(noFeedback.status, 400, 'feedback required on rejection');
  const reject = await request(app).put(`/api/v1/tutor/project-submissions/${firstSubmissionId}/review`).set(auth(state.tutor)).send({ status: 'rejected', tutor_feedback: 'Add the conclusion section' });
  assert.equal(reject.status, 200, reject.body.message);
  assert.equal(reject.body.data.course_progress.completion_percentage, 90);
  assert.equal(reject.body.data.course_progress.status, 'resubmission_required');
  assert.equal(reject.body.data.course_progress.can_submit_project, true);
  const { Notification } = await import('../models/index.js');
  const rejectNote = await Notification.findOne({ where: { user_id: state.studentId, type: 'project_review' }, order: [['id', 'DESC']] });
  assert.match(rejectNote.message, /stays at 90%.*Add the conclusion section/);
  let certs = await request(app).get('/api/v1/student/certificates').set(auth(state.student));
  assert.equal(certs.body.data.certificates.length, 0, 'no certificate before approval');

  const resubmit = await request(app).post(`/api/v1/student/projects/${state.projectId}/submit`).set(auth(state.student)).attach('project_file', Buffer.from('%PDF-1.5'), { filename: 'report-v2.pdf', contentType: 'application/pdf' });
  assert.equal(resubmit.status, 201, resubmit.body.message);
  assert.equal(resubmit.body.data.progress.status, 'pending_approval');
  const submissionId = resubmit.body.data.submission.id;

  // Phase 3: approval -> 100% and certificate available immediately
  const review = await request(app).put(`/api/v1/tutor/project-submissions/${submissionId}/review`).set(auth(state.tutor)).send({ status: 'approved', tutor_feedback: 'Great work' });
  assert.equal(review.status, 200, review.body.message);
  assert.equal(review.body.data.course_progress.completion_percentage, 100);
  assert.equal(review.body.data.course_progress.status, 'completed');
  assert.equal(review.body.data.certificate.status, 'issued');

  certs = await request(app).get('/api/v1/student/certificates').set(auth(state.student));
  assert.equal(certs.body.data.certificates[0].status, 'issued');
  assert.equal(certs.body.data.certificates[0].is_downloadable, true);
  const certId = certs.body.data.certificates[0].id;
  const doneNote = await Notification.findOne({ where: { user_id: state.studentId, type: 'course_completed' } });
  assert.ok(doneNote, 'student notified about completion + certificate');

  const pdf = await request(app).get(`/api/v1/student/certificates/${certId}/download`).set(auth(state.student)).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  const verify = await request(app).get(`/api/v1/public/certificates/verify/${certs.body.data.certificates[0].certificate_number}`);
  assert.equal(verify.status, 200);
  assert.equal(verify.body.data.certificate.student_name, 'Sam Student');
});

test('live classes: scheduling, eligibility and join', async () => {
  const start = new Date(Date.now() + 5 * 60 * 1000);
  const create = await request(app)
    .post('/api/v1/tutor/live-classes')
    .set(auth(state.tutor))
    .send({ course_id: state.courseId, title: 'Q&A', scheduled_start: start.toISOString(), scheduled_end: new Date(start.getTime() + 3600000).toISOString(), zoom_join_url: 'https://zoom.us/j/123456', zoom_start_url: 'https://zoom.us/s/123456', password: 'abc' });
  assert.equal(create.status, 201, create.body.message);
  const classId = create.body.data.live_class.id;

  const list = await request(app).get('/api/v1/student/live-classes').set(auth(state.student));
  assert.equal(list.body.data.live_classes.length, 1);
  assert.equal(list.body.data.live_classes[0].zoom_start_url, undefined, 'host link hidden from students');
  assert.equal(list.body.data.live_classes[0].can_join, true);

  const outsider = await request(app).post(`/api/v1/student/live-classes/${classId}/join`).set(auth(state.outsider));
  assert.equal(outsider.status, 403);
  const join = await request(app).post(`/api/v1/student/live-classes/${classId}/join`).set(auth(state.student));
  assert.equal(join.status, 200);
  assert.equal(join.body.data.join_url, 'https://zoom.us/j/123456');
  assert.equal(join.body.data.progress_counted, false, 'course already completed - nothing more to add');
  assert.equal(join.body.data.progress.completion_percentage, 100);

  // Joining a live class adds the increment for a student still in progress.
  const learner = await request(app).post('/api/v1/auth/register').send({ first_name: 'Lee', email: 'lee@test.local', password: 'Student123' });
  await request(app).post(`/api/v1/admin/students/${learner.body.data.user.id}/enrollments`).set(auth(state.admin)).send({ course_id: state.courseId }).expect(201);
  const leeJoin = await request(app).post(`/api/v1/student/live-classes/${classId}/join`).set(auth(learner.body.data.token));
  assert.equal(leeJoin.status, 200, leeJoin.body.message);
  assert.equal(leeJoin.body.data.progress_counted, true);
  assert.equal(leeJoin.body.data.progress.completion_percentage, 10);
  const leeAgain = await request(app).post(`/api/v1/student/live-classes/${classId}/join`).set(auth(learner.body.data.token));
  assert.equal(leeAgain.body.data.progress_counted, false, 'rejoining the same class within the cooldown counts once');

  const done = await request(app).patch(`/api/v1/tutor/live-classes/${classId}/status`).set(auth(state.tutor)).send({ status: 'completed' });
  assert.equal(done.status, 200);
  const att = await request(app).get(`/api/v1/tutor/live-classes/${classId}/attendance`).set(auth(state.tutor));
  assert.equal(att.body.data.summary.joined, 2, 'Sam and Lee joined');
});

test('community, reviews and notifications', async () => {
  const post = await request(app).post('/api/v1/community/posts').set(auth(state.student)).send({ content: 'Hello everyone!', course_id: state.courseId });
  assert.equal(post.status, 201, post.body.message);
  const postId = post.body.data.post.id;
  const comment = await request(app).post(`/api/v1/community/posts/${postId}/comments`).set(auth(state.tutor)).send({ content: 'Welcome!' });
  assert.equal(comment.status, 201);
  const like = await request(app).post(`/api/v1/community/posts/${postId}/like`).set(auth(state.tutor));
  assert.equal(like.body.data.liked, true);
  const feed = await request(app).get('/api/v1/community/feed').set(auth(state.student));
  assert.equal(feed.body.data.posts[0].like_count, 1);
  assert.equal(feed.body.data.posts[0].comment_count, 1);
  const outsiderCourse = await request(app).get(`/api/v1/community/feed?course_id=${state.courseId}`).set(auth(state.tutor2));
  assert.equal(outsiderCourse.status, 403, 'course discussions limited to that course');

  const hide = await request(app).patch(`/api/v1/admin/community/posts/${postId}/status`).set(auth(state.admin)).send({ status: 'hidden', reason: 'test' });
  assert.equal(hide.status, 200);

  const review = await request(app).post(`/api/v1/student/courses/${state.courseId}/review`).set(auth(state.student)).send({ rating: 5, review: 'Loved it' });
  assert.equal(review.status, 201);
  let pub = await request(app).get(`/api/v1/public/courses/${state.courseId}/reviews`);
  assert.equal(pub.body.data.reviews.length, 0, 'pending reviews are not public');
  await request(app).patch(`/api/v1/admin/reviews/${review.body.data.review.id}/moderate`).set(auth(state.admin)).send({ status: 'approved' }).expect(200);
  pub = await request(app).get(`/api/v1/public/courses/${state.courseId}/reviews`);
  assert.equal(pub.body.data.reviews.length, 1);
  const tutorReviews = await request(app).get('/api/v1/tutor/reviews').set(auth(state.tutor));
  assert.equal(tutorReviews.body.data.summary.average_rating, 5);

  const notes = await request(app).get('/api/v1/notifications').set(auth(state.student));
  assert.ok(notes.body.data.unread_count > 0);
  await request(app).patch('/api/v1/notifications/read-all').set(auth(state.student)).expect(200);
  const after = await request(app).get('/api/v1/notifications/unread-count').set(auth(state.student));
  assert.equal(after.body.data.unread_count, 0);
});

test('admin: communications, broadcasts, reports, CMS, settings, earnings', async () => {
  const email = await request(app).post('/api/v1/admin/communications').set(auth(state.admin)).send({ channel: 'email', recipient_type: 'student', recipient_id: state.studentId, subject: 'Hi', message: 'Hello {{first_name}}' });
  assert.equal(email.status, 502, 'SMTP not configured -> recorded as failed');
  const history = await request(app).get('/api/v1/admin/communications').set(auth(state.admin));
  assert.equal(history.body.data.communications[0].status, 'failed');

  const broadcast = await request(app).post('/api/v1/admin/notifications').set(auth(state.admin)).send({ audience: 'all_students', title: 'Welcome', message: 'New term starts' });
  assert.equal(broadcast.status, 201);

  for (const type of ['student', 'tutor', 'course', 'sales']) {
    const r = await request(app).get(`/api/v1/admin/reports/${type}`).set(auth(state.admin));
    assert.equal(r.status, 200, `${type} report: ${r.body.message}`);
  }
  const exp = await request(app).post('/api/v1/admin/reports/sales/export').set(auth(state.admin)).send({});
  assert.equal(exp.status, 201);
  const csv = await request(app).get(exp.body.data.download_url).set(auth(state.admin));
  assert.equal(csv.status, 200);

  const page = await request(app).post('/api/v1/admin/cms/pages').set(auth(state.admin)).send({ title: 'Careers', content: '<p>Join us</p>', status: 'published' });
  assert.equal(page.status, 201);
  const pubPage = await request(app).get('/api/v1/public/pages/careers');
  assert.equal(pubPage.status, 200);
  const block = await request(app).put('/api/v1/admin/cms/contents/hero').set(auth(state.admin)).send({ title: 'New hero', data: { cta_label: 'Start' } });
  assert.equal(block.status, 200);
  assert.equal(block.body.data.content.data.cta_label, 'Start');

  const save = await request(app).put('/api/v1/admin/settings/payment').set(auth(state.admin)).send({ tax_percent: '18', razorpay_key_secret: 'secret_value_1234' });
  assert.equal(save.status, 200);
  assert.equal(save.body.data.settings.payment.razorpay_key_secret.value.endsWith('1234'), true);
  assert.equal(save.body.data.settings.payment.razorpay_key_secret.value.startsWith('*'), true, 'secrets are masked');
  const publicSettings = await request(app).get('/api/v1/public/settings');
  assert.equal(publicSettings.body.data.settings.razorpay_key_secret, undefined);

  state.razorpaySecret = 'secret_value_1234';

  const earnings = await request(app).get('/api/v1/tutor/earnings').set(auth(state.tutor));
  assert.equal(earnings.status, 200);
  const dash = await request(app).get('/api/v1/admin/dashboard').set(auth(state.admin));
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.overview.total_tutors, 2);
});

test('razorpay: signature-verified payment and webhook fulfil orders idempotently', async () => {
  const crypto = await import('node:crypto');
  const { Order, OrderItem, Payment, Enrollment } = await import('../models/index.js');
  const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

  // Simulate an order created by checkout (Razorpay order creation needs live keys).
  const makePendingOrder = async (suffix) => {
    const order = await Order.create({ user_id: state.studentId, order_number: `TEST-${suffix}`, subtotal: 100, total_amount: 100, status: 'pending' });
    await OrderItem.create({ order_id: order.id, course_id: state.course2, course_title: 'Paid course', price: 100, final_amount: 100 });
    await Payment.create({ order_id: order.id, user_id: state.studentId, payment_gateway: 'razorpay', gateway_order_id: `order_${suffix}`, amount: 100, status: 'created' });
    return order;
  };

  await makePendingOrder('A');
  const bad = await request(app).post('/api/v1/student/payments/verify').set(auth(state.student)).send({ razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A', razorpay_signature: 'forged' });
  assert.equal(bad.status, 400, 'forged signature rejected');

  const orderB = await makePendingOrder('B');
  const body = { razorpay_order_id: 'order_B', razorpay_payment_id: 'pay_B', razorpay_signature: hmac(state.razorpaySecret, 'order_B|pay_B') };
  const ok = await request(app).post('/api/v1/student/payments/verify').set(auth(state.student)).send(body);
  assert.equal(ok.status, 200, ok.body.message);
  assert.equal(ok.body.data.order.status, 'paid');
  const replay = await request(app).post('/api/v1/student/payments/verify').set(auth(state.student)).send(body);
  assert.equal(replay.status, 200, 'verification is idempotent');
  const enrollment = await Enrollment.findOne({ where: { user_id: state.studentId, course_id: state.course2 } });
  assert.equal(enrollment.status, 'active');
  assert.equal(enrollment.order_id, orderB.id);

  // Webhook path
  await request(app).put('/api/v1/admin/settings/payment').set(auth(state.admin)).send({ razorpay_webhook_secret: 'whsec_test' }).expect(200);
  const orderC = await makePendingOrder('C');
  const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_C', order_id: 'order_C', method: 'upi' } } } });
  const rejected = await request(app).post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'nope').send(event);
  assert.equal(rejected.status, 401);
  const hook = await request(app).post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', hmac('whsec_test', event)).send(event);
  assert.equal(hook.status, 200);
  await orderC.reload();
  assert.equal(orderC.status, 'paid');
  const payC = await Payment.findOne({ where: { gateway_order_id: 'order_C' } });
  assert.equal(payC.payment_method, 'upi');
});
