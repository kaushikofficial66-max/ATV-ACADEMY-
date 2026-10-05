import { sequelize, User, EmailVerification } from '../models/index.js';
import { randomToken, hashToken } from '../utils/helpers.js';
import { getSetting } from './settingsService.js';
import { sendVerificationEmail } from './mailService.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Public base URL of this API, used in links inside emails.
 * Uses the API_URL setting when set (recommended in production), otherwise
 * the host the current request came in on (e.g. http://localhost:5000).
 */
export const getApiBaseUrl = async (req) => {
  const configured = await getSetting('api_url');
  if (configured) return String(configured).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
};

/**
 * Creates a verification token and emails the link. The link points at
 * GET /api/v1/auth/verify-email on this API, so it works with or without a
 * frontend. Older unused links of the user are invalidated first (so a link
 * sent to a previous email address can no longer verify a new one).
 */
export const sendEmailVerification = async (user, req) => {
  await EmailVerification.destroy({ where: { user_id: user.id, verified_at: null } });
  const token = randomToken();
  await EmailVerification.create({
    user_id: user.id,
    token: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS)
  });
  const url = `${await getApiBaseUrl(req)}/api/v1/auth/verify-email?token=${token}`;
  return sendVerificationEmail(user, url);
};

/**
 * Consumes a verification token.
 * Returns { status: 'verified' | 'already_verified' | 'expired' | 'invalid', user? }.
 * Opening the same link twice (or a mail scanner pre-fetching it) reports
 * 'already_verified' instead of an error.
 */
export const consumeEmailVerification = async (rawToken) => {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) return { status: 'invalid' };

  const record = await EmailVerification.findOne({ where: { token: hashToken(rawToken) } });
  if (!record) return { status: 'invalid' };
  const user = await User.findByPk(record.user_id);
  if (!user) return { status: 'invalid' };

  if (record.verified_at) return { status: user.email_verified_at ? 'already_verified' : 'invalid', user };
  if (new Date(record.expires_at) < new Date()) return { status: 'expired', user };

  await sequelize.transaction(async (transaction) => {
    await record.update({ verified_at: new Date() }, { transaction });
    if (!user.email_verified_at) await user.update({ email_verified_at: new Date() }, { transaction });
  });
  return { status: 'verified', user };
};

export default { getApiBaseUrl, sendEmailVerification, consumeEmailVerification };
