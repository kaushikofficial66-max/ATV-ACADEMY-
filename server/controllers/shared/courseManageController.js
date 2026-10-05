import { Op, fn, col } from 'sequelize';
import {
  sequelize,
  Course,
  Category,
  CourseTutor,
  CourseSection,
  Lecture,
  CourseResource,
  RecordedVideo,
  Quiz,
  Project,
  User,
  Enrollment,
  OrderItem,
  LiveClass
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { pick, toBool, uniqueSlug } from '../../utils/helpers.js';
import { getPagination } from '../../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../../utils/serializers.js';
import {
  isAdmin,
  assertCourseManager,
  findSectionForManager,
  findLectureForManager,
  getTutorCourseIds
} from '../../services/accessService.js';
import { decorateCourses } from '../../services/courseService.js';
import { recordFile, removeStoredFile, sendStoredFile } from '../../services/storageService.js';
import { publicUrlFor, storageKeyFor } from '../../middlewares/upload.js';
import { storeVideoUpload, recordVideoFile, removeVideoAsset, syncVimeoVideo, getVideoPlayback, providerOf } from '../../services/videoService.js';
import { isVimeoConfigured, createDirectUpload, deleteVimeoVideo, getVideoDetails, mapVimeoState, parseVimeoId, isVimeoUrl } from '../../services/vimeoService.js';
import { recalculateCourseEnrollments } from '../../services/progressService.js';
import { notifyAdmins } from '../../services/notificationService.js';

const COURSE_FIELDS = [
  'title',
  'category_id',
  'short_description',
  'description',
  'price',
  'discount_price',
  'duration_minutes',
  'level',
  'language'
];

/** Status transitions a tutor may perform on their own course. Admins may set any status. */
const TUTOR_TRANSITIONS = {
  draft: ['pending'],
  rejected: ['pending', 'draft'],
  pending: ['draft'],
  approved: ['published', 'draft'],
  published: ['archived'],
  archived: ['pending']
};

const refreshProgressLater = (courseId) =>
  setImmediate(() => recalculateCourseEnrollments(courseId).catch((e) => console.error('[Progress recalculation]', e.message)));

const normalizeCoursePayload = (body) => {
  const data = pick(body, COURSE_FIELDS);
  if (data.discount_price === '' || data.discount_price === 'null') data.discount_price = null;
  if (data.duration_minutes === '') data.duration_minutes = null;
  if (data.price !== undefined && data.discount_price !== undefined && data.discount_price !== null) {
    if (Number(data.discount_price) > Number(data.price)) throw ApiError.badRequest('Discount price cannot be greater than the price.');
  }
  return data;
};

const assertCategory = async (categoryId) => {
  if (categoryId === undefined) return;
  const category = await Category.findByPk(categoryId);
  if (!category) throw ApiError.badRequest('Selected category does not exist.');
};

// ==========================================================================
// Courses
// ==========================================================================

/** GET /tutor/courses - courses the tutor is assigned to. */
export const listMyCourses = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const ids = await getTutorCourseIds(req.user.id);
  const where = { id: { [Op.in]: ids } };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.title = { [Op.like]: `%${req.query.search}%` };

  const { count, rows } = await Course.findAndCountAll({
    where,
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] },
      { model: User, as: 'tutors', attributes: PUBLIC_USER_ATTRS, through: { attributes: ['is_primary'] } }
    ],
    order: [['updated_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { courses: await decorateCourses(rows) }, meta: meta(count) });
};

/** POST /courses - create a course (multipart; optional `thumbnail`). */
export const createCourse = async (req, res) => {
  const data = normalizeCoursePayload(req.body);
  await assertCategory(data.category_id);

  const admin = isAdmin(req.user);
  const status = admin && ['draft', 'approved', 'published'].includes(req.body.status) ? req.body.status : 'draft';

  const course = await sequelize.transaction(async (transaction) => {
    const created = await Course.create(
      {
        ...data,
        slug: await uniqueSlug(Course, req.body.slug || data.title),
        created_by: req.user.id,
        status,
        ...(status !== 'draft' && { approved_by: req.user.id, approved_at: new Date() }),
        ...(status === 'published' && { published_at: new Date() })
      },
      { transaction }
    );
    if (req.file) {
      await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'course_thumbnail', entityId: created.id, transaction });
      await created.update({ thumbnail_url: publicUrlFor(req.file) }, { transaction });
    }
    // The creating tutor becomes the primary tutor. Admins can pass tutor_id to assign one.
    const tutorId = admin ? req.body.tutor_id : req.user.id;
    if (tutorId) {
      const tutor = await User.findByPk(tutorId, { include: ['role'] });
      if (!tutor || tutor.role.name !== 'tutor') throw ApiError.badRequest('tutor_id must reference a tutor account.');
      await CourseTutor.create({ course_id: created.id, tutor_id: tutorId, is_primary: true }, { transaction });
    }
    return created;
  });

  return successResponse(res, { statusCode: 201, message: 'Course created successfully.', data: { course } });
};

