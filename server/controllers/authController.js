import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Role, UserProfile, PasswordReset, EmailVerification } from '../models/index.js';
import { generateToken, verifyToken } from '../utils/jwt.js';
import { successResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/ApiError.js';
import { randomToken, hashToken } from '../utils/helpers.js';
import { serializeUser } from '../utils/serializers.js';
import { getSetting } from '../services/settingsService.js';
import { sendPasswordResetEmail } from '../services/mailService.js';
import { notifyAdmins } from '../services/notificationService.js';
import { sendEmailVerification, consumeEmailVerification } from '../services/emailVerificationService.js';
import { renderMessagePage } from '../utils/htmlPage.js';
import { startSession, endSession } from '../services/sessionService.js';

const BCRYPT_ROUNDS = 12;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const userIncludes = [
  { model: Role, as: 'role', attributes: ['id', 'name'] },
  { model: UserProfile, as: 'profile' }
];

/** Records the login (device, IP) and issues the JWT; `sid` links the token to its session row. */
const issueSession = async (req, res, user) => {
  const sid = await startSession(req, user.id);
  const token = generateToken({ id: user.id, role: user.role.name, sid });
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE
  });
  return token;
};

const VERIFICATION_MESSAGES = {
  verified: { success: true, title: 'Email verified', message: 'Your email address has been verified. You can now log in to your account.' },
  already_verified: { success: true, title: 'Email already verified', message: 'This email address is already verified. You can log in to your account.' },
  expired: { success: false, title: 'Link expired', message: 'This verification link has expired. Log in and request a new verification email.' },
  invalid: { success: false, title: 'Invalid link', message: 'This verification link is invalid or has been replaced by a newer one. Use the most recent email, or request a new link.' }
};

/**
 * POST /auth/register
 * Students are active immediately; tutors wait for admin approval unless
 * the `auto_approve_tutors` setting is enabled.
 */
export const register = async (req, res) => {
  const { first_name, last_name, password, phone } = req.body;
  const email = String(req.body.email).trim().toLowerCase();
  const roleName = req.body.role === 'tutor' ? 'tutor' : 'student';

  if (await User.findOne({ where: { email }, attributes: ['id'] })) {
    throw ApiError.conflict('An account with this email address already exists.');
  }
  if (phone && (await User.findOne({ where: { phone }, attributes: ['id'] }))) {
    throw ApiError.conflict('An account with this phone number already exists.');
  }

  const role = await Role.findOne({ where: { name: roleName, status: 'active' } });
  if (!role) throw new ApiError(500, `Role "${roleName}" is not configured. Run the database seed.`);

  const autoApproveTutors = await getSetting('auto_approve_tutors');
  const status = roleName === 'tutor' && !autoApproveTutors ? 'pending' : 'active';

  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      {
        role_id: role.id,
        first_name: first_name.trim(),
        last_name: last_name ? last_name.trim() : null,
        email,
        phone: phone || null,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        status
      },
      { transaction }
    );
    await UserProfile.create({ user_id: created.id }, { transaction });
    return created;
  });

  const mail = await sendEmailVerification(user, req);

  if (roleName === 'tutor' && status === 'pending') {
    await notifyAdmins({
      title: 'New tutor application',
      message: `${user.first_name} ${user.last_name || ''} (${user.email}) registered as a tutor and is awaiting approval.`,
      type: 'tutor_application',
      reference_type: 'user',
      reference_id: user.id
    });
  }

  const fullUser = await User.findByPk(user.id, { include: userIncludes });
  const requireVerification = await getSetting('require_email_verification');
  const token = requireVerification ? null : await issueSession(req, res, fullUser);

  return successResponse(res, {
    statusCode: 201,
    message:
      roleName === 'tutor' && status === 'pending'
        ? 'Tutor account created. Your application is pending admin approval.'
        : requireVerification
          ? 'Account created. Please verify your email address to log in.'
          : 'Account created successfully.',
    data: {
      user: serializeUser(fullUser),
      token,
      verification_email_sent: mail.sent
    }
  });
};

/** POST /auth/login */
export const login = async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  const user = await User.findOne({ where: { email }, include: userIncludes });

  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (user.status === 'blocked' || user.status === 'inactive') {
    throw ApiError.forbidden(`Your account is ${user.status}. Please contact support.`);
  }
  if (!user.email_verified_at && user.role.name !== 'admin' && (await getSetting('require_email_verification'))) {
    throw new ApiError(403, 'Please verify your email address before logging in.', [{ field: 'email', code: 'EMAIL_NOT_VERIFIED' }]);
  }

  await user.update({ last_login_at: new Date() });
  const token = await issueSession(req, res, user);

  return successResponse(res, {
    message:
      user.status === 'pending' && user.role.name === 'tutor'
        ? 'Logged in. Your tutor account is pending admin approval.'
        : 'Login successful.',
    data: { user: serializeUser(user), token }
  });
};

