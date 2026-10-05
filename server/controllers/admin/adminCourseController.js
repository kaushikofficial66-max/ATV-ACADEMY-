import { Op, literal } from 'sequelize';
import {
  sequelize,
  Course,
  Category,
  CourseTutor,
  User,
  Role,
  Enrollment,
  CourseProgress,
  Certificate,
  Order,
  ProjectSubmission,
  Project
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, getSort, dateRange } from '../../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../../utils/serializers.js';
import { uniqueSlug, pick } from '../../utils/helpers.js';
import { decorateCourses, getTutorIdsForCourse } from '../../services/courseService.js';
import { notifyUsers, notifyUser } from '../../services/notificationService.js';
import { recordFile, removeStoredFile } from '../../services/storageService.js';
import { publicUrlFor } from '../../middlewares/upload.js';
import { recalculateCourseProgress } from '../../services/progressService.js';
import { issueCompletionCertificate } from '../../services/certificateService.js';

// ==========================================================================
// Courses
// ==========================================================================

/** GET /admin/courses?search=&status=&category_id=&tutor_id=&sort= */
export const listCourses = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query, 'created_at') };
  if (req.query.status) where.status = req.query.status;
  if (req.query.category_id) where.category_id = req.query.category_id;
  if (req.query.search) where.title = { [Op.like]: `%${req.query.search}%` };
  if (req.query.tutor_id) {
    where[Op.and] = [literal(`EXISTS (SELECT 1 FROM course_tutors ct WHERE ct.course_id = \`Course\`.\`id\` AND ct.tutor_id = ${Number(req.query.tutor_id) || 0})`)];
  }
  const { count, rows } = await Course.findAndCountAll({
    where,
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name'] },
      { model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'tutors', attributes: [...PUBLIC_USER_ATTRS, 'email'], through: { attributes: ['is_primary'] } }
    ],
    order: getSort(req.query, ['created_at', 'updated_at', 'title', 'price', 'published_at'], ['updated_at', 'DESC']),
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { courses: await decorateCourses(rows) }, meta: meta(count) });
};

/**
 * PATCH /admin/courses/:courseId/approval { action: approve|reject|publish, approval_note }
 * approve -> approved (tutor may then publish), publish -> approved + published,
 * reject -> rejected with a note the tutor can act on.
 */
export const reviewCourse = async (req, res) => {
  const course = await Course.findByPk(req.params.courseId);
  if (!course) throw ApiError.notFound('Course not found.');
  const { action, approval_note } = req.body;
  if (action === 'reject' && !approval_note) throw ApiError.badRequest('Please provide an approval_note explaining the rejection.');

  const status = { approve: 'approved', publish: 'published', reject: 'rejected' }[action];
  await course.update({
    status,
    approval_note: approval_note || null,
    approved_by: req.user.id,
    approved_at: new Date(),
    ...(status === 'published' && !course.published_at && { published_at: new Date() })
  });

  const messages = {
    approved: `"${course.title}" was approved. You can publish it whenever you are ready.`,
    published: `"${course.title}" was approved and is now live.`,
    rejected: `"${course.title}" needs changes before approval. Note: ${approval_note}`
  };
  await notifyUsers(await getTutorIdsForCourse(course.id), {
    title: `Course ${status}`,
    message: messages[status],
    type: 'course_approval',
    reference_type: 'course',
    reference_id: course.id
  });
  return successResponse(res, { message: `Course ${status}.`, data: { course } });
};

