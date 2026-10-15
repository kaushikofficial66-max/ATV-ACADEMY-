import { Op } from 'sequelize';
import { sequelize, LiveClass, LiveClassParticipant, LiveClassTutor, Course, User, Enrollment } from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { pick, toBool } from '../../utils/helpers.js';
import { getPagination, dateRange } from '../../utils/pagination.js';
import { isAdmin, assertCourseManager, getTutorCourseIds, isCourseTutor } from '../../services/accessService.js';
import { createMeeting, updateMeeting, deleteMeeting, getMeetingStartUrl, isZoomConfigured } from '../../services/zoomService.js';
import { notifyUsers, getCourseStudentIds } from '../../services/notificationService.js';
import { getSetting } from '../../services/settingsService.js';
import { markAbsentees, assertClassSection, createClassLecture, syncClassLecture, removeClassLectureIfEmpty } from '../../services/liveClassService.js';

const INCLUDES = [
  { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] },
  { model: User, as: 'tutor', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'] },
  { model: User, as: 'tutors', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'], through: { attributes: ['is_host'] } }
];

/** tutor_ids as an array, a comma-separated string or a single id. */
const parseIds = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(list.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
};

/**
 * Works out the host and all assigned tutors from { tutor_id, tutor_ids }.
 * Admins pick the tutors (at least one; host = tutor_id or the first of tutor_ids).
 * A tutor scheduling a class is always the host and may add co-tutors.
 * Every tutor must be assigned to the course. Returns null when nothing was sent (updates).
 */
const resolveTutors = async (req, courseId, currentHostId = null) => {
  const ids = parseIds(req.body.tutor_ids);
  const hostInput = req.body.tutor_id ? Number(req.body.tutor_id) : null;
  if (!ids.length && !hostInput) {
    if (currentHostId) return null;
    if (isAdmin(req.user)) throw ApiError.badRequest('Select at least one tutor (tutor_ids) when an admin schedules a class.');
    return { hostId: req.user.id, tutorIds: [req.user.id] };
  }
  const hostId = isAdmin(req.user) ? hostInput || ids[0] || currentHostId : currentHostId || req.user.id;
  const tutorIds = [...new Set([hostId, ...ids])];
  for (const id of tutorIds) {
    if (!(await isCourseTutor(id, courseId))) throw ApiError.badRequest(`Tutor #${id} is not assigned to this course. Assign tutors to the course first.`);
  }
  return { hostId, tutorIds };
};

const saveTutorAssignments = async (liveClassId, { hostId, tutorIds }, transaction) => {
  await LiveClassTutor.destroy({ where: { live_class_id: liveClassId }, transaction });
  await LiveClassTutor.bulkCreate(
    tutorIds.map((id) => ({ live_class_id: liveClassId, tutor_id: id, is_host: id === hostId })),
    { transaction }
  );
};

const formatWhen = (date, timezone) =>
  new Date(date).toLocaleString('en-IN', { timeZone: timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

const notifyStudents = async (liveClass, title, message, type) => {
  const studentIds = await getCourseStudentIds(liveClass.course_id);
  await notifyUsers(studentIds, { title, message, type, reference_type: 'live_class', reference_id: liveClass.id });
};

const findClassForManager = async (user, classId) => {
  const liveClass = await LiveClass.findByPk(classId, { include: INCLUDES });
  if (!liveClass) throw ApiError.notFound('Live class not found.');
  await assertCourseManager(user, liveClass.course_id);
  return liveClass;
};

/** GET /live-classes - tutor: own courses; admin: all. Filters: status, course_id, upcoming, from, to */
export const listLiveClasses = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query, 'scheduled_start') };
  if (req.query.status) where.status = req.query.status;
  if (req.query.tutor_id) where.tutor_id = req.query.tutor_id;
  if (req.query.course_id) {
    await assertCourseManager(req.user, req.query.course_id);
    where.course_id = req.query.course_id;
  } else if (!isAdmin(req.user)) {
    where.course_id = { [Op.in]: await getTutorCourseIds(req.user.id) };
  }
  if (toBool(req.query.upcoming)) {
    where.scheduled_end = { [Op.gte]: new Date() };
    where.status = { [Op.in]: ['scheduled', 'live'] };
  }

  const { count, rows } = await LiveClass.findAndCountAll({
    where,
    attributes: {
      include: [
        [LiveClass.sequelize.literal("(SELECT COUNT(*) FROM live_class_participants p WHERE p.live_class_id = `LiveClass`.`id` AND p.attendance_status = 'joined')"), 'joined_count']
      ]
    },
    include: INCLUDES,
    distinct: true,
    order: [['scheduled_start', toBool(req.query.upcoming) ? 'ASC' : 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { live_classes: rows, zoom_configured: await isZoomConfigured() }, meta: meta(count) });
};

/**
 * POST /live-classes
 * { course_id, title, description, scheduled_start, scheduled_end, timezone,
 *   create_zoom_meeting (default: true when Zoom is configured),
 *   zoom_meeting_id, zoom_join_url, zoom_start_url, password (manual entry),
 *   tutor_ids: [..] (one or more course tutors; required for admins), tutor_id (host, optional) }
 */
export const createLiveClass = async (req, res) => {
  const course = await assertCourseManager(req.user, req.body.course_id);
  const start = new Date(req.body.scheduled_start);
  const end = new Date(req.body.scheduled_end);
  if (end <= start) throw ApiError.badRequest('scheduled_end must be after scheduled_start.');
  if (start < new Date(Date.now() - 5 * 60 * 1000)) throw ApiError.badRequest('scheduled_start must be in the future.');

  const tutors = await resolveTutors(req, course.id);
  const sectionId = req.body.section_id ? (await assertClassSection(course.id, req.body.section_id)).id : null;

  const timezone = req.body.timezone || (await getSetting('timezone'));
  const manual = pick(req.body, ['zoom_meeting_id', 'zoom_join_url', 'zoom_start_url', 'password']);
  const wantsZoom = req.body.create_zoom_meeting !== undefined ? toBool(req.body.create_zoom_meeting) : !manual.zoom_join_url && (await isZoomConfigured());

  let zoomFields = manual;
  if (wantsZoom) {
    zoomFields = await createMeeting({
      title: req.body.title,
      description: req.body.description,
      scheduled_start: start,
      scheduled_end: end,
      timezone,
      password: req.body.password
    });
  } else if (!manual.zoom_join_url) {
    throw ApiError.badRequest('Provide zoom_join_url, or configure Zoom in Admin > Settings to create meetings automatically.');
  }

  const liveClass = await sequelize.transaction(async (transaction) => {
    const created = await LiveClass.create(
      {
        course_id: course.id,
        section_id: sectionId,
        tutor_id: tutors.hostId,
        title: req.body.title,
        description: req.body.description || null,
        scheduled_start: start,
        scheduled_end: end,
        timezone,
        ...zoomFields,
        status: 'scheduled'
      },
      { transaction }
    );
    await saveTutorAssignments(created.id, tutors, transaction);
    if (sectionId) await createClassLecture(created, { transaction });
    return created;
  });

  const otherTutors = tutors.tutorIds.filter((id) => id !== req.user.id);
  if (otherTutors.length) {
    await notifyUsers(otherTutors, {
      title: 'Live class assigned to you',
      message: `You have been assigned to the live class "${liveClass.title}" (${course.title}) on ${formatWhen(start, timezone)}.`,
      type: 'live_class_assigned',
      reference_type: 'live_class',
      reference_id: liveClass.id
    });
  }

  if (req.body.notify_students === undefined || toBool(req.body.notify_students)) {
    await notifyStudents(
      liveClass,
      'New live class scheduled',
      `"${liveClass.title}" for ${course.title} is scheduled on ${formatWhen(start, timezone)}.`,
      'live_class_scheduled'
    );
  }

  return successResponse(res, {
    statusCode: 201,
    message: wantsZoom ? 'Live class scheduled and Zoom meeting created.' : 'Live class scheduled.',
    data: { live_class: await LiveClass.findByPk(liveClass.id, { include: INCLUDES }) }
  });
};

/** GET /live-classes/:classId */
export const getLiveClass = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  return successResponse(res, { data: { live_class: liveClass } });
};

/** PUT /live-classes/:classId - reschedules sync to Zoom and notify students. */
export const updateLiveClass = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  if (['completed', 'cancelled'].includes(liveClass.status)) throw ApiError.badRequest(`A ${liveClass.status} class cannot be edited.`);

  const data = pick(req.body, ['title', 'description', 'scheduled_start', 'scheduled_end', 'timezone', 'zoom_meeting_id', 'zoom_join_url', 'zoom_start_url', 'password']);
  const start = new Date(data.scheduled_start || liveClass.scheduled_start);
  const end = new Date(data.scheduled_end || liveClass.scheduled_end);
  if (end <= start) throw ApiError.badRequest('scheduled_end must be after scheduled_start.');

  const tutors = await resolveTutors(req, liveClass.course_id, liveClass.tutor_id);
  if (tutors) data.tutor_id = tutors.hostId;

  const rescheduled =
    (data.scheduled_start && new Date(data.scheduled_start).getTime() !== new Date(liveClass.scheduled_start).getTime()) ||
    (data.scheduled_end && new Date(data.scheduled_end).getTime() !== new Date(liveClass.scheduled_end).getTime());

  if (liveClass.zoom_meeting_id && !data.zoom_meeting_id && (await isZoomConfigured()) && (rescheduled || data.title || data.description !== undefined)) {
    await updateMeeting(liveClass.zoom_meeting_id, {
      title: data.title,
      description: data.description,
      scheduled_start: start,
      scheduled_end: end,
      timezone: data.timezone || liveClass.timezone,
      ensureRecording: liveClass.recording_status === 'pending'
    });
  }

  await sequelize.transaction(async (transaction) => {
    await liveClass.update(data, { transaction });
    if (tutors) await saveTutorAssignments(liveClass.id, tutors, transaction);
  });
  await liveClass.reload({ include: INCLUDES });
  if (data.title || data.description !== undefined) await syncClassLecture(liveClass);
  if (rescheduled) {
    await notifyStudents(
      liveClass,
      'Live class rescheduled',
      `"${liveClass.title}" has been rescheduled to ${formatWhen(start, liveClass.timezone)}.`,
      'live_class_rescheduled'
    );
  }
  return successResponse(res, { message: 'Live class updated.', data: { live_class: liveClass } });
};