/** POST /auth/logout */
export const logout = async (req, res) => {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.split(' ')[1] : req.cookies?.token;
  const decoded = token ? verifyToken(token) : null;
  if (decoded?.sid) await endSession(decoded.sid);
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return successResponse(res, { message: 'Logged out successfully.' });
};

/** GET /auth/me */
export const getMe = async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: userIncludes });
  const data = serializeUser(user);
  // Set during an admin "view as" session so the app can show the preview banner.
  if (req.impersonator) data.impersonated_by = { id: req.impersonator.id, first_name: req.impersonator.first_name, last_name: req.impersonator.last_name };
  return successResponse(res, { message: 'Profile retrieved successfully.', data: { user: data } });
};

/** POST /auth/verify-email { token } (or ?token=) - for a frontend page that reads the token and calls the API. */
export const verifyEmail = async (req, res) => {
  const { status } = await consumeEmailVerification(req.body?.token ?? req.query.token);
  const info = VERIFICATION_MESSAGES[status];
  if (!info.success) throw ApiError.badRequest(info.message);
  return successResponse(res, { message: info.title + '.', data: { status } });
};

/**
 * GET /auth/verify-email?token=... - the link inside the verification email.
 * Verifies the token and either redirects to EMAIL_VERIFICATION_REDIRECT_URL
 * (?status=...) or shows a confirmation page served by the API itself.
 */
export const verifyEmailLink = async (req, res) => {
  const { status } = await consumeEmailVerification(req.query.token);
  const info = VERIFICATION_MESSAGES[status];

  const redirectUrl = await getSetting('email_verification_redirect_url');
  if (redirectUrl) {
    const target = new URL(redirectUrl);
    target.searchParams.set('status', status);
    return res.redirect(302, target.toString());
  }

  res.status(info.success ? 200 : 400).type('html').send(
    renderMessagePage({ siteName: await getSetting('site_name'), title: info.title, message: info.message, success: info.success })
  );
};

/** POST /auth/resend-verification (authenticated) */
export const resendVerification = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (user.email_verified_at) return successResponse(res, { message: 'Your email is already verified.' });

  const recent = await EmailVerification.findOne({
    where: { user_id: user.id, created_at: { [Op.gte]: new Date(Date.now() - 60 * 1000) } }
  });
  if (recent) throw new ApiError(429, 'Please wait a minute before requesting another verification email.');

  const mail = await sendEmailVerification(user, req);
  if (!mail.sent) throw new ApiError(503, mail.error || 'Could not send verification email.');
  return successResponse(res, { message: 'Verification email sent.' });
};

/** POST /auth/forgot-password { email } - always responds the same to prevent enumeration. */
export const forgotPassword = async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  const user = await User.findOne({ where: { email } });

  if (user && user.status !== 'blocked') {
    await PasswordReset.update({ used_at: new Date() }, { where: { user_id: user.id, used_at: null } });
    const token = randomToken();
    await PasswordReset.create({
      user_id: user.id,
      token: hashToken(token),
      expires_at: new Date(Date.now() + 60 * 60 * 1000)
    });
    const frontendUrl = await getSetting('frontend_url');
    await sendPasswordResetEmail(user, `${frontendUrl}/reset-password?token=${token}`);
  }

  return successResponse(res, {
    message: 'If that email address is registered, a password reset link has been sent.'
  });
};

/** POST /auth/reset-password { token, new_password } */
export const resetPassword = async (req, res) => {
  const record = await PasswordReset.findOne({ where: { token: hashToken(req.body.token) } });
  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    throw ApiError.badRequest('Reset link is invalid or has expired.');
  }
  const user = await User.findByPk(record.user_id);
  if (!user) throw ApiError.notFound('User not found.');

  await sequelize.transaction(async (transaction) => {
    await user.update(
      {
        password_hash: await bcrypt.hash(req.body.new_password, BCRYPT_ROUNDS),
        // Proving control of the inbox also verifies the email.
        ...(!user.email_verified_at && { email_verified_at: new Date() })
      },
      { transaction }
    );
    await PasswordReset.update({ used_at: new Date() }, { where: { user_id: user.id, used_at: null }, transaction });
  });

  return successResponse(res, { message: 'Password has been reset successfully. You may now log in.' });
};

export default {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  verifyEmailLink,
  resendVerification,
  forgotPassword,
  resetPassword
};
