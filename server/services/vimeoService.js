import fs from 'fs';
import axios from 'axios';
import { getGroupSettings } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Vimeo - storage, transcoding and playback of recorded course videos.
 *
 * Access token: Vimeo developer app > "Generate access token" with scopes
 * public, private, create, edit, delete, upload, video_files.
 *
 * Privacy (LMS videos must not be public on vimeo.com):
 *  - vimeo_privacy_view (default "disable") = hidden on vimeo.com, playable only when embedded
 *  - vimeo_embed_domains = comma-separated domains allowed to embed the player
 *    (e.g. "atvacademy.com,localhost"); empty = embeddable anywhere
 * The API only hands embed URLs to enrolled students / course staff.
 */

const API_BASE = () => process.env.VIMEO_API_BASE || 'https://api.vimeo.com';
const ACCEPT = 'application/vnd.vimeo.*+json;version=3.4';
const TUS_CHUNK_SIZE = 64 * 1024 * 1024;
const VIDEO_FIELDS =
  'uri,name,link,player_embed_url,duration,status,transcode.status,upload.status,upload.upload_link,pictures.base_link,pictures.sizes,privacy.view,privacy.embed';

export const getVimeoConfig = async () => {
  const cfg = await getGroupSettings('storage');
  return {
    token: cfg.vimeo_access_token,
    folderId: cfg.vimeo_folder_id,
    privacyView: cfg.vimeo_privacy_view || 'disable',
    embedDomains: String(cfg.vimeo_embed_domains || '')
      .split(',')
      .map((d) => d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean),
    directLinks: Boolean(cfg.vimeo_use_direct_links)
  };
};

export const isVimeoConfigured = async () => Boolean((await getVimeoConfig()).token);

const requireConfig = async () => {
  const cfg = await getVimeoConfig();
  if (!cfg.token) {
    throw new ApiError(503, 'Vimeo is not configured. Add VIMEO_ACCESS_TOKEN to .env or Admin > Settings > Storage.');
  }
  return cfg;
};

const vimeoError = (error, action) => {
  const data = error.response?.data;
  const msg = data?.developer_message || data?.error || error.message;
  const status = error.response?.status;
  return new ApiError(status === 404 ? 404 : 502, `Vimeo ${action} failed${status ? ` (${status})` : ''}: ${msg}`);
};

const api = async (method, path, { data, params, action, timeout = 30000 } = {}) => {
  const cfg = await requireConfig();
  try {
    const res = await axios({
      method,
      url: `${API_BASE()}${path}`,
      data,
      params,
      headers: { Authorization: `bearer ${cfg.token}`, Accept: ACCEPT, 'Content-Type': 'application/json' },
      timeout
    });
    return res.data;
  } catch (error) {
    throw vimeoError(error, action || `${method.toUpperCase()} ${path}`);
  }
};

/** "/videos/123456789" -> "123456789" */
export const videoIdFromUri = (uri) => String(uri || '').split('/').filter(Boolean).pop();

/**
 * Extracts the numeric id from any Vimeo URL / id:
 * 123456789, https://vimeo.com/123456789, https://vimeo.com/123456789/abcdef,
 * https://player.vimeo.com/video/123456789?h=abcdef, /videos/123456789
 */
export const parseVimeoId = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) return str;
  const match = str.match(/(?:vimeo\.com\/(?:.*?\/)?(?:video\/)?|\/videos\/)(\d{5,})/i);
  return match ? match[1] : null;
};

export const isVimeoUrl = (value) => /(^|\/\/)(www\.|player\.)?vimeo\.com\//i.test(String(value || ''));

const privacyPayload = (cfg) => ({
  view: cfg.privacyView,
  embed: cfg.embedDomains.length ? 'whitelist' : 'public',
  download: false,
  add: false,
  comments: 'nobody'
});

