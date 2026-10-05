import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { UserSession, VideoPlayLog } from '../models/index.js';
import { deviceFromRequest } from '../utils/device.js';

/** last_seen_at is refreshed at most this often per session. */
const SEEN_INTERVAL_MS = 2 * 60 * 1000;

/** Records a login and returns the session key to embed in the JWT (`sid`). */
export const startSession = async (req, userId) => {
  const sessionKey = randomUUID();
  try {
    await UserSession.create({ user_id: userId, session_key: sessionKey, ...deviceFromRequest(req), login_at: new Date(), last_seen_at: new Date() });
  } catch (error) {
    // Tracking must never block a login.
    console.error('[Session] could not record login:', error.message);
  }
  return sessionKey;
};

/** Marks the session as active "now" (throttled). Fire-and-forget. */
export const touchSession = (sessionKey) => {
  if (!sessionKey) return;
  UserSession.update(
    { last_seen_at: new Date() },
    { where: { session_key: sessionKey, logout_at: null, last_seen_at: { [Op.lt]: new Date(Date.now() - SEEN_INTERVAL_MS) } } }
  ).catch(() => {});
};

/** Closes the session on logout. */
export const endSession = async (sessionKey) => {
  if (!sessionKey) return;
  await UserSession.update({ logout_at: new Date(), last_seen_at: new Date() }, { where: { session_key: sessionKey, logout_at: null } }).catch(() => {});
};

/** Logs a recorded-video play with the device it happened on. */
export const logVideoPlay = (req, video) => {
  const { device_type, os, browser } = deviceFromRequest(req);
  return VideoPlayLog.create({
    user_id: req.user.id,
    course_id: video.course_id,
    video_id: video.id,
    lecture_id: video.lecture_id || null,
    device_type,
    os,
    browser,
    played_at: new Date()
  }).catch((error) => console.error('[Session] could not log video play:', error.message));
};

export default { startSession, touchSession, endSession, logVideoPlay };
