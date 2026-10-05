import { Op } from 'sequelize';
import { Certificate, Course, User, Enrollment } from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { DOWNLOADABLE_STATUSES, loadCertificateForRender, streamCertificatePdf } from '../../services/certificateService.js';

/** GET /student/certificates - all certificates with status (pending / issued / revoked). */
export const listMyCertificates = async (req, res) => {
  const certificates = await Certificate.findAll({
    where: { user_id: req.user.id },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] },
      { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'] },
      { model: Enrollment, as: 'enrollment', attributes: ['id', 'completed_at', 'completion_percentage'] }
    ],
    order: [['created_at', 'DESC']]
  });
  return successResponse(res, {
    data: {
      certificates: certificates.map((c) => ({
        ...c.toJSON(),
        is_downloadable: DOWNLOADABLE_STATUSES.includes(c.status),
        status_label: { pending: 'Awaiting tutor approval', approved: 'Approved', issued: 'Issued', revoked: 'Revoked' }[c.status]
      }))
    }
  });
};

/**
 * GET /student/courses/:courseId/certificate - certificate status for one
 * course, including what is still required when it is not available yet.
 */
export const getCourseCertificateStatus = async (req, res) => {
  const enrollment = await Enrollment.findOne({
    where: { user_id: req.user.id, course_id: req.params.courseId, status: { [Op.ne]: 'cancelled' } }
  });
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this course.');
  const certificate = await Certificate.findOne({ where: { enrollment_id: enrollment.id } });
  return successResponse(res, {
    data: {
      completion_percentage: Number(enrollment.completion_percentage),
      course_completed: enrollment.status === 'completed',
      certificate,
      status: certificate ? certificate.status : 'not_eligible',
      is_downloadable: Boolean(certificate && DOWNLOADABLE_STATUSES.includes(certificate.status))
    }
  });
};

/** GET /student/certificates/:certificateId/download - PDF download. */
export const downloadCertificate = async (req, res) => {
  const certificate = await loadCertificateForRender({ id: req.params.certificateId, user_id: req.user.id });
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  if (!DOWNLOADABLE_STATUSES.includes(certificate.status)) {
    throw ApiError.forbidden(certificate.status === 'pending' ? 'Your certificate is awaiting tutor approval.' : 'This certificate has been revoked.');
  }
  return streamCertificatePdf(certificate, res);
};

export default { listMyCertificates, getCourseCertificateStatus, downloadCertificate };