/** GET /courses/:courseId - full management view incl. curriculum, videos, resources. */
export const getCourseForManage = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const course = await Course.findByPk(req.params.courseId, {
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] },
      { model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'tutors', attributes: [...PUBLIC_USER_ATTRS, 'email'], through: { attributes: ['is_primary'] } },
      {
        model: CourseSection,
        as: 'sections',
        required: false,
        include: [
          {
            model: Lecture,
            as: 'lectures',
            required: false,
            include: [
              { model: RecordedVideo, as: 'video', required: false, attributes: ['id', 'title', 'status', 'duration_seconds', 'thumbnail_url'] },
              { model: CourseResource, as: 'resources', required: false, attributes: ['id', 'title', 'file_name', 'file_type', 'file_size', 'status'] },
              { model: Quiz, as: 'quizzes', required: false, attributes: ['id', 'title', 'status'] }
            ]
          }
        ]
      }
    ],
    order: [
      [{ model: CourseSection, as: 'sections' }, 'sort_order', 'ASC'],
      [{ model: CourseSection, as: 'sections' }, { model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']
    ]
  });

  const [decorated] = await decorateCourses([course]);
  const [videoCount, resourceCount, quizCount, project, liveClassCount] = await Promise.all([
    RecordedVideo.count({ where: { course_id: course.id, status: { [Op.ne]: 'deleted' } } }),
    CourseResource.count({ where: { course_id: course.id } }),
    Quiz.count({ where: { course_id: course.id } }),
    Project.findOne({ where: { course_id: course.id }, attributes: ['id', 'title', 'status'] }),
    LiveClass.count({ where: { course_id: course.id } })
  ]);

  return successResponse(res, {
    data: {
      course: decorated,
      summary: { videos: videoCount, resources: resourceCount, quizzes: quizCount, live_classes: liveClassCount, project },
      allowed_status_transitions: isAdmin(req.user)
        ? ['draft', 'pending', 'approved', 'published', 'rejected', 'archived']
        : TUTOR_TRANSITIONS[course.status] || []
    }
  });
};

/** PUT /courses/:courseId */
export const updateCourse = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const data = normalizeCoursePayload(req.body);
  await assertCategory(data.category_id);

  const finalPrice = data.price !== undefined ? data.price : course.price;
  const finalDiscount = data.discount_price !== undefined ? data.discount_price : course.discount_price;
  if (finalDiscount !== null && Number(finalDiscount) > Number(finalPrice)) {
    throw ApiError.badRequest('Discount price cannot be greater than the price.');
  }
  if (req.body.slug && isAdmin(req.user)) data.slug = await uniqueSlug(Course, req.body.slug, course.id);

  const oldThumb = course.thumbnail_url;
  if (req.file) {
    await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'course_thumbnail', entityId: course.id });
    data.thumbnail_url = publicUrlFor(req.file);
  } else if (req.body.remove_thumbnail && toBool(req.body.remove_thumbnail)) {
    data.thumbnail_url = null;
  }
  await course.update(data);
  if ((req.file || data.thumbnail_url === null) && oldThumb) await removeStoredFile(oldThumb);

  return successResponse(res, { message: 'Course updated successfully.', data: { course } });
};

/**
 * DELETE /courses/:courseId
 * Hard-deletes only courses without enrollments/sales; otherwise archive it.
 * Tutors may only delete draft or rejected courses.
 */
export const deleteCourse = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  if (!isAdmin(req.user) && !['draft', 'rejected'].includes(course.status)) {
    throw ApiError.forbidden('Only draft or rejected courses can be deleted. Archive published courses instead.');
  }
  const [enrollments, sales] = await Promise.all([
    Enrollment.count({ where: { course_id: course.id } }),
    OrderItem.count({ where: { course_id: course.id } })
  ]);
  if (enrollments || sales) {
    throw ApiError.conflict('This course has enrollments or orders and cannot be deleted. Archive it instead.');
  }

  const videos = await RecordedVideo.findAll({ where: { course_id: course.id }, attributes: ['id', 'storage_key', 'vimeo_video_id'] });
  const resources = await CourseResource.findAll({ where: { course_id: course.id }, attributes: ['file_url'] });
  await course.destroy();
  for (const v of videos) await removeVideoAsset(v);
  for (const r of resources) await removeStoredFile(r.file_url);
  if (course.thumbnail_url) await removeStoredFile(course.thumbnail_url);

  return successResponse(res, { message: 'Course deleted successfully.' });
};

