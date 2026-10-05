import { Op } from 'sequelize';
import {
  Course,
  CourseTutor,
  CourseSection,
  Lecture,
  Enrollment
} from '../models/index.js';
import ApiError from '../utils/ApiError.js';

export const ACCESS_STATUSES = ['active', 'completed'];

const roleOf = (user) => (user && user.role ? user.role.name.toLowerCase() : null);
export const isAdmin = (user) => roleOf(user) === 'admin';
export const isTutor = (user) => roleOf(user) === 'tutor';
export const isStudent = (user) => roleOf(user) === 'student';

export const findCourseOrFail = async (courseId, options = {}) => {
  const course = await Course.findByPk(courseId, options);
  if (!course) throw ApiError.notFound('Course not found.');
  return course;
};

/** Course ids a tutor is assigned to (via course_tutors). */
export const getTutorCourseIds = async (tutorId) => {
  const rows = await CourseTutor.findAll({ where: { tutor_id: tutorId }, attributes: ['course_id'] });
  return rows.map((r) => r.course_id);
};

export const isCourseTutor = async (userId, courseId) =>
  Boolean(await CourseTutor.findOne({ where: { course_id: courseId, tutor_id: userId }, attributes: ['id'] }));

/** Admins manage every course; tutors only courses they are assigned to. */
export const canManageCourse = async (user, courseId) => {
  if (isAdmin(user)) return true;
  if (isTutor(user)) return isCourseTutor(user.id, courseId);
  return false;
};

/** Loads the course and throws 403/404 unless the user may manage it. */
export const assertCourseManager = async (user, courseId, options = {}) => {
  const course = await findCourseOrFail(courseId, options);
  if (!(await canManageCourse(user, course.id))) {
    throw ApiError.forbidden('You can only manage courses you are assigned to.');
  }
  return course;
};

export const findSectionForManager = async (user, sectionId) => {
  const section = await CourseSection.findByPk(sectionId);
  if (!section) throw ApiError.notFound('Section not found.');
  await assertCourseManager(user, section.course_id);
  return section;
};

export const findLectureForManager = async (user, lectureId) => {
  const lecture = await Lecture.findByPk(lectureId, { include: [{ model: CourseSection, as: 'section' }] });
  if (!lecture) throw ApiError.notFound('Lecture not found.');
  await assertCourseManager(user, lecture.section.course_id);
  return lecture;
};

/** Active (non-expired) enrollment giving access to course content, or null. */
export const getAccessEnrollment = async (userId, courseId) => {
  const enrollment = await Enrollment.findOne({
    where: { user_id: userId, course_id: courseId, status: { [Op.in]: ACCESS_STATUSES } }
  });
  if (!enrollment) return null;
  if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) {
    await enrollment.update({ status: 'expired' });
    return null;
  }
  return enrollment;
};

export const assertEnrolled = async (userId, courseId) => {
  const enrollment = await getAccessEnrollment(userId, courseId);
  if (!enrollment) {
    throw ApiError.forbidden('Access restricted: you must be enrolled in this course to access this content.');
  }
  return enrollment;
};

/**
 * Content access: admins and the course's tutors always; students need an
 * active enrollment. Returns the enrollment (students) or null (staff).
 */
export const assertCourseContentAccess = async (user, courseId) => {
  if (await canManageCourse(user, courseId)) return null;
  return assertEnrolled(user.id, courseId);
};

/** Lifetime community access: any paid/granted enrollment ever (any status but cancelled). */
export const hasCommunityAccess = async (user) => {
  if (isAdmin(user) || isTutor(user)) return true;
  const enrollment = await Enrollment.findOne({
    where: { user_id: user.id, status: { [Op.ne]: 'cancelled' } },
    attributes: ['id']
  });
  return Boolean(enrollment);
};

export default {
  isAdmin,
  isTutor,
  isStudent,
  findCourseOrFail,
  getTutorCourseIds,
  isCourseTutor,
  canManageCourse,
  assertCourseManager,
  findSectionForManager,
  findLectureForManager,
  getAccessEnrollment,
  assertEnrolled,
  assertCourseContentAccess,
  hasCommunityAccess
};