/** PUT /admin/courses/:courseId/tutors { tutors: [{ tutor_id, is_primary }] } - replace tutor assignments. */
export const setCourseTutors = async (req, res) => {
  const course = await Course.findByPk(req.params.courseId);
  if (!course) throw ApiError.notFound('Course not found.');
  const list = Array.isArray(req.body.tutors) ? req.body.tutors : [];
  if (!list.length) throw ApiError.badRequest('At least one tutor is required.');

  const ids = list.map((t) => Number(t.tutor_id));
  const tutors = await User.findAll({ where: { id: { [Op.in]: ids } }, include: [{ model: Role, as: 'role', where: { name: 'tutor' } }] });
  if (tutors.length !== new Set(ids).size) throw ApiError.badRequest('All tutor_id values must reference tutor accounts.');
  let primaryId = list.find((t) => t.is_primary)?.tutor_id || ids[0];
  primaryId = Number(primaryId);

  const previous = await getTutorIdsForCourse(course.id);
  await sequelize.transaction(async (transaction) => {
    await CourseTutor.destroy({ where: { course_id: course.id, tutor_id: { [Op.notIn]: ids } }, transaction });
    for (const id of new Set(ids)) {
      const [row] = await CourseTutor.findOrCreate({ where: { course_id: course.id, tutor_id: id }, defaults: { course_id: course.id, tutor_id: id }, transaction });
      await row.update({ is_primary: id === primaryId }, { transaction });
    }
  });

  const added = ids.filter((id) => !previous.includes(id));
  await notifyUsers(added, { title: 'Assigned to a course', message: `You have been assigned as a tutor for "${course.title}".`, type: 'course_assignment', reference_type: 'course', reference_id: course.id });

  const updated = await Course.findByPk(course.id, { include: [{ model: User, as: 'tutors', attributes: [...PUBLIC_USER_ATTRS, 'email'], through: { attributes: ['is_primary'] } }] });
  return successResponse(res, { message: 'Course tutors updated.', data: { tutors: updated.tutors } });
};

// ==========================================================================
// Categories
// ==========================================================================

/** GET /admin/categories?search=&status= */
export const listCategories = async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
  const categories = await Category.findAll({
    where,
    attributes: { include: [[literal('(SELECT COUNT(*) FROM courses c WHERE c.category_id = `Category`.`id`)'), 'course_count']] },
    order: [['name', 'ASC']]
  });
  return successResponse(res, { data: { categories } });
};

/** POST /admin/categories (multipart: name, description, status, slug?, image) */
export const createCategory = async (req, res) => {
  const category = await Category.create({
    name: req.body.name.trim(),
    slug: await uniqueSlug(Category, req.body.slug || req.body.name),
    description: req.body.description || null,
    image_url: req.file ? publicUrlFor(req.file) : req.body.image_url || null,
    status: req.body.status || 'active'
  });
  if (req.file) await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'category', entityId: category.id });
  return successResponse(res, { statusCode: 201, message: 'Category created.', data: { category } });
};

/** PUT /admin/categories/:categoryId */
export const updateCategory = async (req, res) => {
  const category = await Category.findByPk(req.params.categoryId);
  if (!category) throw ApiError.notFound('Category not found.');
  const data = pick(req.body, ['name', 'description', 'status']);
  if (req.body.slug) data.slug = await uniqueSlug(Category, req.body.slug, category.id);
  const oldImage = category.image_url;
  if (req.file) {
    data.image_url = publicUrlFor(req.file);
    await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'category', entityId: category.id });
  } else if (req.body.image_url !== undefined) {
    data.image_url = req.body.image_url || null;
  }
  await category.update(data);
  if (req.file && oldImage) await removeStoredFile(oldImage);
  return successResponse(res, { message: 'Category updated.', data: { category } });
};

/** DELETE /admin/categories/:categoryId?reassign_to= - blocked while courses use it unless reassigned. */
export const deleteCategory = async (req, res) => {
  const category = await Category.findByPk(req.params.categoryId);
  if (!category) throw ApiError.notFound('Category not found.');
  const courseCount = await Course.count({ where: { category_id: category.id } });
  if (courseCount) {
    if (!req.query.reassign_to) {
      throw ApiError.conflict(`${courseCount} course(s) use this category. Pass ?reassign_to=<categoryId> to move them, or set the category inactive.`);
    }
    const target = await Category.findByPk(req.query.reassign_to);
    if (!target || target.id === category.id) throw ApiError.badRequest('reassign_to must be a different existing category.');
    await Course.update({ category_id: target.id }, { where: { category_id: category.id } });
  }
  await category.destroy();
  if (category.image_url) await removeStoredFile(category.image_url);
  return successResponse(res, { message: 'Category deleted.' });
};

// ==========================================================================
// Enrollments & progress
// ==========================================================================

const ENROLLMENT_INCLUDES = [
  { model: User, as: 'student', attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_image'] },
  { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] },
  { model: CourseProgress, as: 'courseProgress' },
  { model: Order, as: 'order', attributes: ['id', 'order_number', 'total_amount', 'status'] },
  { model: Certificate, as: 'certificate', attributes: ['id', 'status', 'certificate_number'] }
];