/** POST /courses/:courseId/submit - tutor submits a draft/rejected course for admin approval. */
export const submitCourseForReview = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  if (!['draft', 'rejected', 'archived'].includes(course.status)) {
    throw ApiError.badRequest(`A ${course.status} course cannot be submitted for review.`);
  }
  const lectureCount = await Lecture.count({
    include: [{ model: CourseSection, as: 'section', where: { course_id: course.id } }]
  });
  if (!lectureCount) throw ApiError.badRequest('Add at least one section and lecture before submitting for review.');

  await course.update({ status: 'pending', approval_note: null });
  await notifyAdmins({
    title: 'Course submitted for review',
    message: `"${course.title}" was submitted for approval by ${req.user.first_name} ${req.user.last_name || ''}.`,
    type: 'course_review',
    reference_type: 'course',
    reference_id: course.id
  });
  return successResponse(res, { message: 'Course submitted for admin review.', data: { course } });
};

/** PATCH /courses/:courseId/status { status } - tutor-limited transitions, admin any. */
export const changeCourseStatus = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const { status } = req.body;
  if (!isAdmin(req.user) && !(TUTOR_TRANSITIONS[course.status] || []).includes(status)) {
    throw ApiError.forbidden(`You cannot change a ${course.status} course to ${status}.`);
  }
  if (status === 'pending') return submitCourseForReview(req, res);

  await course.update({
    status,
    ...(status === 'published' && !course.published_at && { published_at: new Date() }),
    ...(isAdmin(req.user) && ['approved', 'published', 'rejected'].includes(status) && { approved_by: req.user.id, approved_at: new Date() }),
    ...(isAdmin(req.user) && req.body.approval_note !== undefined && { approval_note: req.body.approval_note })
  });
  return successResponse(res, { message: `Course status changed to ${status}.`, data: { course } });
};

// ==========================================================================
// Curriculum: sections
// ==========================================================================

/** GET /courses/:courseId/curriculum - sections + lectures for the builder. */
export const getCurriculum = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const sections = await CourseSection.findAll({
    where: { course_id: req.params.courseId },
    include: [
      {
        model: Lecture,
        as: 'lectures',
        required: false,
        include: [{ model: RecordedVideo, as: 'video', required: false, attributes: ['id', 'title', 'status', 'duration_seconds'] }]
      }
    ],
    order: [
      ['sort_order', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']
    ]
  });
  return successResponse(res, { data: { sections } });
};

/** POST /courses/:courseId/sections */
export const createSection = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const maxOrder = (await CourseSection.max('sort_order', { where: { course_id: course.id } })) || 0;
  const section = await CourseSection.create({
    course_id: course.id,
    title: req.body.title,
    description: req.body.description || null,
    sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order) : maxOrder + 1,
    status: req.body.status === 'inactive' ? 'inactive' : 'active'
  });
  return successResponse(res, { statusCode: 201, message: 'Section created.', data: { section } });
};

/** PUT /sections/:sectionId */
export const updateSection = async (req, res) => {
  const section = await findSectionForManager(req.user, req.params.sectionId);
  const statusChanged = req.body.status !== undefined && req.body.status !== section.status;
  await section.update(pick(req.body, ['title', 'description', 'sort_order', 'status']));
  if (statusChanged) refreshProgressLater(section.course_id);
  return successResponse(res, { message: 'Section updated.', data: { section } });
};

/** DELETE /sections/:sectionId - removes the section, its lectures and attached videos. */
export const deleteSection = async (req, res) => {
  const section = await findSectionForManager(req.user, req.params.sectionId);
  const videos = await RecordedVideo.findAll({ where: { section_id: section.id }, attributes: ['id', 'storage_key', 'vimeo_video_id'] });
  await section.destroy();
  for (const v of videos) await removeVideoAsset(v);
  refreshProgressLater(section.course_id);
  return successResponse(res, { message: 'Section deleted.' });
};

/** PUT /courses/:courseId/sections/reorder { section_ids: [3, 1, 2] } */
export const reorderSections = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const ids = (req.body.section_ids || []).map(Number);
  const sections = await CourseSection.findAll({ where: { course_id: course.id }, attributes: ['id'] });
  const valid = new Set(sections.map((s) => s.id));
  if (!ids.length || ids.some((id) => !valid.has(id))) throw ApiError.badRequest('section_ids must list sections of this course.');
  await sequelize.transaction(async (transaction) => {
    for (let i = 0; i < ids.length; i += 1) {
      await CourseSection.update({ sort_order: i + 1 }, { where: { id: ids[i] }, transaction });
    }
  });
  return successResponse(res, { message: 'Sections reordered.' });
};

// ==========================================================================
// Curriculum: lectures
// ==========================================================================

const LECTURE_FIELDS = ['title', 'description', 'lecture_type', 'sort_order', 'is_preview', 'duration_seconds', 'status'];

