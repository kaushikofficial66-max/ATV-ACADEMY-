import express from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  clearNotifications
} from '../controllers/notificationController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateIdParams } from '../middlewares/validate.js';

// In-app notifications for every role (read / unread status).
const router = express.Router();
router.use(authenticate);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:notificationId/read', validateIdParams, markAsRead);
router.patch('/:notificationId/unread', validateIdParams, markAsUnread);
router.delete('/', clearNotifications);
router.delete('/:notificationId', validateIdParams, deleteNotification);

export default router;