/** PATCH /live-classes/:classId/status { status: scheduled|live|completed|cancelled } */
export const updateLiveClassStatus = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  const { status } = req.body;
  if (liveClass.status === 'cancelled' && status !== 'scheduled') throw ApiError.badRequest('A cancelled class can only be rescheduled.');

  const wasCancelled = liveClass.status === 'cancelled';
  await liveClass.update({ status, ...(status === 'cancelled' && { recording_status: 'none' }) });
  if (status === 'cancelled') await removeClassLectureIfEmpty(liveClass);
  else if (wasCancelled && liveClass.section_id && !liveClass.lecture_id) await createClassLecture(liveClass);

  if (status === 'cancelled') {
    if (liveClass.zoom_meeting_id && (await isZoomConfigured())) await deleteMeeting(liveClass.zoom_meeting_id);
    await notifyStudents(liveClass, 'Live class cancelled', `"${liveClass.title}" scheduled on ${formatWhen(liveClass.scheduled_start, liveClass.timezone)} has been cancelled.${req.body.reason ? ` ${req.body.reason}` : ''}`, 'live_class_cancelled');
  } else if (status === 'live') {
    await notifyStudents(liveClass, 'Live class has started', `"${liveClass.title}" is live now. Join from your Live Classes page.`, 'live_class_started');
  } else if (status === 'completed') {
    await markAbsentees(liveClass);
  }
  return successResponse(res, { message: `Live class marked as ${status}.`, data: { live_class: liveClass } });
};