/** POST /sections/:sectionId/lectures */
export const createLecture = async (req, res) => {
  const section = await findSectionForManager(req.user, req.params.sectionId);
  const data = pick(req.body, LECTURE_FIELDS);
  const maxOrder = (await Lecture.max('sort_order', { where: { section_id: section.id } })) || 0;
  const lecture = await Lecture.create({
    ...data,
    section_id: section.id,
    is_preview: toBool(data.is_preview),
    sort_order: data.sort_order !== undefined ? Number(data.sort_order) : maxOrder + 1,
    status: data.status || 'published'
  });
  if (lecture.status === 'published') refreshProgressLater(section.course_id);
  return successResponse(res, { statusCode: 201, message: 'Lecture created.', data: { lecture } });
};

/** GET /lectures/:lectureId */
export const getLectureForManage = async (req, res) => {
  await findLectureForManager(req.user, req.params.lectureId);
  const lecture = await Lecture.findByPk(req.params.lectureId, {
    include: [
      { model: CourseSection, as: 'section', attributes: ['id', 'title', 'course_id'] },
      { model: RecordedVideo, as: 'video', required: false },
      { model: CourseResource, as: 'resources', required: false },
      { model: Quiz, as: 'quizzes', required: false, attributes: ['id', 'title', 'status'] }
    ]
  });
  return successResponse(res, { data: { lecture } });
};

/** PUT /lectures/:lectureId (can move to another section of the same course via section_id) */
export const updateLecture = async (req, res) => {
  const lecture = await findLectureForManager(req.user, req.params.lectureId);
  const data = pick(req.body, LECTURE_FIELDS);
  if (data.is_preview !== undefined) data.is_preview = toBool(data.is_preview);
  if (req.body.section_id && Number(req.body.section_id) !== lecture.section_id) {
    const target = await CourseSection.findByPk(req.body.section_id);
    if (!target || target.course_id !== lecture.section.course_id) throw ApiError.badRequest('Target section must belong to the same course.');
    data.section_id = target.id;
    await RecordedVideo.update({ section_id: target.id }, { where: { lecture_id: lecture.id } });
  }
  const statusChanged = data.status !== undefined && data.status !== lecture.status;
  await lecture.update(data);
  if (statusChanged) refreshProgressLater(lecture.section.course_id);
  return successResponse(res, { message: 'Lecture updated.', data: { lecture } });
};

/** DELETE /lectures/:lectureId - attached videos are unassigned (kept in the course library). */
export const deleteLecture = async (req, res) => {
  const lecture = await findLectureForManager(req.user, req.params.lectureId);
  await lecture.destroy(); // recorded_videos.lecture_id / resources.lecture_id are SET NULL
  refreshProgressLater(lecture.section.course_id);
  return successResponse(res, { message: 'Lecture deleted. Any attached video remains in the course video library.' });
};

/** PUT /sections/:sectionId/lectures/reorder { lecture_ids: [...] } */
export const reorderLectures = async (req, res) => {
  const section = await findSectionForManager(req.user, req.params.sectionId);
  const ids = (req.body.lecture_ids || []).map(Number);
  const lectures = await Lecture.findAll({ where: { section_id: section.id }, attributes: ['id'] });
  const valid = new Set(lectures.map((l) => l.id));
  if (!ids.length || ids.some((id) => !valid.has(id))) throw ApiError.badRequest('lecture_ids must list lectures of this section.');
  await sequelize.transaction(async (transaction) => {
    for (let i = 0; i < ids.length; i += 1) {
      await Lecture.update({ sort_order: i + 1 }, { where: { id: ids[i] }, transaction });
    }
  });
  return successResponse(res, { message: 'Lectures reordered.' });
};

// ==========================================================================
// Lecture resources
// ==========================================================================

const assertLectureInCourse = async (lectureId, courseId) => {
  if (!lectureId) return null;
  const lecture = await Lecture.findByPk(lectureId, { include: [{ model: CourseSection, as: 'section', attributes: ['course_id'] }] });
  if (!lecture || lecture.section.course_id !== Number(courseId)) throw ApiError.badRequest('lecture_id must belong to this course.');
  return lecture;
};

/** GET /courses/:courseId/resources */
export const listResources = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const resources = await CourseResource.findAll({
    where: { course_id: req.params.courseId, ...(req.query.lecture_id && { lecture_id: req.query.lecture_id }) },
    include: [
      { model: Lecture, as: 'lecture', attributes: ['id', 'title'] },
      { model: User, as: 'uploader', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['created_at', 'DESC']]
  });
  return successResponse(res, { data: { resources } });
};