/**
 * Puts a video into the configured Vimeo folder (VIMEO_FOLDER_ID). Never throws:
 * returns { moved } | { skipped } | { moved: false, error }. Vimeo only allows this when the access
 * token has the "interact" scope, so a 403 gets an explicit hint instead of a silent miss.
 */
export const moveToConfiguredFolder = async (videoId) => {
  const cfg = await getVimeoConfig();
  if (!cfg.folderId) return { moved: false, skipped: true };
  try {
    await api('put', `/me/projects/${encodeURIComponent(cfg.folderId)}/videos/${videoId}`, { action: 'move to folder' });
    return { moved: true };
  } catch (error) {
    const hint = /interact/i.test(error.message) ? " Create a new Vimeo access token that also has the 'interact' scope and set it as VIMEO_ACCESS_TOKEN." : '';
    console.warn(`[Vimeo]: video ${videoId} was NOT moved into folder ${cfg.folderId}: ${error.message}.${hint}`);
    return { moved: false, error: `${error.message}.${hint}` };
  }
};

/** Applies embed-domain whitelist and folder after creation (best effort, never throws). */
const finishVideoSetup = async (videoId, cfg) => {
  for (const domain of cfg.embedDomains) {
    try {
      await api('put', `/videos/${videoId}/privacy/domains/${encodeURIComponent(domain)}`, { action: `allow embed domain ${domain}` });
    } catch (error) {
      console.warn(`[Vimeo]: ${error.message}`);
    }
  }
  await moveToConfiguredFolder(videoId);
};

/** Creates a Vimeo video placeholder with a tus upload link. */
const createTusVideo = async ({ size, name, description }) => {
  const cfg = await requireConfig();
  const data = await api('post', '/me/videos', {
    action: 'upload (create)',
    data: {
      upload: { approach: 'tus', size: String(size) },
      name: String(name || 'Course video').slice(0, 128),
      ...(description && { description: String(description).slice(0, 5000) }),
      privacy: privacyPayload(cfg)
    }
  });
  const videoId = videoIdFromUri(data.uri);
  await finishVideoSetup(videoId, cfg);
  return { videoId, uploadLink: data.upload?.upload_link, details: data };
};

/**
 * Uploads a local file to Vimeo (tus, resumable, any size).
 * Returns { videoId, embedUrl, link }.
 */
export const uploadVideoFile = async (filePath, { name, description } = {}) => {
  const size = (await fs.promises.stat(filePath)).size;
  const { videoId, uploadLink, details } = await createTusVideo({ size, name, description });
  if (!uploadLink) throw new ApiError(502, 'Vimeo did not return an upload link.');

  const handle = await fs.promises.open(filePath, 'r');
  try {
    let offset = 0;
    while (offset < size) {
      const length = Math.min(TUS_CHUNK_SIZE, size - offset);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      try {
        const res = await axios.patch(uploadLink, buffer, {
          headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream', Accept: ACCEPT },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 10 * 60 * 1000
        });
        offset = Number(res.headers['upload-offset'] ?? offset + length);
      } catch (error) {
        throw vimeoError(error, `upload (chunk at byte ${offset})`);
      }
    }
  } finally {
    await handle.close();
  }
  return { videoId, embedUrl: details.player_embed_url, link: details.link };
};

/**
 * Direct browser upload: creates the Vimeo video and returns its tus upload
 * link. The browser uploads with tus-js-client:
 *   new tus.Upload(file, { uploadUrl: upload.url, chunkSize: 64 * 1024 * 1024 })
 */
