import { Op } from 'sequelize';
import {
  Certificate,
  Course,
  User,
  Enrollment,
  CourseProgress,
  ProjectSubmission,
  Project,
  QuizAttempt,
  Quiz
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination } from '../../utils/pagination.js';
import { isAdmin, assertCourseManager, getTutorCourseIds } from '../../services/accessService.js';
import { issueCertificate, ensurePendingCertificate, loadCertificateForRender, streamCertificatePdf } from '../../services/certificateService.js';
import { recalculateCourseProgress } from '../../services/progressService.js';
import { notifyUser } from '../../services/notificationService.js';

const STUDENT_ATTRS = ['id', 'first_name', 'last_name', 'email', 'profile_image'];

/** GET /certificates - tutor: own courses; admin: all. Filters: status, course_id, search */
export const listCertificates = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.course_id) {
    await assertCourseManager(req.user, req.query.course_id);
    where.course_id = req.query.course_id;
  } else if (!isAdmin(req.user)) {
    where.course_id = { [Op.in]: await getTutorCourseIds(req.user.id) };
  }
  if (req.query.search) where.certificate_number = { [Op.like]: `%${req.query.search}%` };

  const { count, rows } = await Certificate.findAndCountAll({
    where,
    include: [
      { model: User, as: 'student', attributes: STUDENT_ATTRS },
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] },
      { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'] },
      { model: Enrollment, as: 'enrollment', attributes: ['id', 'completion_percentage', 'status', 'completed_at'] }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { certificates: rows }, meta: meta(count) });
};

const findCertificateForManager = async (user, certificateId) => {
  const certificate = await Certificate.findByPk(certificateId);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  await assertCourseManager(user, certificate.course_id);
  return certificate;
};

/**
 * GET /certificates/:certificateId/review - "Review Completion": everything a
 * tutor needs before approving (progress, project submission, quiz results).
 */
export const reviewCompletion = async (req, res) => {
  const certificate = await findCertificateForManager(req.user, req.params.certificateId);
  const [student, course, enrollment, submissions, attempts] = await Promise.all([
    User.findByPk(certificate.user_id, { attributes: STUDENT_ATTRS }),
    Course.findByPk(certificate.course_id, { attributes: ['id', 'title', 'slug'] }),
    Enrollment.findByPk(certificate.enrollment_id, { include: [{ model: CourseProgress, as: 'courseProgress' }] }),
    ProjectSubmission.findAll({
      where: { enrollment_id: certificate.enrollment_id },
      include: [{ model: Project, as: 'project', attributes: ['id', 'title'] }],
      order: [['submitted_at', 'DESC']]
    }),
    QuizAttempt.findAll({
      where: { enrollment_id: certificate.enrollment_id, status: 'submitted' },
      include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title', 'passing_marks', 'total_marks'] }],
      order: [['submitted_at', 'DESC']]
    })
  ]);
  return successResponse(res, { data: { certificate, student, course, enrollment, project_submissions: submissions, quiz_attempts: attempts } });
};

/** POST /certificates/:certificateId/approve - issues the certificate to the student. */
export const approveCertificate = async (req, res) => {
  const certificate = await findCertificateForManager(req.user, req.params.certificateId);
  if (certificate.status === 'issued' || certificate.status === 'approved') {
    return successResponse(res, { message: 'Certificate is already approved.', data: { certificate } });
  }
  if (certificate.status === 'revoked' && !isAdmin(req.user)) {
    throw ApiError.forbidden('Only an admin can re-issue a revoked certificate.');
  }
  const enrollment = await Enrollment.findByPk(certificate.enrollment_id);
  if (!enrollment || enrollment.status !== 'completed') {
    throw ApiError.badRequest('The student has not completed this course yet.');
  }
  await issueCertificate(certificate, req.user.id);
  return successResponse(res, { message: 'Certificate approved and issued.', data: { certificate } });
};

/** POST /certificates/:certificateId/revoke { reason } (admin) */
export const revokeCertificate = async (req, res) => {
  const certificate = await Certificate.findByPk(req.params.certificateId);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  await certificate.update({ status: 'revoked' });
  await notifyUser(certificate.user_id, {
    title: 'Certificate revoked',
    message: `Your certificate ${certificate.certificate_number} has been revoked.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
    type: 'certificate_revoked',
    reference_type: 'certificate',
    reference_id: certificate.id
  });
  return successResponse(res, { message: 'Certificate revoked.', data: { certificate } });
};

/**
 * POST /certificates/generate { enrollment_id } (admin)
 * Manually creates the pending certificate for an enrollment, e.g. after
 * marking it completed; optionally issue immediately with { issue: true }.
 */
export const generateCertificate = async (req, res) => {
  const enrollment = await Enrollment.findByPk(req.body.enrollment_id);
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  if (enrollment.status !== 'completed') {
    await recalculateCourseProgress(enrollment.id);
    await enrollment.reload();
    if (enrollment.status !== 'completed') throw ApiError.badRequest('Enrollment is not completed yet.');
  }
  const certificate = await ensurePendingCertificate(enrollment);
  if (req.body.issue) await issueCertificate(certificate, req.user.id);
  return successResponse(res, { statusCode: 201, message: 'Certificate generated.', data: { certificate } });
};

/** GET /certificates/:certificateId/download - staff preview of the PDF. */
export const downloadCertificate = async (req, res) => {
  const certificate = await findCertificateForManager(req.user, req.params.certificateId);
  const full = await loadCertificateForRender({ id: certificate.id });
  return streamCertificatePdf(full, res);
};

export default {
  listCertificates,
  reviewCompletion,
  approveCertificate,
  revokeCertificate,
  generateCertificate,
  downloadCertificate
};