/** POST /courses/:courseId/resources (multipart `resource_file`, or `file_url` for external links) */
export const createResource = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  await assertLectureInCourse(req.body.lecture_id, course.id);
  if (!req.file && !req.body.file_url) throw ApiError.badRequest('Upload a file in "resource_file" or provide an external "file_url".');
  if (!req.file && !/^https?:\/\//i.test(req.body.file_url)) throw ApiError.badRequest('file_url must be an http(s) URL.');

  const resource = await CourseResource.create({
    course_id: course.id,
    lecture_id: req.body.lecture_id || null,
    uploaded_by: req.user.id,
    title: req.body.title || (req.file ? req.file.originalname : 'Resource'),
    file_name: req.file ? req.file.originalname : req.body.file_name || req.body.file_url.split('/').pop().slice(0, 255),
    file_url: req.file ? storageKeyFor(req.file) : req.body.file_url,
    file_type: req.file ? req.file.mimetype : req.body.file_type || 'link',
    file_size: req.file ? req.file.size : null,
    status: req.body.status === 'inactive' ? 'inactive' : 'active'
  });
  if (req.file) await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'course_resource', entityId: resource.id });
  return successResponse(res, { statusCode: 201, message: 'Resource added.', data: { resource } });
};

/** PUT /resources/:resourceId (optionally replace the file) */
export const updateResource = async (req, res) => {
  const resource = await CourseResource.findByPk(req.params.resourceId);
  if (!resource) throw ApiError.notFound('Resource not found.');
  await assertCourseManager(req.user, resource.course_id);
  if (req.body.lecture_id) await assertLectureInCourse(req.body.lecture_id, resource.course_id);

  const data = pick(req.body, ['title', 'status']);
  if (req.body.lecture_id !== undefined) data.lecture_id = req.body.lecture_id || null;
  const oldFile = resource.file_url;
  if (req.file) {
    Object.assign(data, {
      file_name: req.file.originalname,
      file_url: storageKeyFor(req.file),
      file_type: req.file.mimetype,
      file_size: req.file.size
    });
    await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'course_resource', entityId: resource.id });
  }
  await resource.update(data);
  if (req.file) await removeStoredFile(oldFile);
  return successResponse(res, { message: 'Resource updated.', data: { resource } });
};

/** DELETE /resources/:resourceId */
export const deleteResource = async (req, res) => {
  const resource = await CourseResource.findByPk(req.params.resourceId);
  if (!resource) throw ApiError.notFound('Resource not found.');
  await assertCourseManager(req.user, resource.course_id);
  await resource.destroy();
  await removeStoredFile(resource.file_url);
  return successResponse(res, { message: 'Resource deleted.' });
};

/** GET /resources/:resourceId/download */
export const downloadResource = async (req, res) => {
  const resource = await CourseResource.findByPk(req.params.resourceId);
  if (!resource) throw ApiError.notFound('Resource not found.');
  await assertCourseManager(req.user, resource.course_id);
  return sendStoredFile(res, resource.file_url, { downloadName: resource.file_name });
};

// ==========================================================================
// Recorded videos (upload, assignment, management)
// ==========================================================================

const VIDEO_INCLUDES = [
  { model: CourseSection, as: 'section', attributes: ['id', 'title'] },
  { model: Lecture, as: 'lecture', attributes: ['id', 'title'] },
  { model: User, as: 'uploader', attributes: ['id', 'first_name', 'last_name'] }
];

/** Validates section/lecture belong to course; returns { sectionId, lectureId }. */
const resolveVideoPlacement = async (courseId, sectionId, lectureId) => {
  let lecture = null;
  if (lectureId) {
    lecture = await assertLectureInCourse(lectureId, courseId);
    sectionId = lecture.section_id;
  }
  if (!sectionId) throw ApiError.badRequest('section_id (or lecture_id) is required to place the video in the curriculum.');
  const section = await CourseSection.findByPk(sectionId);
  if (!section || section.course_id !== Number(courseId)) throw ApiError.badRequest('section_id must belong to this course.');
  return { sectionId: section.id, lecture };
};

/** One video per lecture: detach any other video from the lecture. */
const attachToLecture = async (video, lecture, transaction = null) => {
  if (!lecture) return;
  await RecordedVideo.update(
    { lecture_id: null },
    { where: { lecture_id: lecture.id, id: { [Op.ne]: video.id } }, transaction }
  );
  if (video.duration_seconds && !lecture.duration_seconds) {
    await lecture.update({ duration_seconds: video.duration_seconds }, { transaction });
  }
};

/** GET /courses/:courseId/videos - course video library. */
export const listVideos = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const where = { course_id: req.params.courseId, status: { [Op.ne]: 'deleted' } };
  if (req.query.section_id) where.section_id = req.query.section_id;
  if (req.query.unassigned === 'true') where.lecture_id = null;
  if (req.query.status) where.status = req.query.status;
  const videos = await RecordedVideo.findAll({
    where,
    include: VIDEO_INCLUDES,
    order: [['section_id', 'ASC'], ['sort_order', 'ASC'], ['created_at', 'ASC']]
  });
  return successResponse(res, { data: { videos } });
};