/** DELETE /live-classes/:classId */
export const deleteLiveClass = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  if (liveClass.zoom_meeting_id && (await isZoomConfigured())) await deleteMeeting(liveClass.zoom_meeting_id);
  if (liveClass.status === 'scheduled' && new Date(liveClass.scheduled_start) > new Date()) {
    await notifyStudents(liveClass, 'Live class cancelled', `"${liveClass.title}" has been cancelled.`, 'live_class_cancelled');
  }
  await removeClassLectureIfEmpty(liveClass);
  await liveClass.destroy();
  return successResponse(res, { message: 'Live class deleted.' });
};

/** GET /live-classes/:classId/start - host link (fresh from Zoom when possible); marks class live. */
export const startLiveClass = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  if (['completed', 'cancelled'].includes(liveClass.status)) throw ApiError.badRequest(`This class is ${liveClass.status}.`);

  let startUrl = liveClass.zoom_start_url;
  if (liveClass.zoom_meeting_id && (await isZoomConfigured())) {
    try {
      startUrl = await getMeetingStartUrl(liveClass.zoom_meeting_id);
      await liveClass.update({ zoom_start_url: startUrl });
    } catch (error) {
      console.warn('[Zoom]: could not refresh start url:', error.message);
    }
  }
  if (liveClass.status === 'scheduled' && toBool(req.query.mark_live ?? 'true')) {
    await liveClass.update({ status: 'live' });
    await notifyStudents(liveClass, 'Live class has started', `"${liveClass.title}" is live now. Join from your Live Classes page.`, 'live_class_started');
  }
  return successResponse(res, {
    data: { start_url: startUrl || liveClass.zoom_join_url, join_url: liveClass.zoom_join_url, meeting_id: liveClass.zoom_meeting_id, password: liveClass.password }
  });
};

/** GET /live-classes/:classId/attendance */
export const getAttendance = async (req, res) => {
  const liveClass = await findClassForManager(req.user, req.params.classId);
  const participants = await LiveClassParticipant.findAll({
    where: { live_class_id: liveClass.id },
    include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'] }],
    order: [['joined_at', 'ASC']]
  });
  const enrolledCount = await Enrollment.count({ where: { course_id: liveClass.course_id, status: { [Op.in]: ['active', 'completed'] } } });
  const joined = participants.filter((p) => p.attendance_status === 'joined').length;
  return successResponse(res, {
    data: {
      summary: {
        enrolled_students: enrolledCount,
        joined,
        absent: participants.filter((p) => p.attendance_status === 'absent').length,
        attendance_rate: enrolledCount ? Math.round((joined / enrolledCount) * 10000) / 100 : 0
      },
      participants
    }
  });
};

export default {
  listLiveClasses,
  createLiveClass,
  getLiveClass,
  updateLiveClass,
  updateLiveClassStatus,
  deleteLiveClass,
  startLiveClass,
  getAttendance
};
