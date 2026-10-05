import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Role, UserProfile } from '../models/index.js';
import { successResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/ApiError.js';
import { pick } from '../utils/helpers.js';
import { serializeUser } from '../utils/serializers.js';
import { recordFile, removeStoredFile } from '../services/storageService.js';
import { publicUrlFor } from '../middlewares/upload.js';
import { sendEmailVerification } from '../services/emailVerificationService.js';

const USER_FIELDS = ['first_name', 'last_name', 'phone'];
const PROFILE_FIELDS = [
  'bio',
  'date_of_birth',
  'gender',
  'address',
  'city',
  'state',
  'country',
  'postal_code',
  'website',
  'linkedin_url'
];

const loadAccount = (userId) =>
  User.findByPk(userId, {
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name'] },
      { model: UserProfile, as: 'profile' }
    ]
  });

/** GET /account/profile */
export const getProfile = async (req, res) => {
  const user = await loadAccount(req.user.id);
  return successResponse(res, { data: { user: serializeUser(user) } });
};

/**
 * PUT /account/profile
 * Personal + professional information (bio, website, LinkedIn for tutors).
 * Accepts an optional `profile_image` file (multipart).
 */
export const updateProfile = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  const userUpdates = pick(req.body, USER_FIELDS);
  const profileUpdates = pick(req.body, PROFILE_FIELDS);

  if (userUpdates.phone === '') userUpdates.phone = null;
  if (userUpdates.phone && userUpdates.phone !== user.phone) {
    const taken = await User.findOne({ where: { phone: userUpdates.phone, id: { [Op.ne]: user.id } }, attributes: ['id'] });
    if (taken) throw ApiError.conflict('This phone number is already used by another account.');
    userUpdates.phone_verified_at = null;
  }
  for (const key of Object.keys(profileUpdates)) {
    if (profileUpdates[key] === '') profileUpdates[key] = null;
  }

  const oldImage = user.profile_image;
  await sequelize.transaction(async (transaction) => {
    if (req.file) {
      await recordFile(req.file, { uploadedBy: user.id, entityType: 'user_avatar', entityId: user.id, transaction });
      userUpdates.profile_image = publicUrlFor(req.file);
    }
    if (Object.keys(userUpdates).length) await user.update(userUpdates, { transaction });
    const [profile] = await UserProfile.findOrCreate({ where: { user_id: user.id }, defaults: { user_id: user.id }, transaction });
    if (Object.keys(profileUpdates).length) await profile.update(profileUpdates, { transaction });
  });
  if (req.file && oldImage) await removeStoredFile(oldImage);

  return successResponse(res, {
    message: 'Profile updated successfully.',
    data: { user: serializeUser(await loadAccount(user.id)) }
  });
};

/** PUT /account/profile-photo (multipart: profile_image) */
export const updateProfilePhoto = async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please upload an image in the "profile_image" field.');
  const user = await User.findByPk(req.user.id);
  const oldImage = user.profile_image;
  await recordFile(req.file, { uploadedBy: user.id, entityType: 'user_avatar', entityId: user.id });
  await user.update({ profile_image: publicUrlFor(req.file) });
  if (oldImage) await removeStoredFile(oldImage);
  return successResponse(res, { message: 'Profile photo updated.', data: { profile_image: user.profile_image } });
};

/** DELETE /account/profile-photo */
export const removeProfilePhoto = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (user.profile_image) await removeStoredFile(user.profile_image);
  await user.update({ profile_image: null });
  return successResponse(res, { message: 'Profile photo removed.' });
};

/** PUT /account/password { current_password, new_password } */
export const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await User.findByPk(req.user.id);
  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    throw ApiError.badRequest('Current password is incorrect.');
  }
  if (await bcrypt.compare(new_password, user.password_hash)) {
    throw ApiError.badRequest('New password must be different from the current password.');
  }
  await user.update({ password_hash: await bcrypt.hash(new_password, 12) });
  return successResponse(res, { message: 'Password changed successfully.' });
};

/** GET /account/settings - security & account status overview */
export const getAccountSettings = async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [{ model: Role, as: 'role', attributes: ['name'] }] });
  return successResponse(res, {
    data: {
      email: user.email,
      phone: user.phone,
      email_verified: Boolean(user.email_verified_at),
      email_verified_at: user.email_verified_at,
      phone_verified: Boolean(user.phone_verified_at),
      status: user.status,
      role: user.role.name,
      last_login_at: user.last_login_at,
      member_since: user.created_at
    }
  });
};

/**
 * PUT /account/email { new_email, current_password }
 * Changing email requires the password and resets verification.
 */
export const changeEmail = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!(await bcrypt.compare(req.body.current_password, user.password_hash))) {
    throw ApiError.badRequest('Current password is incorrect.');
  }
  const newEmail = String(req.body.new_email).trim().toLowerCase();
  if (newEmail === user.email) throw ApiError.badRequest('This is already your email address.');
  if (await User.findOne({ where: { email: newEmail }, attributes: ['id'] })) {
    throw ApiError.conflict('An account with this email address already exists.');
  }

  await user.update({ email: newEmail, email_verified_at: null });
  // Also invalidates links sent to the previous address.
  const mail = await sendEmailVerification(user, req);

  return successResponse(res, {
    message: 'Email updated. Please verify your new email address.',
    data: { email: newEmail, verification_email_sent: mail.sent }
  });
};

/** POST /account/deactivate { current_password } - self-service deactivation (not deletion). */
export const deactivateAccount = async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [{ model: Role, as: 'role' }] });
  if (user.role.name === 'admin') throw ApiError.forbidden('Admin accounts cannot be self-deactivated.');
  if (!(await bcrypt.compare(req.body.current_password, user.password_hash))) {
    throw ApiError.badRequest('Current password is incorrect.');
  }
  await user.update({ status: 'inactive' });
  res.clearCookie('token');
  return successResponse(res, { message: 'Your account has been deactivated. Contact support to reactivate it.' });
};

export default {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  removeProfilePhoto,
  changePassword,
  getAccountSettings,
  changeEmail,
  deactivateAccount
};