/** Creates the lecture for create_lecture=true uploads (inside a transaction). */
const createVideoLecture = async ({ sectionId, title, body, duration, transaction }) => {
  const maxOrder = (await Lecture.max('sort_order', { where: { section_id: sectionId }, transaction })) || 0;
  return Lecture.create(
    {
      section_id: sectionId,
      title,
      description: body.description || null,
      lecture_type: 'video',
      sort_order: maxOrder + 1,
      is_preview: toBool(body.is_preview),
      duration_seconds: duration,
      status: 'published'
    },
    { transaction }
  );
};

/**
 * Resolves where the video comes from:
 *  - multipart `video_file`               -> uploaded (Vimeo when configured, else local disk)
 *  - `vimeo_url` / Vimeo `video_url` / `vimeo_video_id` -> link an existing video on your Vimeo account
 *  - any other http(s) `video_url`        -> external URL
 */
const resolveVideoSource = async (req, title) => {
  const requestedStatus = ['ready', 'published', 'unpublished'].includes(req.body.status) ? req.body.status : 'ready';
  if (req.file) {
    const stored = await storeVideoUpload(req.file, { title, description: req.body.description });
    if (stored.provider === 'local') stored.fields.status = requestedStatus;
    return stored;
  }

  const vimeoInput = req.body.vimeo_url || req.body.vimeo_video_id || (isVimeoUrl(req.body.video_url) ? req.body.video_url : null);
  if (vimeoInput) {
    const vimeoId = parseVimeoId(vimeoInput);
    if (!vimeoId) throw ApiError.badRequest('Could not read a Vimeo video id from the given Vimeo URL.');
    const details = await getVideoDetails(vimeoId); // also confirms the token can access it
    const mapped = mapVimeoState(details);
    return {
      provider: 'vimeo_linked',
      fields: {
        vimeo_video_id: vimeoId,
        storage_key: null,
        video_url: mapped.embed_url || `https://player.vimeo.com/video/${vimeoId}`,
        thumbnail_url: req.body.thumbnail_url || mapped.thumbnail_url,
        status: mapped.status === 'ready' ? requestedStatus : mapped.status,
        ...(mapped.duration_seconds && { duration_seconds: mapped.duration_seconds })
      }
    };
  }

  if (!req.body.video_url) throw ApiError.badRequest('Upload a video in "video_file", or provide "vimeo_url" / "video_url".');
  if (!/^https?:\/\//i.test(req.body.video_url)) throw ApiError.badRequest('video_url must be an http(s) URL.');
  return { provider: 'external', fields: { video_url: req.body.video_url, mime_type: req.body.mime_type || null, status: requestedStatus } };
};

/**
 * POST /courses/:courseId/videos
 * multipart: video_file | vimeo_url | video_url, section_id | lecture_id, title,
 * description, duration_seconds, sort_order, status, create_lecture, is_preview, thumbnail_url.
 * Uploaded files go to Vimeo when configured (status "processing" until Vimeo
 * finishes transcoding), otherwise to local disk. For large files prefer the
 * direct-upload endpoint so the browser uploads straight to Vimeo.
 */
export const uploadVideo = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  let { sectionId, lecture } = await resolveVideoPlacement(course.id, req.body.section_id, req.body.lecture_id);
  const title = req.body.title || (req.file ? req.file.originalname.replace(/\.[^.]+$/, '') : 'Recorded video');
  const duration = req.body.duration_seconds ? Number(req.body.duration_seconds) : null;

  // Upload / look up the video first (network), then write the DB rows.
  const stored = await resolveVideoSource(req, title);

  let video;
  try {
    video = await sequelize.transaction(async (transaction) => {
      if (!lecture && toBool(req.body.create_lecture)) {
        lecture = await createVideoLecture({ sectionId, title, body: req.body, duration: stored.fields.duration_seconds || duration, transaction });
      }
      const maxVideoOrder = (await RecordedVideo.max('sort_order', { where: { section_id: sectionId }, transaction })) || 0;
      const created = await RecordedVideo.create(
        {
          course_id: course.id,
          section_id: sectionId,
          lecture_id: lecture ? lecture.id : null,
          uploaded_by: req.user.id,
          title,
          description: req.body.description || null,
          video_url: 'pending',
          thumbnail_url: req.body.thumbnail_url || null,
          duration_seconds: duration,
          sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order) : maxVideoOrder + 1,
          ...stored.fields
        },
        { transaction }
      );
      if (stored.provider === 'local') await created.update({ video_url: `/api/v1/media/videos/${created.id}/stream` }, { transaction });
      await recordVideoFile(created, req.file, stored.provider, req.user.id, transaction);
      await attachToLecture(created, lecture, transaction);
      return created;
    });
  } catch (error) {
    if (stored.provider !== 'vimeo_linked') await removeVideoAsset({ id: null, ...stored.fields });
    throw error;
  }

  refreshProgressLater(course.id);
  const full = await RecordedVideo.findByPk(video.id, { include: VIDEO_INCLUDES });
  const messages = {
    vimeo: 'Video uploaded to Vimeo and is processing.',
    vimeo_linked: 'Vimeo video linked.',
    local: 'Recorded video uploaded.',
    external: 'External video added.'
  };
  return successResponse(res, {
    statusCode: 201,
    message: messages[stored.provider],
    data: { video: full, storage_provider: stored.provider === 'vimeo_linked' ? 'vimeo' : stored.provider }
  });
};

