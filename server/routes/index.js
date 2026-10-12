import express from 'express';
import authRoutes from './authRoutes.js';
import accountRoutes from './accountRoutes.js';
import publicRoutes from './publicRoutes.js';
import studentRoutes from './studentRoutes.js';
import tutorRoutes from './tutorRoutes.js';
import adminRoutes from './adminRoutes.js';
import communityRoutes from './communityRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import siteRoutes from './siteRoutes.js';
import { streamVideo } from '../controllers/mediaController.js';
import { validateIdParams } from '../middlewares/validate.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ATV Academy LMS API v1 is active',
    modules: [
      { path: '/auth', description: 'Registration, login/logout, email verification, forgot/reset password' },
      { path: '/account', description: 'Profile, profile photo, password change, account settings (all roles)' },
      { path: '/public', description: 'Homepage, course listing/details, tutor profiles, static pages, certificate verification' },
      { path: '/student', description: 'Dashboard, my courses, learning & progress, quizzes, final project, live classes, certificates, wishlist, cart, checkout, orders, reviews' },
      { path: '/community', description: 'Lifetime community feed, posts, comments, likes, course discussions' },
      { path: '/notifications', description: 'In-app notifications with read/unread status (all roles)' },
      { path: '/tutor', description: 'Tutor dashboard, course builder, recorded videos, quizzes, projects, students, certificates, live classes, reviews, earnings' },
      { path: '/admin', description: 'Admin dashboard, users, courses, categories, enrollments, orders, coupons, live classes, progress & certificates, moderation, communication, notifications, reports, CMS, settings' },
      { path: '/media', description: 'Signed, range-enabled recorded video streaming' },
      { path: '/integrations/site', description: 'Signed read-only orders / payments feed for the antarikshtv.com wp-admin' },
      { path: '/webhooks/atv-site', description: 'Paid orders pushed by the antarikshtv.com checkout (HMAC signed)' },
      { path: '/webhooks/razorpay', description: 'Razorpay payment webhook (legacy LMS checkout)' },
      { path: '/webhooks/woocommerce', description: 'WooCommerce order webhook (store purchases -> enrollment)' }
    ],
    realtime: 'socket.io on the same host; connect with { auth: { token } } and listen for "notification"'
  });
});

router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/public', publicRoutes);
router.use('/student', studentRoutes);
router.use('/tutor', tutorRoutes);
router.use('/admin', adminRoutes);
router.use('/community', communityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/integrations/site', siteRoutes);
router.get('/media/videos/:videoId/stream', validateIdParams, streamVideo);

export default router;
