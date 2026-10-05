import { Op } from 'sequelize';
import {
  Project,
  ProjectSubmission,
  Enrollment,
  Course,
  User,
  CourseProgress,
  Certificate
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { pick, parseJsonArray } from '../../utils/helpers.js';
import { getPagination } from '../../utils/pagination.js';
import { assertCourseManager, isAdmin, getTutorCourseIds } from '../../services/accessService.js';
import { sendStoredFile } from '../../services/storageService.js';
import { recalculateCourseProgress } from '../../services/progressService.js';
import { notifyUser } from '../../services/notificationService.js';

const STUDENT_ATTRS = ['id', 'first_name', 'last_name', 'email', 'profile_image'];

const normalizeProjectPayload = (body) => {
  const data = pick(body, ['title', 'instructions', 'max_file_size', 'status']);
  const types = parseJsonArray(body.allowed_file_types);
  if (types !== undefined) data.allowed_file_types = types.map((t) => String(t).toLowerCase().replace(/^\./, ''));
  if (data.max_file_size === '' || data.max_file_size === null) data.max_file_size = null;
  // Accept size in MB for convenience.
  if (body.max_file_size_mb) data.max_file_size = Math.round(Number(body.max_file_size_mb) * 1024 * 1024);
  return data;
};

/** GET /courses/:courseId/projects */
export const listCourseProjects = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const projects = await Project.findAll({
    where: { course_id: req.params.courseId },
    attributes: {
      include: [
        [Project.sequelize.literal('(SELECT COUNT(*) FROM project_submissions s WHERE s.project_id = `Project`.`id`)'), 'submission_count'],
        [Project.sequelize.literal("(SELECT COUNT(*) FROM project_submissions s WHERE s.project_id = `Project`.`id` AND s.status IN ('submitted','under_review'))"), 'pending_review_count']
      ]
    },
    order: [['created_at', 'ASC']]
  });
  return successResponse(res, { data: { projects } });
};

/**
 * POST /courses/:courseId/projects - final project instructions.
 * Only one active project per course: the course's completion flow uses it.
 */
export const createProject = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const data = normalizeProjectPayload(req.body);
  if ((data.status || 'active') === 'active') {
    const active = await Project.findOne({ where: { course_id: course.id, status: 'active' } });
    if (active) throw ApiError.conflict('This course already has an active final project. Edit it or deactivate it first.');
  }
  const project = await Project.create({ ...data, course_id: course.id, created_by: req.user.id, status: data.status || 'active' });
  return successResponse(res, { statusCode: 201, message: 'Project created.', data: { project } });
};

const findProjectForManager = async (user, projectId) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw ApiError.notFound('Project not found.');
  await assertCourseManager(user, project.course_id);
  return project;
};

/** GET /projects/:projectId */
export const getProject = async (req, res) => {
  const project = await findProjectForManager(req.user, req.params.projectId);
  return successResponse(res, { data: { project } });
};

/** PUT /projects/:projectId */
export const updateProject = async (req, res) => {
  const project = await findProjectForManager(req.user, req.params.projectId);
  const data = normalizeProjectPayload(req.body);
  if (data.status === 'active' && project.status !== 'active') {
    const active = await Project.findOne({ where: { course_id: project.course_id, status: 'active', id: { [Op.ne]: project.id } } });
    if (active) throw ApiError.conflict('Another project is already active for this course.');
  }
  await project.update(data);
  return successResponse(res, { message: 'Project updated.', data: { project } });
};

/** DELETE /projects/:projectId - only when no submissions exist. */
export const deleteProject = async (req, res) => {
  const project = await findProjectForManager(req.user, req.params.projectId);
  const submissions = await ProjectSubmission.count({ where: { project_id: project.id } });
  if (submissions) throw ApiError.conflict('This project has submissions. Set it to inactive instead.');
  await project.destroy();
  return successResponse(res, { message: 'Project deleted.' });
};

/**
 * GET /project-submissions - submissions across the tutor's courses (admin: all).
 * Filters: status, course_id, project_id, student_id, search
 */