/**
 * POST /courses/:courseId/videos/direct-upload
 * { upload_length (bytes, required), section_id | lecture_id, title, description, create_lecture, is_preview }
 * Creates the video on Vimeo plus its record (status "processing") and returns
 * a tus upload URL; the browser uploads the file straight to Vimeo:
 *   new tus.Upload(file, { uploadUrl: upload.url, chunkSize: 64 * 1024 * 1024 }).start()
 * The video becomes playable when Vimeo finishes transcoding (auto-sync / POST /videos/:id/sync).
 */
export const createVideoDirectUpload = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  if (!(await isVimeoConfigured())) throw ApiError.badRequest('Direct uploads require Vimeo. Add VIMEO_ACCESS_TOKEN to .env or Admin > Settings > Storage.');

  let { sectionId, lecture } = await resolveVideoPlacement(course.id, req.body.section_id, req.body.lecture_id);
  const title = req.body.title || 'Recorded video';
  const upload = await createDirectUpload({ size: req.body.upload_length, name: title, description: req.body.description });

  let video;
  try {
    video = await sequelize.transaction(async (transaction) => {
      if (!lecture && toBool(req.body.create_lecture)) {
        lecture = await createVideoLecture({ sectionId, title, body: req.body, duration: null, transaction });
      }
      const maxVideoOrder = (await RecordedVideo.max('sort_order', { where: { section_id: sectionId }, transaction })) || 0;
      const created = await RecordedVideo.create(
        {
          course_id: course.id,
          section_id: sectionId,
          lecture_id: lecture ? lecture.id : null,
          uploaded_by: req.user.id,
          title,
          description: req.body.description || null,
          vimeo_video_id: upload.video_id,
          video_url: upload.embed_url || `https://player.vimeo.com/video/${upload.video_id}`,
          thumbnail_url: req.body.thumbnail_url || null,
          file_size: req.body.upload_length || null,
          sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order) : maxVideoOrder + 1,
          status: 'processing'
        },
        { transaction }
      );
      await recordVideoFile(created, null, 'vimeo', req.user.id, transaction);
      await attachToLecture(created, lecture, transaction);
      return created;
    });
  } catch (error) {
    await deleteVimeoVideo(upload.video_id).catch(() => {});
    throw error;
  }

  const full = await RecordedVideo.findByPk(video.id, { include: VIDEO_INCLUDES });
  return successResponse(res, {
    statusCode: 201,
    message: 'Vimeo upload created. Upload the file to upload.url with tus; the video then processes automatically.',
    data: { video: full, upload }
  });
};

const findVideoForManager = async (user, videoId) => {
  const video = await RecordedVideo.findByPk(videoId);
  if (!video || video.status === 'deleted') throw ApiError.notFound('Video not found.');
  await assertCourseManager(user, video.course_id);
  return video;
};

/** GET /videos/:videoId - details + playback URLs for preview. */
export const getVideoForManage = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  const full = await RecordedVideo.findByPk(video.id, { include: VIDEO_INCLUDES });
  const playback = await getVideoPlayback(video, req.user.id);
  return successResponse(res, { data: { video: full, playback, stream_url: playback.stream_url } });
};

/** POST /videos/:videoId/sync - refresh transcoding status / duration / thumbnail from Vimeo. */
export const syncVideo = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  if (!video.vimeo_video_id) return successResponse(res, { message: 'Video is not stored on Vimeo.', data: { video } });
  const { state } = await syncVimeoVideo(video);
  return successResponse(res, { message: `Video is ${video.status}.`, data: { video, vimeo: state } });
};

/**
 * PUT /videos/:videoId - edit metadata, status and assignment
 * (section_id / lecture_id; lecture_id=null to unassign).
 */
export const updateVideo = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  const data = pick(req.body, ['title', 'description', 'thumbnail_url', 'duration_seconds', 'sort_order']);
  if (req.body.status !== undefined) {
    if (!['ready', 'published', 'unpublished'].includes(req.body.status)) throw ApiError.badRequest('status must be ready, published or unpublished.');
    if (['processing', 'failed'].includes(video.status) && req.body.status !== 'unpublished') {
      throw ApiError.conflict(`This video is ${video.status} on Vimeo and cannot be published yet.`);
    }
    data.status = req.body.status;
  }
  if (req.body.video_url && providerOf(video) === 'external') data.video_url = req.body.video_url;

  let lecture = null;
  if (req.body.lecture_id !== undefined || req.body.section_id !== undefined) {
    if (req.body.lecture_id === null || req.body.lecture_id === '' || req.body.lecture_id === 'null') {
      data.lecture_id = null;
      if (req.body.section_id) data.section_id = (await resolveVideoPlacement(video.course_id, req.body.section_id, null)).sectionId;
    } else {
      const placement = await resolveVideoPlacement(video.course_id, req.body.section_id || video.section_id, req.body.lecture_id);
      data.section_id = placement.sectionId;
      lecture = placement.lecture;
      if (lecture) data.lecture_id = lecture.id;
    }
  }

  await sequelize.transaction(async (transaction) => {
    await video.update(data, { transaction });
    await attachToLecture(video, lecture, transaction);
  });
  refreshProgressLater(video.course_id);
  const full = await RecordedVideo.findByPk(video.id, { include: VIDEO_INCLUDES });
  return successResponse(res, { message: 'Video updated.', data: { video: full } });
};

