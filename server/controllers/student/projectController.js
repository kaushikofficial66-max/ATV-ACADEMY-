import path from 'path';
import { Op } from 'sequelize';
import { Project, ProjectSubmission, Course, User, CourseProgress } from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { assertEnrolled } from '../../services/accessService.js';
import { recordFile, sendStoredFile } from '../../services/storageService.js';
import { storageKeyFor } from '../../middlewares/upload.js';
import { getProgressRules, getProgressSummaries, recalculateCourseProgress } from '../../services/progressService.js';
import { getTutorIdsForCourse } from '../../services/courseService.js';
import { notifyUsers, getUserIdsByRole } from '../../services/notificationService.js';

/** Phase 2 of the 90% rule: the project unlocks once auto progress reaches the cap (90%). */
const eligibility = async (enrollment) => {
  const progress = await CourseProgress.findOne({ where: { enrollment_id: enrollment.id } });
  const { cap } = await getProgressRules();
  const autoPct = Number(progress?.completion_percentage || 0);
  return { threshold: cap, progress_percentage: autoPct, is_eligible: autoPct >= cap || enrollment.status === 'completed' };
};

/** GET /student/courses/:courseId/project - instructions, eligibility, submission status. */
export const getCourseProject = async (req, res) => {
  const enrollment = await assertEnrolled(req.user.id, req.params.courseId);
  const project = await Project.findOne({ where: { course_id: req.params.courseId, status: 'active' } });
  if (!project) throw ApiError.notFound('This course does not have a final project.');

  const submissions = await ProjectSubmission.findAll({
    where: { project_id: project.id, student_id: req.user.id },
    attributes: { exclude: ['file_url'] },
    include: [{ model: User, as: 'reviewer', attributes: ['id', 'first_name', 'last_name'] }],
    order: [['submitted_at', 'DESC']]
  });
  const latest = submissions[0] || null;
  const elig = await eligibility(enrollment);
  const canSubmit = elig.is_eligible && (!latest || ['rejected', 'resubmission_required'].includes(latest.status));

  return successResponse(res, {
    data: {
      project: {
        id: project.id,
        title: project.title,
        instructions: project.instructions,
        allowed_file_types: project.allowed_file_types,
        max_file_size: project.max_file_size
      },
      eligibility: elig,
      can_submit: canSubmit,
      submission_status: latest ? latest.status : 'not_submitted',
      progress: (await getProgressSummaries([enrollment]))[enrollment.id],
      latest_submission: latest,
      submissions
    }
  });
};

/**
 * POST /student/projects/:projectId/submit (multipart `project_file`, optional submission_note)
 * Requires 90% course progress. The course then shows "Pending Approval" until a
 * tutor/admin reviews it. Re-submission allowed after rejection / change request.
 */
export const submitProject = async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please upload your project in the "project_file" field.');
  const project = await Project.findByPk(req.params.projectId);
  if (!project || project.status !== 'active') throw ApiError.notFound('Project not found.');
  const enrollment = await assertEnrolled(req.user.id, project.course_id);

  const elig = await eligibility(enrollment);
  if (!elig.is_eligible) {
    throw ApiError.forbidden(`Reach ${elig.threshold}% course progress (watch recorded videos / join live classes) before submitting the final project - you are at ${elig.progress_percentage}%.`);
  }

  const latest = await ProjectSubmission.findOne({ where: { project_id: project.id, student_id: req.user.id }, order: [['submitted_at', 'DESC']] });
  if (latest && ['submitted', 'under_review'].includes(latest.status)) {
    throw ApiError.conflict('Your previous submission is still awaiting review.');
  }
  if (latest && latest.status === 'approved') throw ApiError.conflict('Your project has already been approved.');

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const allowed = Array.isArray(project.allowed_file_types) ? project.allowed_file_types : [];
  if (allowed.length && !allowed.includes(ext)) {
    throw new ApiError(415, `File type .${ext} is not allowed. Allowed types: ${allowed.map((t) => `.${t}`).join(', ')}`);
  }
  if (project.max_file_size && req.file.size > Number(project.max_file_size)) {
    throw new ApiError(413, `File is too large. Maximum size is ${(Number(project.max_file_size) / (1024 * 1024)).toFixed(1)} MB.`);
  }

  const submission = await ProjectSubmission.create({
    project_id: project.id,
    student_id: req.user.id,
    enrollment_id: enrollment.id,
    file_url: storageKeyFor(req.file),
    file_name: req.file.originalname.slice(0, 255),
    file_size: req.file.size,
    submission_note: req.body.submission_note || null,
    status: 'submitted',
    submitted_at: new Date()
  });
  await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'project_submission', entityId: submission.id });

  // Appears on tutor + admin dashboards for review.
  const course = await Course.findByPk(project.course_id, { attributes: ['title'] });
  const reviewers = [...new Set([...(await getTutorIdsForCourse(project.course_id)), ...(await getUserIdsByRole('admin'))])];
  await notifyUsers(reviewers, {
    title: 'Project awaiting approval',
    message: `${req.user.first_name} ${req.user.last_name || ''} submitted the final project for "${course.title}". It is pending your approval.`,
    type: 'project_submitted',
    reference_type: 'project_submission',
    reference_id: submission.id
  });

  const progress = await recalculateCourseProgress(enrollment.id);
  const { file_url: _hidden, ...data } = submission.toJSON();
  return successResponse(res, {
    statusCode: 201,
    message: 'Project submitted - status: Pending Approval. You will be notified once it is reviewed.',
    data: { submission: data, progress }
  });
};

/** GET /student/project-submissions - all of the student's submissions with tutor review status. */
export const listMySubmissions = async (req, res) => {
  const submissions = await ProjectSubmission.findAll({
    where: { student_id: req.user.id },
    attributes: { exclude: ['file_url'] },
    include: [
      { model: Project, as: 'project', attributes: ['id', 'title', 'course_id'], include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }] },
      { model: User, as: 'reviewer', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['submitted_at', 'DESC']]
  });
  return successResponse(res, { data: { submissions } });
};

/** GET /student/project-submissions/:submissionId/download - the student's own file. */
export const downloadMySubmission = async (req, res) => {
  const submission = await ProjectSubmission.findOne({ where: { id: req.params.submissionId, student_id: req.user.id } });
  if (!submission) throw ApiError.notFound('Submission not found.');
  return sendStoredFile(res, submission.file_url, { downloadName: submission.file_name });
};

/** DELETE /student/project-submissions/:submissionId - withdraw a submission not yet reviewed. */
export const withdrawSubmission = async (req, res) => {
  const submission = await ProjectSubmission.findOne({
    where: { id: req.params.submissionId, student_id: req.user.id, status: { [Op.in]: ['submitted'] } }
  });
  if (!submission) throw ApiError.notFound('No withdrawable submission found (it may already be under review).');
  await submission.destroy();
  return successResponse(res, { message: 'Submission withdrawn.' });
};

export default { getCourseProject, submitProject, listMySubmissions, downloadMySubmission, withdrawSubmission };
