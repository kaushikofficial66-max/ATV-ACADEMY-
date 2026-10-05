import PDFDocument from 'pdfkit';
import { Certificate, Course, User, Enrollment } from '../models/index.js';
import { generateCertificateNumber, fullName } from '../utils/helpers.js';
import { getSetting } from './settingsService.js';
import { notifyUser, getUserIdsByRole, notifyUsers } from './notificationService.js';
import { getTutorIdsForCourse } from './courseService.js';

/** Statuses in which the student can see and download the certificate. */
export const DOWNLOADABLE_STATUSES = ['approved', 'issued'];

/**
 * Creates the pending certificate for a completed enrollment (idempotent) and
 * notifies the course tutors that it is waiting for their approval.
 */
export const ensurePendingCertificate = async (enrollment) => {
  const existing = await Certificate.findOne({ where: { enrollment_id: enrollment.id } });
  if (existing) return existing;

  let certificate;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      certificate = await Certificate.create({
        certificate_number: generateCertificateNumber(),
        user_id: enrollment.user_id,
        course_id: enrollment.course_id,
        enrollment_id: enrollment.id,
        status: 'pending'
      });
      break;
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      const raced = await Certificate.findOne({ where: { enrollment_id: enrollment.id } });
      if (raced) return raced;
    }
  }

  const [course, student] = await Promise.all([
    Course.findByPk(enrollment.course_id, { attributes: ['id', 'title'] }),
    User.findByPk(enrollment.user_id, { attributes: ['first_name', 'last_name'] })
  ]);
  const tutorIds = await getTutorIdsForCourse(enrollment.course_id);
  const recipients = tutorIds.length ? tutorIds : await getUserIdsByRole('admin');
  await notifyUsers(recipients, {
    title: 'Certificate awaiting approval',
    message: `${fullName(student)} completed "${course?.title}". Please review and approve the certificate.`,
    type: 'certificate_pending',
    reference_type: 'certificate',
    reference_id: certificate.id
  });
  return certificate;
};

/**
 * Phase 3 of the 90% rule: when the course is completed (project approved),
 * the certificate is created and issued immediately so the student can view
 * and download it. Idempotent; re-issues a revoked certificate only when
 * `reissue` is true.
 */
export const issueCompletionCertificate = async (enrollment, approverId = null, { reissue = false } = {}) => {
  let certificate = await Certificate.findOne({ where: { enrollment_id: enrollment.id } });
  if (!certificate) {
    for (let attempt = 0; attempt < 3 && !certificate; attempt += 1) {
      try {
        certificate = await Certificate.create({
          certificate_number: generateCertificateNumber(),
          user_id: enrollment.user_id,
          course_id: enrollment.course_id,
          enrollment_id: enrollment.id,
          status: 'pending'
        });
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        certificate = await Certificate.findOne({ where: { enrollment_id: enrollment.id } });
      }
    }
  }
  if (DOWNLOADABLE_STATUSES.includes(certificate.status)) return certificate;
  if (certificate.status === 'revoked' && !reissue) return certificate;
  return issueCertificate(certificate, approverId);
};

/** Approves (issues) a certificate. Used by tutors and admins. */
export const issueCertificate = async (certificate, approverId) => {
  await certificate.update({
    status: 'issued',
    approved_by: approverId,
    issue_date: new Date(),
    certificate_url: `/api/v1/student/certificates/${certificate.id}/download`
  });
  const course = await Course.findByPk(certificate.course_id, { attributes: ['title'] });
  await notifyUser(certificate.user_id, {
    title: 'Your certificate is ready',
    message: `Your certificate for "${course?.title}" has been approved and is ready to download.`,
    type: 'certificate_issued',
    reference_type: 'certificate',
    reference_id: certificate.id
  });
  return certificate;
};

/** Loads everything required to render the certificate PDF. */
export const loadCertificateForRender = async (where) =>
  Certificate.findOne({
    where,
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title', 'duration_minutes', 'level'] },
      { model: User, as: 'student', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'] },
      { model: Enrollment, as: 'enrollment', attributes: ['id', 'completed_at'] }
    ]
  });

/**
 * Streams a landscape A4 certificate PDF to the response.
 */
export const streamCertificatePdf = async (certificate, res) => {
  const siteName = await getSetting('site_name');
  const frontendUrl = await getSetting('frontend_url');
  const issued = certificate.issue_date ? new Date(certificate.issue_date) : new Date();
  const issuedText = issued.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificate_number}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  doc.pipe(res);

  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill('#ffffff');
  doc.lineWidth(10).strokeColor('#1e3a8a').rect(20, 20, width - 40, height - 40).stroke();
  doc.lineWidth(2).strokeColor('#c9a227').rect(36, 36, width - 72, height - 72).stroke();

  doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(20).text(siteName.toUpperCase(), 0, 70, { align: 'center', characterSpacing: 3 });
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(40).text('Certificate of Completion', 0, 120, { align: 'center' });
  doc.fillColor('#4b5563').font('Helvetica').fontSize(16).text('This is to certify that', 0, 190, { align: 'center' });
  doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(34).text(fullName(certificate.student), 0, 220, { align: 'center' });
  doc.fillColor('#4b5563').font('Helvetica').fontSize(16).text('has successfully completed the course', 0, 275, { align: 'center' });
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(24).text(certificate.course?.title || '', 80, 305, { align: 'center', width: width - 160 });

  doc.fillColor('#374151').font('Helvetica').fontSize(12);
  doc.text(`Issued on: ${issuedText}`, 80, height - 140);
  doc.text(`Certificate No: ${certificate.certificate_number}`, 80, height - 120);
  if (certificate.approver) {
    doc.text(fullName(certificate.approver), width - 330, height - 140, { width: 250, align: 'center' });
    doc.moveTo(width - 320, height - 145).lineTo(width - 90, height - 145).strokeColor('#9ca3af').lineWidth(1).stroke();
    doc.text('Approved by', width - 330, height - 120, { width: 250, align: 'center' });
  }
  doc.fontSize(9).fillColor('#6b7280').text(`Verify at ${frontendUrl}/certificates/verify/${certificate.certificate_number}`, 0, height - 70, { align: 'center' });

  doc.end();
};

export default { ensurePendingCertificate, issueCompletionCertificate, issueCertificate, loadCertificateForRender, streamCertificatePdf, DOWNLOADABLE_STATUSES };
