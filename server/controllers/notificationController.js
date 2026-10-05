import { Op } from 'sequelize';
import { Notification } from '../models/index.js';
import { successResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/ApiError.js';
import { getPagination } from '../utils/pagination.js';

/** GET /notifications?status=unread|read&type= - for every role. */
export const getMyNotifications = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { user_id: req.user.id };
  if (req.query.status === 'unread') where.is_read = false;
  if (req.query.status === 'read') where.is_read = true;
  if (req.query.type) where.type = req.query.type;

  const [{ count, rows }, unreadCount] = await Promise.all([
    Notification.findAndCountAll({ where, order: [['created_at', 'DESC']], limit, offset }),
    Notification.count({ where: { user_id: req.user.id, is_read: false } })
  ]);
  return successResponse(res, { data: { notifications: rows, unread_count: unreadCount }, meta: meta(count) });
};

/** GET /notifications/unread-count */
export const getUnreadCount = async (req, res) => {
  const unread = await Notification.count({ where: { user_id: req.user.id, is_read: false } });
  return successResponse(res, { data: { unread_count: unread } });
};

/** PATCH /notifications/:notificationId/read */
export const markAsRead = async (req, res) => {
  const notification = await Notification.findOne({ where: { id: req.params.notificationId, user_id: req.user.id } });
  if (!notification) throw ApiError.notFound('Notification not found.');
  if (!notification.is_read) await notification.update({ is_read: true, read_at: new Date() });
  return successResponse(res, { message: 'Notification marked as read.', data: { notification } });
};

/** PATCH /notifications/:notificationId/unread */
export const markAsUnread = async (req, res) => {
  const notification = await Notification.findOne({ where: { id: req.params.notificationId, user_id: req.user.id } });
  if (!notification) throw ApiError.notFound('Notification not found.');
  await notification.update({ is_read: false, read_at: null });
  return successResponse(res, { message: 'Notification marked as unread.', data: { notification } });
};

/** PATCH /notifications/read-all { ids? } */
export const markAllAsRead = async (req, res) => {
  const where = { user_id: req.user.id, is_read: false };
  if (Array.isArray(req.body?.ids) && req.body.ids.length) where.id = { [Op.in]: req.body.ids };
  const [updated] = await Notification.update({ is_read: true, read_at: new Date() }, { where });
  return successResponse(res, { message: 'Notifications marked as read.', data: { updated } });
};

/** DELETE /notifications/:notificationId */
export const deleteNotification = async (req, res) => {
  const removed = await Notification.destroy({ where: { id: req.params.notificationId, user_id: req.user.id } });
  if (!removed) throw ApiError.notFound('Notification not found.');
  return successResponse(res, { message: 'Notification deleted.' });
};

/** DELETE /notifications?only_read=true */
export const clearNotifications = async (req, res) => {
  const where = { user_id: req.user.id };
  if (req.query.only_read !== 'false') where.is_read = true;
  const removed = await Notification.destroy({ where });
  return successResponse(res, { message: 'Notifications cleared.', data: { removed } });
};

export default {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  clearNotifications
};