/**
 * PUT /videos/:videoId/file - replace the video file (multipart `video_file`).
 * The old asset is deleted once the new one is stored.
 */
export const replaceVideoFile = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  if (!req.file) throw ApiError.badRequest('Upload the new video in "video_file".');
  const previous = { id: video.id, vimeo_video_id: video.vimeo_video_id, storage_key: video.storage_key };

  const stored = await storeVideoUpload(req.file, { title: video.title, description: video.description });
  const isLocal = stored.provider === 'local';
  await video.update({
    ...stored.fields,
    ...(isLocal && {
      video_url: `/api/v1/media/videos/${video.id}/stream`,
      status: ['failed', 'processing'].includes(video.status) ? 'ready' : video.status
    }),
    thumbnail_url: isLocal ? video.thumbnail_url : null,
    duration_seconds: req.body.duration_seconds ? Number(req.body.duration_seconds) : isLocal ? video.duration_seconds : null
  });
  await recordVideoFile(video, req.file, stored.provider, req.user.id);
  await removeVideoAsset(previous);
  return successResponse(res, {
    message: isLocal ? 'Video file replaced.' : 'Video replaced on Vimeo; the new file is processing.',
    data: { video, storage_provider: stored.provider }
  });
};

/**
 * POST /videos/:videoId/direct-upload { upload_length } - replace the file
 * through a direct browser (tus) upload to Vimeo.
 */
export const createVideoReplaceUpload = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  if (!(await isVimeoConfigured())) throw ApiError.badRequest('Direct uploads require Vimeo. Add VIMEO_ACCESS_TOKEN to .env or Admin > Settings > Storage.');
  const previous = { id: video.id, vimeo_video_id: video.vimeo_video_id, storage_key: video.storage_key };
  const upload = await createDirectUpload({ size: req.body.upload_length, name: video.title, description: video.description });
  await video.update({
    vimeo_video_id: upload.video_id,
    storage_key: null,
    video_url: upload.embed_url || `https://player.vimeo.com/video/${upload.video_id}`,
    thumbnail_url: null,
    file_size: req.body.upload_length || null,
    duration_seconds: null,
    status: 'processing'
  });
  await recordVideoFile(video, null, 'vimeo', req.user.id);
  await removeVideoAsset(previous);
  return successResponse(res, { statusCode: 201, message: 'Vimeo upload created for the replacement file.', data: { video, upload } });
};

/** DELETE /videos/:videoId - removes the video, its stored asset and watch progress. */
export const deleteVideo = async (req, res) => {
  const video = await findVideoForManager(req.user, req.params.videoId);
  await video.destroy();
  await removeVideoAsset(video);
  refreshProgressLater(video.course_id);
  return successResponse(res, { message: 'Video deleted.' });
};

/** GET /courses/:courseId/stats - quick numbers for course dashboards. */
export const getCourseStats = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  const [statusCounts, avgCompletion] = await Promise.all([
    Enrollment.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], where: { course_id: course.id }, group: ['status'], raw: true }),
    Enrollment.findOne({ attributes: [[fn('AVG', col('completion_percentage')), 'avg']], where: { course_id: course.id, status: { [Op.in]: ['active', 'completed'] } }, raw: true })
  ]);
  return successResponse(res, {
    data: {
      enrollments: Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.count)])),
      average_completion: Math.round(Number(avgCompletion?.avg || 0) * 100) / 100
    }
  });
};

export default {
  listMyCourses,
  createCourse,
  getCourseForManage,
  updateCourse,
  deleteCourse,
  submitCourseForReview,
  changeCourseStatus,
  getCurriculum,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createLecture,
  getLectureForManage,
  updateLecture,
  deleteLecture,
  reorderLectures,
  listResources,
  createResource,
  updateResource,
  deleteResource,
  downloadResource,
  listVideos,
  uploadVideo,
  createVideoDirectUpload,
  getVideoForManage,
  syncVideo,
  createVideoReplaceUpload,
  updateVideo,
  replaceVideoFile,
  deleteVideo,
  getCourseStats
};
