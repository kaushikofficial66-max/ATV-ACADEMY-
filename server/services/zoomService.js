import axios from 'axios';
import { getGroupSettings } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

const ZOOM_API = () => process.env.ZOOM_API_BASE || 'https://api.zoom.us/v2';
let tokenCache = { token: null, expiresAt: 0, key: '' };

export const isZoomConfigured = async () => {
  const cfg = await getGroupSettings('zoom');
  return Boolean(cfg.zoom_enabled && cfg.zoom_account_id && cfg.zoom_client_id && cfg.zoom_client_secret);
};

/** Server-to-Server OAuth access token (cached until shortly before expiry). */
const getAccessToken = async (cfg) => {
  const key = `${cfg.zoom_account_id}|${cfg.zoom_client_id}`;
  if (tokenCache.token && tokenCache.key === key && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const basic = Buffer.from(`${cfg.zoom_client_id}:${cfg.zoom_client_secret}`).toString('base64');
  const { data } = await axios.post(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.zoom_account_id)}`,
    null,
    { headers: { Authorization: `Basic ${basic}` }, timeout: 15000 }
  );
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000, key };
  return data.access_token;
};

const zoomRequest = async (method, path, body, { notFoundIsNull = false } = {}) => {
  const cfg = await getGroupSettings('zoom');
  if (!cfg.zoom_enabled || !cfg.zoom_account_id || !cfg.zoom_client_id || !cfg.zoom_client_secret) {
    throw new ApiError(400, 'Zoom is not configured. Configure it in Admin > Settings > Zoom, or enter meeting details manually.');
  }
  try {
    const token = await getAccessToken(cfg);
    const { data } = await axios({
      method,
      url: `${ZOOM_API()}${path}`,
      data: body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return { data, cfg };
  } catch (error) {
    if (notFoundIsNull && error.response?.status === 404) return { data: null, cfg };
    const msg = error.response?.data?.message || error.message;
    throw new ApiError(502, `Zoom API error: ${msg}`);
  }
};

const durationMinutes = (start, end) => Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000));

/** Creates a scheduled meeting and returns the fields stored on live_classes. */
export const createMeeting = async ({ title, description, scheduled_start, scheduled_end, timezone, password }) => {
  const cfg = await getGroupSettings('zoom');
  const { data } = await zoomRequest('post', `/users/${encodeURIComponent(cfg.zoom_host_user || 'me')}/meetings`, {
    topic: title.slice(0, 200),
    agenda: description ? description.slice(0, 2000) : undefined,
    type: 2,
    start_time: new Date(scheduled_start).toISOString(),
    duration: durationMinutes(scheduled_start, scheduled_end),
    timezone,
    ...(password && { password: String(password).slice(0, 10) }),
    settings: {
      join_before_host: false,
      waiting_room: true,
      mute_upon_entry: true,
      approval_type: 2,
      // Records the whole session to the Zoom cloud from the moment the host starts the meeting.
      ...(cfg.zoom_auto_record !== false && { auto_recording: 'cloud' })
    }
  });
  return {
    zoom_meeting_id: String(data.id),
    zoom_join_url: data.join_url,
    zoom_start_url: data.start_url,
    password: data.password || password || null,
    recording_status: cfg.zoom_auto_record !== false ? 'pending' : 'none'
  };
};

export const updateMeeting = async (meetingId, { title, description, scheduled_start, scheduled_end, timezone, ensureRecording = false }) => {
  await zoomRequest('patch', `/meetings/${encodeURIComponent(meetingId)}`, {
    ...(title && { topic: title.slice(0, 200) }),
    ...(description !== undefined && { agenda: (description || '').slice(0, 2000) }),
    ...(scheduled_start && { start_time: new Date(scheduled_start).toISOString() }),
    ...(scheduled_start && scheduled_end && { duration: durationMinutes(scheduled_start, scheduled_end) }),
    ...(timezone && { timezone }),
    ...(ensureRecording && { settings: { auto_recording: 'cloud' } })
  });
};

export const deleteMeeting = async (meetingId) => {
  try {
    await zoomRequest('delete', `/meetings/${encodeURIComponent(meetingId)}`);
  } catch (error) {
    console.warn(`[Zoom]: Could not delete meeting ${meetingId}: ${error.message}`);
  }
};

/** Fresh start_url for hosts (Zoom start URLs expire after ~2 hours). */
export const getMeetingStartUrl = async (meetingId) => {
  const { data } = await zoomRequest('get', `/meetings/${encodeURIComponent(meetingId)}`);
  return data.start_url;
};

/** Recording types that contain video, best first (the "complete session" view the students need). */
const VIDEO_TYPE_PREFERENCE = ['shared_screen_with_speaker_view', 'shared_screen_with_gallery_view', 'shared_screen', 'active_speaker', 'speaker_view', 'gallery_view'];

/**
 * Chooses which recording files to upload from Zoom's list.
 *  - only MP4 video (not audio-only, transcript, chat, timeline)
 *  - ONE view: the best of VIDEO_TYPE_PREFERENCE, so the same class is not uploaded three times
 *  - several files of that view mean the host stopped / restarted recording -> uploaded as parts, in order
 * Returns { state: 'ready', parts } | { state: 'processing' } | { state: 'no_video' }.
 */
export const pickRecordingFiles = (files = []) => {
  const mp4 = files.filter((f) => String(f.file_type).toUpperCase() === 'MP4' && f.download_url);
  if (!mp4.length) return { state: files.length ? 'no_video' : 'processing' };
  if (mp4.some((f) => f.status && f.status !== 'completed')) return { state: 'processing' };
  const rank = (f) => {
    const i = VIDEO_TYPE_PREFERENCE.indexOf(f.recording_type);
    return i === -1 ? VIDEO_TYPE_PREFERENCE.length : i;
  };
  const bestType = [...mp4].sort((a, b) => rank(a) - rank(b))[0].recording_type;
  const parts = mp4.filter((f) => f.recording_type === bestType).sort((a, b) => new Date(a.recording_start) - new Date(b.recording_start));
  return { state: 'ready', parts };
};

/** Cloud recordings of a meeting, or null when Zoom has none (yet). */
export const getMeetingRecordings = async (meetingId) => {
  const { data } = await zoomRequest('get', `/meetings/${encodeURIComponent(meetingId)}/recordings`, undefined, { notFoundIsNull: true });
  return data;
};

/** Streams one recording file from Zoom. Returns { stream, size }. */
export const openRecordingDownload = async (file) => {
  const cfg = await getGroupSettings('zoom');
  const token = await getAccessToken(cfg);
  try {
    const res = await axios.get(file.download_url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 60000
    });
    return { stream: res.data, size: Number(file.file_size) || Number(res.headers['content-length']) || 0 };
  } catch (error) {
    throw new ApiError(502, `Zoom recording download failed: ${error.response?.status || error.message}`);
  }
};

/** Moves a meeting's recordings to Zoom's trash (recoverable for 30 days). Never throws. */
export const trashMeetingRecordings = async (meetingId) => {
  try {
    await zoomRequest('delete', `/meetings/${encodeURIComponent(meetingId)}/recordings?action=trash`);
    return true;
  } catch (error) {
    console.warn(`[Zoom]: could not trash recordings of ${meetingId}: ${error.message}`);
    return false;
  }
};

export default { createMeeting, updateMeeting, deleteMeeting, getMeetingStartUrl, isZoomConfigured, pickRecordingFiles, getMeetingRecordings, openRecordingDownload, trashMeetingRecordings };
