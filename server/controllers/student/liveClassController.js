import { Op } from 'sequelize';
import { LiveClass, LiveClassParticipant, Course, User, Enrollment } from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination } from '../../utils/pagination.js';
import { serializeLiveClassForStudent } from '../../utils/serializers.js';
import { getAccessEnrollment, ACCESS_STATUSES } from '../../services/accessService.js';
import { recordProgressActivity } from '../../services/progressService.js';
import { getSetting } from '../../services/settingsService.js';

const INCLUDES = [
  { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] },
  { model: User, as: 'tutor', attributes: ['id', 'first_name', 'last_name', 'profile_image'] }
];

/** Join is allowed from N minutes before start until the scheduled end (or while live). */
const joinWindow = async (liveClass) => {
  const minutes = Number(await getSetting('live_class_join_window_minutes')) || 15;
  const opensAt = new Date(new Date(liveClass.scheduled_start).getTime() - minutes * 60 * 1000);
  const now = new Date();
  const canJoin =
    liveClass.status === 'live' ||
    (liveClass.status === 'scheduled' && now >= opensAt && now <= new Date(liveClass.scheduled_end));
  return { can_join: canJoin, join_opens_at: opensAt };
};

const enrolledCourseIds = async (userId) =>
  (
    await Enrollment.findAll({ where: { user_id: userId, status: { [Op.in]: ACCESS_STATUSES } }, attributes: ['course_id'] })
  ).map((e) => e.course_id);

/**
 * GET /student/live-classes?scope=upcoming|past|all&course_id=
 * Only classes of courses the student is enrolled in. Join links are only
 * included while the join window is open.
 */
export const listMyLiveClasses = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const courseIds = await enrolledCourseIds(req.user.id);
  const where = { course_id: { [Op.in]: courseIds } };
  if (req.query.course_id) {
    if (!courseIds.includes(Number(req.query.course_id))) throw ApiError.forbidden('You are not enrolled in this course.');
    where.course_id = req.query.course_id;
  }
  const scope = req.query.scope || 'upcoming';
  if (scope === 'upcoming') {
    where.scheduled_end = { [Op.gte]: new Date() };
    where.status = { [Op.in]: ['scheduled', 'live'] };
  } else if (scope === 'past') {
    where[Op.or] = [{ scheduled_end: { [Op.lt]: new Date() } }, { status: { [Op.in]: ['completed', 'cancelled'] } }];
  }

  const { count, rows } = await LiveClass.findAndCountAll({
    where,
    include: INCLUDES,
    order: [['scheduled_start', scope === 'past' ? 'DESC' : 'ASC']],
    limit,
    offset
  });
  const participations = await LiveClassParticipant.findAll({
    where: { user_id: req.user.id, live_class_id: { [Op.in]: rows.map((r) => r.id) } }
  });
  const classes = [];
  for (const lc of rows) {
    const win = await joinWindow(lc);
    classes.push({
      ...serializeLiveClassForStudent(lc, { canJoin: false }),
      ...win,
      attendance_status: participations.find((p) => p.live_class_id === lc.id)?.attendance_status || null
    });
  }
  return successResponse(res, { data: { live_classes: classes }, meta: meta(count) });
};

/** GET /student/live-classes/:classId - class details (eligible students only). */
export const getLiveClass = async (req, res) => {
  const liveClass = await LiveClass.findByPk(req.params.classId, { include: INCLUDES });
  if (!liveClass) throw ApiError.notFound('Live class not found.');
  if (!(await getAccessEnrollment(req.user.id, liveClass.course_id))) {
    throw ApiError.forbidden('Only students enrolled in this course can access this live class.');
  }
  const win = await joinWindow(liveClass);
  const participant = await LiveClassParticipant.findOne({ where: { live_class_id: liveClass.id, user_id: req.user.id } });
  return successResponse(res, {
    data: { live_class: { ...serializeLiveClassForStudent(liveClass, { canJoin: false }), ...win, attendance_status: participant?.attendance_status || null } }
  });
};

/**
 * POST /student/live-classes/:classId/join - returns the Zoom join URL
 * (open it in a new tab) and records attendance.
 */
export const joinLiveClass = async (req, res) => {
  const liveClass = await LiveClass.findByPk(req.params.classId);
  if (!liveClass) throw ApiError.notFound('Live class not found.');
  const enrollment = await getAccessEnrollment(req.user.id, liveClass.course_id);
  if (!enrollment) {
    throw ApiError.forbidden('Only students enrolled in this course can join this live class.');
  }
  if (liveClass.status === 'cancelled') throw ApiError.badRequest('This live class has been cancelled.');
  if (liveClass.status === 'completed') throw ApiError.badRequest('This live class has already ended.');

  const win = await joinWindow(liveClass);
  if (!win.can_join) {
    throw new ApiError(403, `You can join from ${win.join_opens_at.toISOString()} until the class ends.`, [{ field: 'join_opens_at', value: win.join_opens_at }]);
  }
  if (!liveClass.zoom_join_url) throw ApiError.badRequest('The meeting link has not been added yet. Please try again shortly.');

  const [participant] = await LiveClassParticipant.findOrCreate({
    where: { live_class_id: liveClass.id, user_id: req.user.id },
    defaults: { live_class_id: liveClass.id, user_id: req.user.id }
  });
  await participant.update({ attendance_status: 'joined', joined_at: participant.joined_at || new Date() });

  // 90% completion rule: joining a live class adds the progress increment (up to the cap).
  const progress = await recordProgressActivity({ enrollment, type: 'live_class_join', referenceId: liveClass.id });

  return successResponse(res, {
    message: 'Opening Zoom in a new tab.',
    data: {
      join_url: liveClass.zoom_join_url,
      meeting_id: liveClass.zoom_meeting_id,
      password: liveClass.password,
      open_in_new_tab: true,
      progress_counted: progress.counted,
      increment_applied: progress.increment_applied,
      progress: progress.progress
    }
  });
};

/** POST /student/live-classes/:classId/leave - optional "left at" tracking. */
export const leaveLiveClass = async (req, res) => {
  await LiveClassParticipant.update({ left_at: new Date() }, { where: { live_class_id: req.params.classId, user_id: req.user.id } });
  return successResponse(res, { message: 'Recorded.' });
};

export default { listMyLiveClasses, getLiveClass, joinLiveClass, leaveLiveClass };
