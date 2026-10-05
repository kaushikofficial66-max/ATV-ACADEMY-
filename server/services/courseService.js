import { Op, fn, col } from 'sequelize';
import {
  CourseTutor,
  Review,
  Enrollment,
  CourseSection,
  Lecture
} from '../models/index.js';

export const getTutorIdsForCourse = async (courseId) => {
  const rows = await CourseTutor.findAll({ where: { course_id: courseId }, attributes: ['tutor_id'] });
  return rows.map((r) => r.tutor_id);
};

/** { [courseId]: { average_rating, review_count } } from approved reviews. */
export const getRatingsForCourses = async (courseIds) => {
  if (!courseIds.length) return {};
  const rows = await Review.findAll({
    attributes: ['course_id', [fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('id')), 'count']],
    where: { course_id: { [Op.in]: courseIds }, status: 'approved' },
    group: ['course_id'],
    raw: true
  });
  return Object.fromEntries(
    rows.map((r) => [r.course_id, { average_rating: Math.round(Number(r.avg) * 10) / 10, review_count: Number(r.count) }])
  );
};

/** { [courseId]: student_count } for active/completed enrollments. */
export const getEnrollmentCounts = async (courseIds) => {
  if (!courseIds.length) return {};
  const rows = await Enrollment.findAll({
    attributes: ['course_id', [fn('COUNT', col('id')), 'count']],
    where: { course_id: { [Op.in]: courseIds }, status: { [Op.in]: ['active', 'completed'] } },
    group: ['course_id'],
    raw: true
  });
  return Object.fromEntries(rows.map((r) => [r.course_id, Number(r.count)]));
};

/** { [courseId]: { lecture_count, total_duration_seconds } } for published content. */
export const getCurriculumStats = async (courseIds) => {
  if (!courseIds.length) return {};
  const rows = await Lecture.findAll({
    attributes: [[col('section.course_id'), 'course_id'], [fn('COUNT', col('Lecture.id')), 'count'], [fn('SUM', col('Lecture.duration_seconds')), 'duration']],
    where: { status: 'published' },
    include: [{ model: CourseSection, as: 'section', attributes: [], where: { course_id: { [Op.in]: courseIds }, status: 'active' } }],
    group: ['section.course_id'],
    raw: true
  });
  return Object.fromEntries(
    rows.map((r) => [r.course_id, { lecture_count: Number(r.count), total_duration_seconds: Number(r.duration || 0) }])
  );
};

/** Adds rating / student / curriculum stats to plain course objects. */
export const decorateCourses = async (courses) => {
  const list = courses.map((c) => (c.toJSON ? c.toJSON() : c));
  const ids = list.map((c) => c.id);
  const [ratings, counts, stats] = await Promise.all([
    getRatingsForCourses(ids),
    getEnrollmentCounts(ids),
    getCurriculumStats(ids)
  ]);
  return list.map((c) => ({
    ...c,
    effective_price: c.discount_price !== null && c.discount_price !== undefined ? Number(c.discount_price) : Number(c.price),
    average_rating: ratings[c.id]?.average_rating || 0,
    review_count: ratings[c.id]?.review_count || 0,
    student_count: counts[c.id] || 0,
    lecture_count: stats[c.id]?.lecture_count || 0,
    total_duration_seconds: stats[c.id]?.total_duration_seconds || 0
  }));
};

/** Price a student pays for a course right now. */
export const effectivePrice = (course) =>
  course.discount_price !== null && course.discount_price !== undefined && Number(course.discount_price) < Number(course.price)
    ? Number(course.discount_price)
    : Number(course.price);

export default { getTutorIdsForCourse, getRatingsForCourses, getEnrollmentCounts, getCurriculumStats, decorateCourses, effectivePrice };
