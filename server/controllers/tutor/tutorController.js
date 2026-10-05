import { Op, fn, col } from 'sequelize';
import {
  Course,
  Enrollment,
  CourseProgress,
  User,
  UserProfile,
  LiveClass,
  Review,
  ProjectSubmission,
  Project,
  Certificate,
  QuizAttempt,
  Quiz,
  LectureProgress,
  Lecture,
  CourseSection,
  LiveClassParticipant,
  TutorPayout
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, dateRange } from '../../utils/pagination.js';
import { getTutorCourseIds, assertCourseManager } from '../../services/accessService.js';
import { getTutorEarnings } from '../../services/earningsService.js';
import { getCountableLectureIds, listPendingProjectApprovals } from '../../services/progressService.js';

const STUDENT_ATTRS = ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_image'];

/** GET /tutor/dashboard */
export const getDashboard = async (req, res) => {
  const courseIds = await getTutorCourseIds(req.user.id);
  const inCourses = { [Op.in]: courseIds };

  const [courses, studentRows, enrollmentStats, ratingRow, pendingApprovals, pendingCertificates, upcoming, recentEnrollments, recentReviews, earnings] =
    await Promise.all([
      Course.findAll({ where: { id: inCourses }, attributes: ['id', 'title', 'status'] }),
      Enrollment.findAll({
        attributes: [[fn('COUNT', fn('DISTINCT', col('user_id'))), 'students']],
        where: { course_id: inCourses, status: { [Op.in]: ['active', 'completed'] } },
        raw: true
      }),
      Enrollment.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        where: { course_id: inCourses },
        group: ['status'],
        raw: true
      }),
      Review.findOne({
        attributes: [[fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('id')), 'count']],
        where: { course_id: inCourses, status: 'approved' },
        raw: true
      }),
      listPendingProjectApprovals({ courseIds, limit: 10 }),
      Certificate.count({ where: { course_id: inCourses, status: 'pending' } }),
      LiveClass.findAll({
        where: { course_id: inCourses, status: { [Op.in]: ['scheduled', 'live'] }, scheduled_end: { [Op.gte]: new Date() } },
        include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }],
        order: [['scheduled_start', 'ASC']],
        limit: 5
      }),
      Enrollment.findAll({
        where: { course_id: inCourses },
        include: [
          { model: User, as: 'student', attributes: STUDENT_ATTRS },
          { model: Course, as: 'course', attributes: ['id', 'title'] }
        ],
        order: [['enrolled_at', 'DESC']],
        limit: 5
      }),
      Review.findAll({
        where: { course_id: inCourses, status: 'approved' },
        include: [
          { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'profile_image'] },
          { model: Course, as: 'course', attributes: ['id', 'title'] }
        ],
        order: [['created_at', 'DESC']],
        limit: 5
      }),
      getTutorEarnings(req.user.id)
    ]);

  const byStatus = Object.fromEntries(enrollmentStats.map((r) => [r.status, Number(r.count)]));
  const courseStatus = courses.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] || 0) + 1 }), {});

  return successResponse(res, {
    data: {
      overview: {
        account_status: req.user.status,
        total_courses: courses.length,
        published_courses: courseStatus.published || 0,
        total_students: Number(studentRows[0]?.students || 0),
        active_enrollments: byStatus.active || 0,
        completed_enrollments: byStatus.completed || 0,
        average_rating: ratingRow?.avg ? Math.round(Number(ratingRow.avg) * 10) / 10 : 0,
        total_reviews: Number(ratingRow?.count || 0),
        pending_project_reviews: pendingApprovals.count,
        pending_certificate_approvals: pendingCertificates
      },
      course_summary: { by_status: courseStatus, courses },
      student_summary: { by_enrollment_status: byStatus, recent_enrollments: recentEnrollments },
      upcoming_live_classes: upcoming,
      earnings_summary: {
        share_percent: earnings.share_percent,
        total_earnings: earnings.total_earnings,
        total_paid_out: earnings.total_paid_out,
        balance: earnings.balance,
        monthly: earnings.monthly.slice(-6)
      },
      recent_reviews: recentReviews,
      // Phase 2 of the 90% rule: final projects waiting for this tutor's approval (oldest first).
      pending_project_approvals: pendingApprovals.items
    }
  });
};

/**
 * GET /tutor/students?course_id=&status=&search= - enrollments in the tutor's courses.
 */
