import { Op } from 'sequelize';
import { Notification, User, Role, Enrollment } from '../models/index.js';
import { emitToUser } from './socketService.js';

const CHUNK = 500;

/**
 * Creates an in-app notification for one user and pushes it over socket.io.
 * Never throws: a failed notification must not fail the business action.
 */
export const notifyUser = async (userId, { title, message, type = 'general', reference_type = null, reference_id = null }) => {
  try {
    const notification = await Notification.create({
      user_id: userId,
      title,
      message,
      type,
      reference_type,
      reference_id
    });
    emitToUser(userId, 'notification', notification.toJSON());
    return notification;
  } catch (error) {
    console.error('[Notification Error]:', error.message);
    return null;
  }
};

/** Bulk in-app notifications (admin broadcasts, live class alerts...). */
export const notifyUsers = async (userIds, payload) => {
  const ids = [...new Set(userIds.map(Number))].filter(Boolean);
  let created = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    try {
      const rows = await Notification.bulkCreate(
        slice.map((user_id) => ({
          user_id,
          title: payload.title,
          message: payload.message,
          type: payload.type || 'general',
          reference_type: payload.reference_type || null,
          reference_id: payload.reference_id || null
        }))
      );
      created += rows.length;
      rows.forEach((row) => emitToUser(row.user_id, 'notification', row.toJSON()));
    } catch (error) {
      console.error('[Bulk Notification Error]:', error.message);
    }
  }
  return created;
};

/** User ids for a role name ('student' | 'tutor' | 'admin'), active accounts only. */
export const getUserIdsByRole = async (roleName) => {
  const users = await User.findAll({
    attributes: ['id'],
    where: { status: 'active' },
    include: [{ model: Role, as: 'role', where: { name: roleName }, attributes: [] }]
  });
  return users.map((u) => u.id);
};

export const getActiveUserIds = async () => {
  const users = await User.findAll({ attributes: ['id'], where: { status: 'active' } });
  return users.map((u) => u.id);
};

/** Students with an active/completed enrollment in the course. */
export const getCourseStudentIds = async (courseId) => {
  const enrollments = await Enrollment.findAll({
    attributes: ['user_id'],
    where: { course_id: courseId, status: { [Op.in]: ['active', 'completed'] } }
  });
  return enrollments.map((e) => e.user_id);
};

export const notifyAdmins = async (payload) => notifyUsers(await getUserIdsByRole('admin'), payload);

export default { notifyUser, notifyUsers, notifyAdmins, getUserIdsByRole, getActiveUserIds, getCourseStudentIds };
