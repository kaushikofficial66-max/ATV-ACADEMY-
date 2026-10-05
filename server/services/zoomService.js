import axios from 'axios';
import { getGroupSettings } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

const ZOOM_API = 'https://api.zoom.us/v2';
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

const zoomRequest = async (method, path, body) => {
  const cfg = await getGroupSettings('zoom');
  if (!cfg.zoom_enabled || !cfg.zoom_account_id || !cfg.zoom_client_id || !cfg.zoom_client_secret) {
    throw new ApiError(400, 'Zoom is not configured. Configure it in Admin > Settings > Zoom, or enter meeting details manually.');
  }
  try {
    const token = await getAccessToken(cfg);
    const { data } = await axios({
      method,
      url: `${ZOOM_API}${path}`,
      data: body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return { data, cfg };
  } catch (error) {
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
      approval_type: 2
    }
  });
  return {
    zoom_meeting_id: String(data.id),
    zoom_join_url: data.join_url,
    zoom_start_url: data.start_url,
    password: data.password || password || null
  };
};

export const updateMeeting = async (meetingId, { title, description, scheduled_start, scheduled_end, timezone }) => {
  await zoomRequest('patch', `/meetings/${encodeURIComponent(meetingId)}`, {
    ...(title && { topic: title.slice(0, 200) }),
    ...(description !== undefined && { agenda: (description || '').slice(0, 2000) }),
    ...(scheduled_start && { start_time: new Date(scheduled_start).toISOString() }),
    ...(scheduled_start && scheduled_end && { duration: durationMinutes(scheduled_start, scheduled_end) }),
    ...(timezone && { timezone })
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

export default { createMeeting, updateMeeting, deleteMeeting, getMeetingStartUrl, isZoomConfigured };
