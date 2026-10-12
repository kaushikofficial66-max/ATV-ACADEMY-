import crypto from 'crypto';
import ApiError from '../utils/ApiError.js';
import { getSetting } from '../services/settingsService.js';

const MAX_SKEW_SECONDS = 5 * 60;

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** timestamp \n route \n key=value&key=value (keys sorted, values as received - no URL encoding). */
export const canonicalRequest = (timestamp, route, query = {}) =>
  [timestamp, route, Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join('&')].join('\n');

/**
 * Read-only access for the antarikshtv.com wp-admin (ATV Checkout plugin). The site signs each
 * request with ATV_SITE_WEBHOOK_SECRET:
 *   X-ATV-Timestamp: unix seconds (must be within 5 minutes - limits replay)
 *   X-ATV-Signature: hex HMAC-SHA256(secret, canonicalRequest(timestamp, route, query))
 * No LMS login is needed or stored on the website.
 */
export const verifySiteRequest = async (req, res, next) => {
  const secret = await getSetting('atv_site_webhook_secret');
  const timestamp = String(req.headers['x-atv-timestamp'] || '');
  const signature = String(req.headers['x-atv-signature'] || '').trim().toLowerCase();
  if (!secret || !signature || !/^\d{10}$/.test(timestamp)) throw ApiError.unauthorized('Invalid signature.');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) throw ApiError.unauthorized('Request expired.');
  const expected = crypto.createHmac('sha256', secret).update(canonicalRequest(timestamp, req.path, req.query)).digest('hex');
  if (!safeEqual(expected, signature)) throw ApiError.unauthorized('Invalid signature.');
  next();
};

export default verifySiteRequest;