export const createDirectUpload = async ({ size, name, description }) => {
  if (!size || Number(size) <= 0) throw ApiError.badRequest('upload_length (file size in bytes) is required for Vimeo direct uploads.');
  const { videoId, uploadLink, details } = await createTusVideo({ size, name, description });
  return {
    method: 'tus',
    url: uploadLink,
    video_id: videoId,
    embed_url: details.player_embed_url,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
};

export const getVideoDetails = async (videoId) =>
  api('get', `/videos/${encodeURIComponent(videoId)}`, { params: { fields: VIDEO_FIELDS }, action: 'lookup' });

export const deleteVimeoVideo = async (videoId) => {
  try {
    await api('delete', `/videos/${encodeURIComponent(videoId)}`, { action: 'delete' });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
};

const FAILED_STATES = ['uploading_error', 'transcoding_error', 'quota_exceeded', 'total_cap_exceeded'];

/** Picks a thumbnail around 640px wide. */
const pickThumbnail = (pictures) => {
  const sizes = pictures?.sizes || [];
  if (!sizes.length) return pictures?.base_link || null;
  const sorted = [...sizes].sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
  return sorted[0].link;
};

/** Maps a Vimeo video object to recorded_videos fields. */
export const mapVimeoState = (details) => {
  const state = details?.status;
  const transcode = details?.transcode?.status;
  const upload = details?.upload?.status;
  let status = 'processing';
  if (FAILED_STATES.includes(state) || transcode === 'error' || upload === 'error') status = 'failed';
  else if (state === 'available' && (!transcode || transcode === 'complete')) status = 'ready';
  return {
    status,
    duration_seconds: details?.duration > 0 ? Math.round(details.duration) : null,
    embed_url: details?.player_embed_url || null,
    link: details?.link || null,
    thumbnail_url: pickThumbnail(details?.pictures),
    error: status === 'failed' ? `Vimeo status: ${state || transcode || upload}` : null
  };
};

/** Adds player parameters suited to an LMS (no title/byline overlays, no tracking). */
export const playerUrl = (embedUrl) => {
  if (!embedUrl) return null;
  const url = new URL(embedUrl);
  for (const [k, v] of Object.entries({ title: '0', byline: '0', portrait: '0', badge: '0', dnt: '1', autopause: '0' })) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.toString();
};

/**
 * Optional time-limited HLS / MP4 links for a custom player (Vimeo plan with
 * file access required). Returns null when not available.
 */
export const getDirectPlayLinks = async (videoId) => {
  try {
    const data = await api('get', `/videos/${encodeURIComponent(videoId)}`, { params: { fields: 'play' }, action: 'play links' });
    const hls = data.play?.hls?.link || null;
    const progressive = (data.play?.progressive || []).sort((a, b) => (b.height || 0) - (a.height || 0));
    return {
      hls_url: hls,
      mp4_url: progressive[0]?.link || null,
      expires_at: data.play?.hls?.link_expiration_time || progressive[0]?.link_expiration_time || null
    };
  } catch {
    return null;
  }
};

/** Cheap credential check used by Admin > Settings > Storage > Test. */
export const testVimeoConnection = async () => {
  const data = await api('get', '/oauth/verify', { action: 'connection test' });
  const cfg = await getVimeoConfig();
  // "interact" is what lets the server place uploads into the folder VIMEO_FOLDER_ID.
  const required = ['upload', 'edit', 'delete', 'private', ...(cfg.folderId ? ['interact'] : [])];
  const missing = required.filter((s) => !String(data.scope || '').split(' ').includes(s));
  return {
    ok: missing.length === 0,
    account: data.user?.account || null,
    user: data.user?.name || null,
    scopes: data.scope,
    ...(missing.length && { error: `Access token is missing scopes: ${missing.join(', ')}` }),
    free_space_bytes: data.user?.upload_quota?.space?.free ?? null
  };
};

export default {
  getVimeoConfig,
  isVimeoConfigured,
  parseVimeoId,
  isVimeoUrl,
  videoIdFromUri,
  uploadVideoFile,
  createDirectUpload,
  getVideoDetails,
  deleteVimeoVideo,
  mapVimeoState,
  playerUrl,
  getDirectPlayLinks,
  moveToConfiguredFolder,
  testVimeoConnection
};