/**
 * GET /admin/enrollments?status=&course_id=&user_id=&search=&min_progress=&max_progress=
 * Also serves Admin > Student Progress.
 */
export const listEnrollments = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query, 'enrolled_at') };
  if (req.query.status) where.status = req.query.status;
  if (req.query.course_id) where.course_id = req.query.course_id;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.min_progress || req.query.max_progress) {
    where.completion_percentage = {
      ...(req.query.min_progress && { [Op.gte]: Number(req.query.min_progress) }),
      ...(req.query.max_progress && { [Op.lte]: Number(req.query.max_progress) })
    };
  }
  const include = ENROLLMENT_INCLUDES.map((i) => ({ ...i }));
  if (req.query.search) {
    include[0].where = {
      [Op.or]: [
        { first_name: { [Op.like]: `%${req.query.search}%` } },
        { last_name: { [Op.like]: `%${req.query.search}%` } },
        { email: { [Op.like]: `%${req.query.search}%` } }
      ]
    };
  }
  const { count, rows } = await Enrollment.findAndCountAll({
    where,
    include,
    order: getSort(req.query, ['enrolled_at', 'completion_percentage', 'updated_at'], ['enrolled_at', 'DESC']),
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { enrollments: rows }, meta: meta(count) });
};

/** GET /admin/enrollments/:enrollmentId */
export const getEnrollment = async (req, res) => {
  const enrollment = await Enrollment.findByPk(req.params.enrollmentId, { include: ENROLLMENT_INCLUDES });
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  const submissions = await ProjectSubmission.findAll({
    where: { enrollment_id: enrollment.id },
    attributes: { exclude: ['file_url'] },
    include: [{ model: Project, as: 'project', attributes: ['id', 'title'] }],
    order: [['submitted_at', 'DESC']]
  });
  return successResponse(res, { data: { enrollment, project_submissions: submissions } });
};

/**
 * PATCH /admin/enrollments/:enrollmentId { status, expires_at }
 * status: active | completed | cancelled | expired. Marking completed sets 100%
 * and issues the certificate (manual override of the 90% rule).
 */
export const updateEnrollment = async (req, res) => {
  const enrollment = await Enrollment.findByPk(req.params.enrollmentId);
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  const oldStatus = enrollment.status;
  const updates = {};
  if (req.body.expires_at !== undefined) updates.expires_at = req.body.expires_at || null;
  if (req.body.status) {
    updates.status = req.body.status;
    if (req.body.status === 'completed') Object.assign(updates, { completion_percentage: 100, completed_at: enrollment.completed_at || new Date() });
    if (req.body.status === 'active' && enrollment.status === 'completed') updates.completed_at = null;
  }
  await enrollment.update(updates);

  if (req.body.status === 'completed') {
    await issueCompletionCertificate(enrollment, req.user.id, { reissue: true });
  } else if (req.body.status === 'active') {
    await recalculateCourseProgress(enrollment.id);
  }
  if (req.body.status && req.body.status !== oldStatus) {
    const course = await Course.findByPk(enrollment.course_id, { attributes: ['title'] });
    await notifyUser(enrollment.user_id, {
      title: 'Enrollment updated',
      message: `Your enrollment in "${course.title}" is now ${req.body.status}.`,
      type: 'enrollment_status',
      reference_type: 'course',
      reference_id: enrollment.course_id
    });
  }
  return successResponse(res, { message: 'Enrollment updated.', data: { enrollment: await Enrollment.findByPk(enrollment.id, { include: ENROLLMENT_INCLUDES }) } });
};

/** POST /admin/enrollments/:enrollmentId/recalculate - recompute progress from lecture data. */
export const recalculateEnrollment = async (req, res) => {
  const enrollment = await Enrollment.findByPk(req.params.enrollmentId);
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  return successResponse(res, { data: { progress: await recalculateCourseProgress(enrollment.id) } });
};

export default {
  listCourses,
  reviewCourse,
  setCourseTutors,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listEnrollments,
  getEnrollment,
  updateEnrollment,
  recalculateEnrollment
};
