import { Op } from 'sequelize';
import {
  Enrollment,
  Course,
  CourseProgress,
  LiveClass,
  User,
  Notification,
  Certificate,
  Order,
  Wishlist,
  QuizAttempt,
  ProjectSubmission
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import { serializeLiveClassForStudent } from '../../utils/serializers.js';
import { ACCESS_STATUSES } from '../../services/accessService.js';
import { getProgressSummaries } from '../../services/progressService.js';

/**
 * GET /student/dashboard - overview, course progress, recent courses,
 * upcoming live classes and recent notifications.
 */
export const getDashboard = async (req, res) => {
  const userId = req.user.id;

  const enrollments = await Enrollment.findAll({
    where: { user_id: userId, status: { [Op.in]: [...ACCESS_STATUSES, 'expired'] } },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url', 'level'] },
      { model: CourseProgress, as: 'courseProgress' }
    ]
  });
  const courseIds = enrollments.filter((e) => ACCESS_STATUSES.includes(e.status)).map((e) => e.course_id);

  const [upcoming, notifications, unreadCount, certificates, pendingOrders, wishlistCount, quizzesPassed, pendingProjects] = await Promise.all([
    courseIds.length
      ? LiveClass.findAll({
          where: { course_id: { [Op.in]: courseIds }, status: { [Op.in]: ['scheduled', 'live'] }, scheduled_end: { [Op.gte]: new Date() } },
          include: [
            { model: Course, as: 'course', attributes: ['id', 'title'] },
            { model: User, as: 'tutor', attributes: ['id', 'first_name', 'last_name', 'profile_image'] }
          ],
          order: [['scheduled_start', 'ASC']],
          limit: 5
        })
      : [],
    Notification.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']], limit: 5 }),
    Notification.count({ where: { user_id: userId, is_read: false } }),
    Certificate.findAll({ where: { user_id: userId }, attributes: ['status'] }),
    Order.count({ where: { user_id: userId, status: 'pending' } }),
    Wishlist.count({ where: { user_id: userId } }),
    QuizAttempt.count({ where: { user_id: userId, passed: true } }),
    ProjectSubmission.count({ where: { student_id: userId, status: { [Op.in]: ['submitted', 'under_review'] } } })
  ]);

  const summaries = await getProgressSummaries(enrollments);

  const recent = [...enrollments]
    .sort((a, b) => new Date(b.courseProgress?.updated_at || b.updated_at) - new Date(a.courseProgress?.updated_at || a.updated_at))
    .slice(0, 5)
    .map((e) => ({
      enrollment_id: e.id,
      course: e.course,
      status: e.status,
      completion_percentage: Number(e.completion_percentage),
      progress: summaries[e.id],
      completed_lectures: e.courseProgress?.completed_lectures || 0,
      total_lectures: e.courseProgress?.total_lectures || 0,
      last_lecture_id: e.courseProgress?.last_lecture_id || null,
      last_activity_at: e.courseProgress?.updated_at || e.updated_at
    }));

  const active = enrollments.filter((e) => e.status === 'active');
  const avgProgress = enrollments.length
    ? Math.round((enrollments.reduce((s, e) => s + Number(e.completion_percentage), 0) / enrollments.length) * 100) / 100
    : 0;

  return successResponse(res, {
    data: {
      overview: {
        enrolled_courses: enrollments.length,
        in_progress: active.filter((e) => Number(e.completion_percentage) > 0).length,
        not_started: active.filter((e) => Number(e.completion_percentage) === 0).length,
        completed_courses: enrollments.filter((e) => e.status === 'completed').length,
        average_progress: avgProgress,
        certificates_issued: certificates.filter((c) => ['approved', 'issued'].includes(c.status)).length,
        certificates_pending: certificates.filter((c) => c.status === 'pending').length,
        quizzes_passed: quizzesPassed,
        projects_awaiting_review: pendingProjects,
        courses_pending_approval: Object.values(summaries).filter((p) => p.status === 'pending_approval').length,
        projects_unlocked: Object.values(summaries).filter((p) => p.can_submit_project).length,
        pending_orders: pendingOrders,
        wishlist_items: wishlistCount,
        unread_notifications: unreadCount,
        community_access: enrollments.length > 0
      },
      course_progress: enrollments.map((e) => ({
        course_id: e.course_id,
        title: e.course?.title,
        completion_percentage: Number(e.completion_percentage),
        status: e.status,
        progress_status: summaries[e.id]?.status,
        progress_status_label: summaries[e.id]?.status_label
      })),
      recent_courses: recent,
      upcoming_live_classes: upcoming.map((lc) => serializeLiveClassForStudent(lc)),
      recent_notifications: notifications
    }
  });
};

export default { getDashboard };
