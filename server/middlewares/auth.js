import { verifyToken } from '../utils/jwt.js';
import { User, Role } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { touchSession } from '../services/sessionService.js';

const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
};

const USER_QUERY = {
  attributes: { exclude: ['password_hash'] },
  include: [{ model: Role, as: 'role', attributes: ['id', 'name', 'status'] }]
};

/**
 * Resolves the user for a session token. A "view as" token (`imp` claim) is
 * only honoured while the admin who issued it is still an active admin; the
 * admin is attached as `user.impersonator`.
 */
const loadUser = async (token) => {
  const decoded = verifyToken(token);
  // Purpose-scoped tokens (media links) are never valid as session tokens.
  if (!decoded || !decoded.id || decoded.purpose) return null;
  if (decoded.imp) {
    const admin = await User.findByPk(decoded.imp, USER_QUERY);
    if (!admin || admin.role?.name !== 'admin' || admin.status !== 'active') return null;
    const user = await User.findByPk(decoded.id, USER_QUERY);
    if (user) user.impersonator = admin;
    return user;
  }
  touchSession(decoded.sid);
  return User.findByPk(decoded.id, USER_QUERY);
};

/** Paths a read-only "view as" session may still call with POST etc. */
const PREVIEW_WRITE_ALLOWED = [/\/auth\/logout$/];

/** "View as" sessions are read-only: they never change the viewed user's data. */
const assertPreviewReadOnly = (req, user) => {
  if (!user.impersonator || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (PREVIEW_WRITE_ALLOWED.some((re) => re.test(req.originalUrl.split('?')[0]))) return;
  throw ApiError.forbidden('Read-only preview: admins viewing as another user cannot make changes.');
};

/**
 * Authentication Middleware
 * Validates JWT from Authorization header or cookie and attaches User model to req.user
 */
export const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required. Please log in to proceed.');

  const user = await loadUser(token);
  if (!user) throw ApiError.unauthorized('Invalid or expired authentication token. Please log in again.');

  if (user.status === 'blocked' || user.status === 'inactive') {
    throw ApiError.forbidden(`Your account is ${user.status}. Please contact support.`);
  }

  assertPreviewReadOnly(req, user);
  req.user = user;
  req.userRole = user.role ? user.role.name.toLowerCase() : null;
  req.impersonator = user.impersonator || null;
  next();
};

/**
 * Attaches req.user when a valid token is present, otherwise continues as guest.
 * Used on public pages that show extra info to logged-in users (e.g. "enrolled").
 */
export const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    const user = await loadUser(token);
    if (user && user.status !== 'blocked' && user.status !== 'inactive') {
      req.user = user;
      req.userRole = user.role ? user.role.name.toLowerCase() : null;
    }
  }
  next();
};

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param  {...string} roles Allowed roles ('student', 'tutor', 'admin')
 */
export const authorize = (...roles) => {
  const allowed = roles.map((r) => r.toLowerCase());
  return (req, res, next) => {
    if (!req.user || !req.userRole) throw ApiError.forbidden('Access denied: role not identified.');
    if (!allowed.includes(req.userRole)) {
      throw ApiError.forbidden(`Forbidden: requires [${roles.join(', ')}] role privileges.`);
    }
    next();
  };
};

/**
 * Tutors must be approved (status active) before using the tutor panel.
 */
export const requireActiveAccount = (req, res, next) => {
  if (req.user.status !== 'active') {
    throw ApiError.forbidden(
      req.userRole === 'tutor'
        ? 'Your tutor account is pending admin approval.'
        : 'Your account is not active yet. Please verify your email or contact support.'
    );
  }
  next();
};

export default {
  authenticate,
  optionalAuth,
  authorize,
  requireActiveAccount
};
