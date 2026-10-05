import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
    return 'atv_academy_dev_only_secret_change_me';
  }
  return secret;
};

/**
 * Generate signed JWT token
 */
export const generateToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

/**
 * Verify and decode JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
};

/**
 * Short-lived, single-purpose token embedded in media URLs (e.g. a <video src>)
 * where an Authorization header cannot be sent. Not accepted as a login token.
 */
export const generateMediaToken = (userId, resourceType, resourceId, expiresIn = '4h') =>
  jwt.sign({ id: userId, purpose: 'media', rt: resourceType, rid: Number(resourceId) }, getSecret(), { expiresIn });

export const verifyMediaToken = (token, resourceType, resourceId) => {
  const decoded = verifyToken(token);
  if (!decoded || decoded.purpose !== 'media' || decoded.rt !== resourceType || Number(decoded.rid) !== Number(resourceId)) {
    return null;
  }
  return decoded;
};

export default {
  generateToken,
  verifyToken,
  generateMediaToken,
  verifyMediaToken
};
