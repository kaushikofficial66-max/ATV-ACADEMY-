/**
 * Lightweight user-agent parsing (no dependency): device type, OS and browser.
 * Good enough for analytics ("watches on mobile vs laptop"), not fingerprinting.
 */
export const parseUserAgent = (ua = '') => {
  const s = String(ua || '');
  const lower = s.toLowerCase();

  let device_type = 'unknown';
  if (/ipad|tablet|kindle|silk|playbook/.test(lower) || (/android/.test(lower) && !/mobile/.test(lower))) device_type = 'tablet';
  else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(lower)) device_type = 'mobile';
  else if (/windows nt|macintosh|mac os x|x11|linux|cros/.test(lower)) device_type = 'desktop';

  let os = null;
  if (/windows nt/.test(lower)) os = 'Windows';
  else if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
  else if (/android/.test(lower)) os = 'Android';
  else if (/cros/.test(lower)) os = 'ChromeOS';
  else if (/mac os x|macintosh/.test(lower)) os = 'macOS';
  else if (/linux|x11/.test(lower)) os = 'Linux';

  let browser = null;
  if (/edg\//.test(lower)) browser = 'Edge';
  else if (/opr\/|opera/.test(lower)) browser = 'Opera';
  else if (/samsungbrowser/.test(lower)) browser = 'Samsung Internet';
  else if (/firefox|fxios/.test(lower)) browser = 'Firefox';
  else if (/chrome|crios/.test(lower)) browser = 'Chrome';
  else if (/safari/.test(lower)) browser = 'Safari';
  else if (/postman/.test(lower)) browser = 'Postman';

  return { device_type, os, browser };
};

/** Device info + IP + raw UA for an Express request. */
export const deviceFromRequest = (req) => ({
  ...parseUserAgent(req.headers['user-agent']),
  ip_address: (req.ip || '').replace(/^::ffff:/, '').slice(0, 45) || null,
  user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null
});

export default { parseUserAgent, deviceFromRequest };