export const listSubmissions = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.project_id) where.project_id = req.query.project_id;
  if (req.query.student_id) where.student_id = req.query.student_id;

  const projectWhere = {};
  if (req.query.course_id) {
    await assertCourseManager(req.user, req.query.course_id);
    projectWhere.course_id = req.query.course_id;
  } else if (!isAdmin(req.user)) {
    projectWhere.course_id = { [Op.in]: await getTutorCourseIds(req.user.id) };
  }

  const studentWhere = req.query.search
    ? {
        [Op.or]: [
          { first_name: { [Op.like]: `%${req.query.search}%` } },
          { last_name: { [Op.like]: `%${req.query.search}%` } },
          { email: { [Op.like]: `%${req.query.search}%` } }
        ]
      }
    : undefined;

  const { count, rows } = await ProjectSubmission.findAndCountAll({
    where,
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['id', 'title', 'course_id'],
        where: projectWhere,
        include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }]
      },
      { model: User, as: 'student', attributes: STUDENT_ATTRS, ...(studentWhere && { where: studentWhere }) },
      { model: User, as: 'reviewer', attributes: ['id', 'first_name', 'last_name'] },
      { model: Enrollment, as: 'enrollment', attributes: ['id', 'completion_percentage', 'status'] }
    ],
    order: [['submitted_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { submissions: rows }, meta: meta(count) });
};

const findSubmissionForManager = async (user, submissionId) => {
  const submission = await ProjectSubmission.findByPk(submissionId, {
    include: [
      { model: Project, as: 'project', include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }] },
      { model: User, as: 'student', attributes: STUDENT_ATTRS },
      { model: User, as: 'reviewer', attributes: ['id', 'first_name', 'last_name'] },
      { model: Enrollment, as: 'enrollment', include: [{ model: CourseProgress, as: 'courseProgress' }] }
    ]
  });
  if (!submission) throw ApiError.notFound('Submission not found.');
  await assertCourseManager(user, submission.project.course_id);
  return submission;
};

/** GET /project-submissions/:submissionId (also lists the student's previous submissions) */
export const getSubmission = async (req, res) => {
  const submission = await findSubmissionForManager(req.user, req.params.submissionId);
  const history = await ProjectSubmission.findAll({
    where: { project_id: submission.project_id, student_id: submission.student_id, id: { [Op.ne]: submission.id } },
    attributes: ['id', 'file_name', 'status', 'tutor_feedback', 'submitted_at', 'reviewed_at'],
    order: [['submitted_at', 'DESC']]
  });
  return successResponse(res, { data: { submission, history } });
};

/** GET /project-submissions/:submissionId/download */
export const downloadSubmission = async (req, res) => {
  const submission = await findSubmissionForManager(req.user, req.params.submissionId);
  if (submission.status === 'submitted') await submission.update({ status: 'under_review' });
  return sendStoredFile(res, submission.file_url, { downloadName: submission.file_name });
};

/**
 * PUT /project-submissions/:submissionId/review { status, tutor_feedback }
 * status: under_review | approved | rejected | resubmission_required.
 * 90% rule, phase 3: approval takes the course to 100% and issues the
 * certificate (student can view/download it right away). Rejection keeps the
 * course at 90%, notifies the student and lets them resubmit.
 */
export const reviewSubmission = async (req, res) => {
  const submission = await findSubmissionForManager(req.user, req.params.submissionId);
  const { status, tutor_feedback } = req.body;

  if (submission.status === 'approved' && status !== 'approved') {
    throw ApiError.conflict('This submission is already approved. Revoke the certificate from the admin panel if needed.');
  }
  if (['rejected', 'resubmission_required'].includes(status) && !tutor_feedback) {
    throw ApiError.badRequest('Please add feedback so the student knows what to change.');
  }

  await submission.update({
    status,
    tutor_feedback: tutor_feedback ?? submission.tutor_feedback,
    reviewed_by: req.user.id,
    reviewed_at: new Date()
  });

  const progress = await recalculateCourseProgress(submission.enrollment_id, { approvedBy: status === 'approved' ? req.user.id : null });

  const titles = {
    under_review: 'Project under review',
    approved: 'Project approved - course completed',
    rejected: 'Project not approved - please resubmit',
    resubmission_required: 'Project needs changes - please resubmit'
  };
  const labels = {
    under_review: 'is being reviewed',
    approved: 'has been approved. Your course is now 100% complete and your certificate is ready to view and download',
    rejected: 'was not approved. Your progress stays at 90% - you can upload a new version',
    resubmission_required: 'needs some changes. Your progress stays at 90% - please upload an updated version'
  };
  await notifyUser(submission.student_id, {
    title: titles[status],
    message: `Your final project for "${submission.project.course.title}" ${labels[status]}.${tutor_feedback ? ` Feedback: ${tutor_feedback}` : ''}`,
    type: 'project_review',
    reference_type: 'project_submission',
    reference_id: submission.id
  });

  const certificate =
    status === 'approved'
      ? await Certificate.findOne({ where: { enrollment_id: submission.enrollment_id }, attributes: ['id', 'certificate_number', 'status', 'issue_date', 'certificate_url'] })
      : null;
  return successResponse(res, {
    message: status === 'approved' ? 'Project approved - course completed (100%) and certificate issued.' : `Submission marked as ${status}.`,
    data: { submission, course_progress: progress, certificate }
  });
};

export default {
  listCourseProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listSubmissions,
  getSubmission,
  downloadSubmission,
  reviewSubmission
};
