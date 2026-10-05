import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  verifyEmailLink,
  resendVerification,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { v } from './validators.js';

const router = express.Router();

// Brute-force protection for credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' }
});

router.post('/register', authLimiter, validate(v.register), register);
router.post('/login', authLimiter, validate(v.login), login);
router.post('/logout', logout);
router.post('/forgot-password', authLimiter, validate(v.email), forgotPassword);
router.post('/reset-password', authLimiter, validate(v.resetPassword), resetPassword);
router.post('/verify-email', validate(v.verifyEmailToken), verifyEmail);
router.get('/verify-email', verifyEmailLink); // link inside the verification email

router.get('/me', authenticate, getMe);
router.post('/resend-verification', authenticate, resendVerification);

export default router;