export const listStudents = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = {};
  if (req.query.course_id) {
    await assertCourseManager(req.user, req.query.course_id);
    where.course_id = req.query.course_id;
  } else {
    where.course_id = { [Op.in]: await getTutorCourseIds(req.user.id) };
  }
  where.status = req.query.status ? req.query.status : { [Op.ne]: 'cancelled' };

  const search = req.query.search
    ? {
        [Op.or]: [
          { first_name: { [Op.like]: `%${req.query.search}%` } },
          { last_name: { [Op.like]: `%${req.query.search}%` } },
          { email: { [Op.like]: `%${req.query.search}%` } }
        ]
      }
    : undefined;

  const { count, rows } = await Enrollment.findAndCountAll({
    where,
    include: [
      { model: User, as: 'student', attributes: STUDENT_ATTRS, ...(search && { where: search }) },
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] },
      { model: CourseProgress, as: 'courseProgress' },
      { model: Certificate, as: 'certificate', attributes: ['id', 'status'] }
    ],
    order: [['enrolled_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { students: rows }, meta: meta(count) });
};

/** GET /tutor/students/:studentId - details across the tutor's courses. */
export const getStudentDetails = async (req, res) => {
  const courseIds = await getTutorCourseIds(req.user.id);
  const student = await User.findByPk(req.params.studentId, {
    attributes: [...STUDENT_ATTRS, 'created_at', 'last_login_at', 'status'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['bio', 'city', 'state', 'country', 'linkedin_url', 'website'] }]
  });
  if (!student) throw ApiError.notFound('Student not found.');

  const enrollments = await Enrollment.findAll({
    where: { user_id: student.id, course_id: { [Op.in]: courseIds } },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] },
      { model: CourseProgress, as: 'courseProgress' },
      { model: Certificate, as: 'certificate' }
    ]
  });
  if (!enrollments.length) throw ApiError.forbidden('This student is not enrolled in any of your courses.');

  const enrollmentIds = enrollments.map((e) => e.id);
  const [quizAttempts, submissions, attendance] = await Promise.all([
    QuizAttempt.findAll({
      where: { enrollment_id: { [Op.in]: enrollmentIds } },
      include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title', 'course_id', 'total_marks', 'passing_marks'] }],
      order: [['submitted_at', 'DESC']]
    }),
    ProjectSubmission.findAll({
      where: { enrollment_id: { [Op.in]: enrollmentIds } },
      attributes: { exclude: ['file_url'] },
      include: [{ model: Project, as: 'project', attributes: ['id', 'title', 'course_id'] }],
      order: [['submitted_at', 'DESC']]
    }),
    LiveClassParticipant.findAll({
      where: { user_id: student.id },
      include: [{ model: LiveClass, as: 'liveClass', attributes: ['id', 'title', 'course_id', 'scheduled_start'], where: { course_id: { [Op.in]: courseIds } } }]
    })
  ]);

  return successResponse(res, { data: { student, enrollments, quiz_attempts: quizAttempts, project_submissions: submissions, live_class_attendance: attendance } });
};

/** GET /tutor/enrollments/:enrollmentId/progress - lecture-by-lecture progress for a student. */
export const getEnrollmentProgress = async (req, res) => {
  const enrollment = await Enrollment.findByPk(req.params.enrollmentId, {
    include: [
      { model: User, as: 'student', attributes: STUDENT_ATTRS },
      { model: Course, as: 'course', attributes: ['id', 'title'] },
      { model: CourseProgress, as: 'courseProgress' }
    ]
  });
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  await assertCourseManager(req.user, enrollment.course_id);

  const sections = await CourseSection.findAll({
    where: { course_id: enrollment.course_id, status: 'active' },
    attributes: ['id', 'title', 'sort_order'],
    include: [{ model: Lecture, as: 'lectures', where: { status: 'published' }, required: false, attributes: ['id', 'title', 'lecture_type', 'duration_seconds', 'sort_order'] }],
    order: [
      ['sort_order', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']
    ]
  });
  const lectureIds = await getCountableLectureIds(enrollment.course_id);
  const progress = await LectureProgress.findAll({ where: { user_id: enrollment.user_id, lecture_id: { [Op.in]: lectureIds } } });
  const map = new Map(progress.map((p) => [p.lecture_id, p]));

  return successResponse(res, {
    data: {
      enrollment,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        lectures: s.lectures.map((l) => ({
          ...l.toJSON(),
          completed: Boolean(map.get(l.id)?.completed),
          completion_percentage: Number(map.get(l.id)?.completion_percentage || 0),
          watched_seconds: map.get(l.id)?.watched_seconds || 0,
          completed_at: map.get(l.id)?.completed_at || null
        }))
      }))
    }
  });
};

/** GET /tutor/reviews?course_id=&rating= - reviews of the tutor's courses (approved). */
export const listReviews = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { status: 'approved' };
  if (req.query.course_id) {
    await assertCourseManager(req.user, req.query.course_id);
    where.course_id = req.query.course_id;
  } else {
    where.course_id = { [Op.in]: await getTutorCourseIds(req.user.id) };
  }
  if (req.query.rating) where.rating = req.query.rating;

  const [{ count, rows }, breakdown] = await Promise.all([
    Review.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'profile_image'] },
        { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    }),
    Review.findAll({ attributes: ['rating', [fn('COUNT', col('id')), 'count']], where: { ...where, rating: { [Op.ne]: null } }, group: ['rating'], raw: true })
  ]);
  const total = breakdown.reduce((s, r) => s + Number(r.count), 0);
  const avg = total ? breakdown.reduce((s, r) => s + Number(r.rating) * Number(r.count), 0) / total : 0;
  return successResponse(res, {
    data: {
      summary: { total_reviews: total, average_rating: Math.round(avg * 10) / 10, breakdown: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: Number(breakdown.find((b) => Number(b.rating) === r)?.count || 0) })) },
      reviews: rows
    },
    meta: meta(count)
  });
};

/** GET /tutor/earnings?from=&to= - summary, course-wise and monthly earnings. */
export const getEarnings = async (req, res) => {
  return successResponse(res, { data: await getTutorEarnings(req.user.id, req.query) });
};

/** GET /tutor/payouts - payout history. */
export const listPayouts = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { tutor_id: req.user.id, ...dateRange(req.query, 'created_at') };
  if (req.query.status) where.status = req.query.status;
  const { count, rows } = await TutorPayout.findAndCountAll({
    where,
    attributes: { exclude: ['created_by'] },
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { payouts: rows }, meta: meta(count) });
};

export default {
  getDashboard,
  listStudents,
  getStudentDetails,
  getEnrollmentProgress,
  listReviews,
  getEarnings,
  listPayouts
};
