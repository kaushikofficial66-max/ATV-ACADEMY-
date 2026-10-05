import express from 'express';
import {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  removeProfilePhoto,
  changePassword,
  getAccountSettings,
  changeEmail,
  deactivateAccount
} from '../controllers/accountController.js';
import { authenticate } from '../middlewares/auth.js';
import { uploadImage } from '../middlewares/upload.js';
import { validate } from '../middlewares/validate.js';
import { v } from './validators.js';

// Profile management, password & security, account settings - all roles.
const router = express.Router();
router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', uploadImage.single('profile_image'), validate(v.profile), updateProfile);
router.put('/profile-photo', uploadImage.single('profile_image'), updateProfilePhoto);
router.delete('/profile-photo', removeProfilePhoto);

router.put('/password', validate(v.changePassword), changePassword);

router.get('/settings', getAccountSettings);
router.put('/email', validate(v.changeEmail), changeEmail);
router.post('/deactivate', validate(v.passwordConfirm), deactivateAccount);

export default router;
