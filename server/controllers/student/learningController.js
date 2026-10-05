import { Op } from 'sequelize';
import {
  Enrollment,
  Course,
  Category,
  CourseProgress,
  CourseSection,
  Lecture,
  LectureProgress,
  RecordedVideo,
  VideoProgress,
  CourseResource,
  Quiz,
  QuizAttempt,
  Project,
  ProjectSubmission,
  Certificate,
  User
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination } from '../../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../../utils/serializers.js';
import { getVideoPlayback, PLAYABLE_VIDEO_STATUSES } from '../../services/videoService.js';
import { assertCourseContentAccess, canManageCourse, getAccessEnrollment } from '../../services/accessService.js';
import { recordLectureProgress, recalculateCourseProgress, recordProgressActivity, getProgressSummaries, getProgressRules } from '../../services/progressService.js';
import { sendStoredFile } from '../../services/storageService.js';
import { getSetting } from '../../services/settingsService.js';
import { logVideoPlay } from '../../services/sessionService.js';

const PLAYABLE_VIDEO = PLAYABLE_VIDEO_STATUSES;

/**
 * GET /student/courses - "My Courses" (purchased courses with progress).
 * Filter: status=active|completed|in_progress|not_started
 */
export const getMyCourses = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { user_id: req.user.id, status: { [Op.in]: ['active', 'completed', 'expired'] } };
  if (req.query.status === 'completed') where.status = 'completed';
  if (req.query.status === 'active') where.status = 'active';
  if (req.query.status === 'in_progress') Object.assign(where, { status: 'active', completion_percentage: { [Op.gt]: 0 } });
  if (req.query.status === 'not_started') Object.assign(where, { status: 'active', completion_percentage: 0 });

  const { count, rows } = await Enrollment.findAndCountAll({
    where,
    include: [
      {
        model: Course,
        as: 'course',
        attributes: ['id', 'title', 'slug', 'thumbnail_url', 'level', 'duration_minutes', 'short_description'],
        include: [
          { model: Category, as: 'category', attributes: ['id', 'name'] },
          { model: User, as: 'tutors', attributes: PUBLIC_USER_ATTRS, through: { attributes: [] } }
        ],
        ...(req.query.search && { where: { title: { [Op.like]: `%${req.query.search}%` } } })
      },
      { model: CourseProgress, as: 'courseProgress' },
      { model: Certificate, as: 'certificate', attributes: ['id', 'status', 'certificate_number'] }
    ],
    order: [['updated_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  const summaries = await getProgressSummaries(rows);
  return successResponse(res, {
    data: { enrollments: rows.map((e) => ({ ...e.toJSON(), progress: summaries[e.id] })) },
    meta: meta(count)
  });
};

/** GET /student/continue-learning - most recently studied courses with the next lecture to resume. */
export const continueLearning = async (req, res) => {
  const enrollments = await Enrollment.findAll({
    where: { user_id: req.user.id, status: 'active' },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] },
      { model: CourseProgress, as: 'courseProgress' }
    ],
    order: [[{ model: CourseProgress, as: 'courseProgress' }, 'updated_at', 'DESC']],
    limit: Math.min(Number(req.query.limit) || 5, 20)
  });

  const summaries = await getProgressSummaries(enrollments);
  const items = [];
  for (const e of enrollments) {
    const next = await findResumeLecture(req.user.id, e.course_id, e.courseProgress?.last_lecture_id);
    items.push({
      enrollment_id: e.id,
      course: e.course,
      completion_percentage: Number(e.completion_percentage),
      progress: summaries[e.id],
      resume_lecture: next
    });
  }
  return successResponse(res, { data: { courses: items } });
};

/** Next incomplete published lecture (in curriculum order), else the last lecture. */
const findResumeLecture = async (userId, courseId, lastLectureId) => {
  const lectures = await Lecture.findAll({
    where: { status: 'published' },
    attributes: ['id', 'title', 'lecture_type', 'section_id', 'sort_order'],
    include: [{ model: CourseSection, as: 'section', attributes: ['id', 'title', 'sort_order'], where: { course_id: courseId, status: 'active' } }],
    order: [
      [{ model: CourseSection, as: 'section' }, 'sort_order', 'ASC'],
      ['sort_order', 'ASC']
    ]
  });
  if (!lectures.length) return null;
  const completed = new Set(
    (
      await LectureProgress.findAll({
        where: { user_id: userId, lecture_id: { [Op.in]: lectures.map((l) => l.id) }, completed: true },
        attributes: ['lecture_id']
      })
    ).map((p) => p.lecture_id)
  );
  const lastIdx = lastLectureId ? lectures.findIndex((l) => l.id === Number(lastLectureId)) : -1;
  if (lastIdx >= 0 && !completed.has(lectures[lastIdx].id)) return lectures[lastIdx];
  const after = lectures.slice(lastIdx + 1).find((l) => !completed.has(l.id));
  return after || lectures.find((l) => !completed.has(l.id)) || lectures[lectures.length - 1];
};

/**
 * GET /student/courses/:courseId/learn - course player: curriculum with
 * per-lecture progress, quizzes, project status and resume point.
 */
export const getCoursePlayer = async (req, res) => {
  const { courseId } = req.params;
  const enrollment = await assertCourseContentAccess(req.user, courseId);

  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'title', 'slug', 'thumbnail_url', 'short_description', 'level', 'language', 'status'],
    include: [{ model: User, as: 'tutors', attributes: PUBLIC_USER_ATTRS, through: { attributes: ['is_primary'] } }]
  });

  const sections = await CourseSection.findAll({
    where: { course_id: courseId, status: 'active' },
    attributes: ['id', 'title', 'description', 'sort_order'],
    include: [
      {
        model: Lecture,
        as: 'lectures',
        where: { status: 'published' },
        required: false,
        attributes: ['id', 'title', 'description', 'lecture_type', 'sort_order', 'is_preview', 'duration_seconds'],
        include: [
          { model: RecordedVideo, as: 'video', required: false, where: { status: { [Op.in]: PLAYABLE_VIDEO } }, attributes: ['id', 'title', 'duration_seconds', 'thumbnail_url'] },
          { model: CourseResource, as: 'resources', required: false, where: { status: 'active' }, attributes: ['id', 'title', 'file_name', 'file_type', 'file_size'] },
          { model: Quiz, as: 'quizzes', required: false, where: { status: 'published' }, attributes: ['id', 'title'] }
        ]
      }
    ],
    order: [
      ['sort_order', 'ASC'],
      [{ model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']
    ]
  });

  const lectureIds = sections.flatMap((s) => s.lectures.map((l) => l.id));
  const progressRows = lectureIds.length
    ? await LectureProgress.findAll({ where: { user_id: req.user.id, lecture_id: { [Op.in]: lectureIds } } })
    : [];
  const progressMap = new Map(progressRows.map((p) => [p.lecture_id, p]));
  const videoIds = sections.flatMap((s) => s.lectures.filter((l) => l.video).map((l) => l.video.id));
  const videoProgress = videoIds.length ? await VideoProgress.findAll({ where: { user_id: req.user.id, video_id: { [Op.in]: videoIds } } }) : [];
  const videoProgressMap = new Map(videoProgress.map((v) => [v.video_id, v]));

  const curriculum = sections.map((s) => {
    const lectures = s.lectures.map((l) => {
      const p = progressMap.get(l.id);
      const vp = l.video ? videoProgressMap.get(l.video.id) : null;
      return {
        ...l.toJSON(),
        progress: {
          completed: Boolean(p?.completed),
          completion_percentage: Number(p?.completion_percentage || 0),
          watched_seconds: p?.watched_seconds || 0,
          last_position_seconds: vp?.last_position_seconds || 0
        }
      };
    });
    return {
      ...s.toJSON(),
      lectures,
      completed_lectures: lectures.filter((l) => l.progress.completed).length,
      total_lectures: lectures.length
    };
  });

  const [quizzes, project, courseProgress, certificate] = await Promise.all([
    Quiz.findAll({ where: { course_id: courseId, status: 'published' }, attributes: ['id', 'title', 'section_id', 'lecture_id', 'passing_marks', 'total_marks', 'max_attempts', 'time_limit_minutes'] }),
    Project.findOne({ where: { course_id: courseId, status: 'active' }, attributes: ['id', 'title'] }),
    enrollment ? CourseProgress.findOne({ where: { enrollment_id: enrollment.id } }) : null,
    enrollment ? Certificate.findOne({ where: { enrollment_id: enrollment.id }, attributes: ['id', 'status', 'certificate_number'] }) : null
  ]);

  const attempts = enrollment && quizzes.length
    ? await QuizAttempt.findAll({ where: { user_id: req.user.id, quiz_id: { [Op.in]: quizzes.map((q) => q.id) }, status: 'submitted' }, attributes: ['quiz_id', 'percentage', 'passed'] })
    : [];
  const quizSummaries = quizzes.map((q) => {
    const mine = attempts.filter((a) => a.quiz_id === q.id);
    return {
      ...q.toJSON(),
      attempts_used: mine.length,
      best_percentage: mine.length ? Math.max(...mine.map((a) => Number(a.percentage))) : null,
      passed: mine.some((a) => a.passed)
    };
  });

  const summary = enrollment ? (await getProgressSummaries([enrollment]))[enrollment.id] : null;

  let projectSummary = null;
  if (project) {
    const latest = enrollment
      ? await ProjectSubmission.findOne({ where: { project_id: project.id, student_id: req.user.id }, order: [['submitted_at', 'DESC']], attributes: ['id', 'status', 'submitted_at', 'tutor_feedback'] })
      : null;
    projectSummary = {
      ...project.toJSON(),
      eligibility_threshold: summary ? summary.progress_cap_percentage : (await getProgressRules()).cap,
      is_eligible: Boolean(summary?.eligible_for_final_project),
      can_submit: Boolean(summary?.can_submit_project),
      latest_submission: latest
    };
  }

  const resume = enrollment ? await findResumeLecture(req.user.id, courseId, courseProgress?.last_lecture_id) : null;

  return successResponse(res, {
    data: {
      course,
      enrollment,
      progress: summary && {
        ...summary,
        overall_completion_percentage: summary.completion_percentage,
        total_lectures: courseProgress?.total_lectures || 0,
        completed_lectures: courseProgress?.completed_lectures || 0,
        last_lecture_id: courseProgress?.last_lecture_id || null
      },
      completion_threshold: await getSetting('lecture_completion_threshold'),
      curriculum,
      quizzes: quizSummaries,
      project: projectSummary,
      certificate,
      resume_lecture: resume,
      is_staff_preview: !enrollment
    }
  });
};

/** Loads a lecture and enforces access (preview lectures are open to all logged-in users). */
const loadLectureWithAccess = async (user, lectureId) => {
  const lecture = await Lecture.findByPk(lectureId, {
    include: [{ model: CourseSection, as: 'section', attributes: ['id', 'title', 'course_id', 'status'] }]
  });
  if (!lecture) throw ApiError.notFound('Lecture not found.');
  const courseId = lecture.section.course_id;
  const staff = await canManageCourse(user, courseId);
  if (!staff && (lecture.status !== 'published' || lecture.section.status !== 'active')) throw ApiError.notFound('Lecture not found.');

  const enrollment = staff ? null : await getAccessEnrollment(user.id, courseId);
  if (!staff && !enrollment && !lecture.is_preview) {
    throw ApiError.forbidden('Access restricted: please enroll in this course to view this lecture.');
  }
  return { lecture, courseId, enrollment, staff };
};

/**
 * GET /student/lectures/:lectureId - lecture content, video (with a signed
 * stream URL), resources, quizzes and the student's progress.
 */
export const getLecture = async (req, res) => {
  const { lecture, courseId, enrollment } = await loadLectureWithAccess(req.user, req.params.lectureId);

  const [video, resources, quizzes, progress] = await Promise.all([
    RecordedVideo.findOne({
      where: { lecture_id: lecture.id, status: { [Op.in]: PLAYABLE_VIDEO } },
      attributes: ['id', 'title', 'description', 'duration_seconds', 'thumbnail_url', 'mime_type', 'storage_key', 'video_url', 'vimeo_video_id', 'status'],
      order: [['sort_order', 'ASC']]
    }),
    CourseResource.findAll({ where: { lecture_id: lecture.id, status: 'active' }, attributes: ['id', 'title', 'file_name', 'file_type', 'file_size'] }),
    Quiz.findAll({ where: { lecture_id: lecture.id, status: 'published' }, attributes: ['id', 'title', 'time_limit_minutes', 'max_attempts'] }),
    LectureProgress.findOne({ where: { user_id: req.user.id, lecture_id: lecture.id } })
  ]);

  let videoData = null;
  if (video) {
    const vp = await VideoProgress.findOne({ where: { user_id: req.user.id, video_id: video.id } });
    const playback = await getVideoPlayback(video, req.user.id);
    videoData = {
      id: video.id,
      title: video.title,
      description: video.description,
      duration_seconds: video.duration_seconds,
      thumbnail_url: playback.thumbnail_url,
      mime_type: video.mime_type,
      stream_url: playback.stream_url,
      is_external: playback.provider === 'external',
      playback,
      progress: {
        last_position_seconds: vp?.last_position_seconds || 0,
        watched_seconds: vp?.watched_seconds || 0,
        completion_percentage: Number(vp?.completion_percentage || 0),
        completed: Boolean(vp?.completed)
      }
    };
  }

  // Previous / next published lecture for player navigation.
  const ordered = await Lecture.findAll({
    where: { status: 'published' },
    attributes: ['id', 'title'],
    include: [{ model: CourseSection, as: 'section', attributes: [], where: { course_id: courseId, status: 'active' } }],
    order: [
      [{ model: CourseSection, as: 'section' }, 'sort_order', 'ASC'],
      ['sort_order', 'ASC']
    ]
  });
  const idx = ordered.findIndex((l) => l.id === lecture.id);

  return successResponse(res, {
    data: {
      lecture: {
        id: lecture.id,
        title: lecture.title,
        description: lecture.description,
        lecture_type: lecture.lecture_type,
        duration_seconds: lecture.duration_seconds,
        is_preview: lecture.is_preview,
        section: { id: lecture.section.id, title: lecture.section.title },
        course_id: courseId
      },
      video: videoData,
      resources,
      quizzes,
      progress: progress || { completed: false, completion_percentage: 0, watched_seconds: 0 },
      completion_threshold: await getSetting('lecture_completion_threshold'),
      navigation: {
        previous: idx > 0 ? ordered[idx - 1] : null,
        next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null
      },
      is_enrolled: Boolean(enrollment)
    }
  });
};

/**
 * POST /student/lectures/:lectureId/progress
 * { watched_seconds, position_seconds, completed }
 * Send periodically from the player (e.g. every 15s and on pause/end).
 * Video lectures complete automatically at 90% watched; other lecture types
 * complete with { completed: true }.
 */
export const updateLectureProgress = async (req, res) => {
  const { lecture, enrollment } = await loadLectureWithAccess(req.user, req.params.lectureId);
  if (!enrollment) throw ApiError.forbidden('Progress is only tracked for enrolled students.');
  if (lecture.status !== 'published') throw ApiError.badRequest('This lecture is not published.');

  const result = await recordLectureProgress({
    user: req.user,
    enrollment,
    lecture,
    watchedSeconds: req.body.watched_seconds,
    positionSeconds: req.body.position_seconds,
    markComplete: req.body.completed === true || req.body.completed === 'true'
  });
  return successResponse(res, { message: 'Progress saved.', data: result });
};

/** POST /student/lectures/:lectureId/complete - mark a non-video lecture complete. */
export const completeLecture = async (req, res) => {
  req.body = { ...req.body, completed: true };
  return updateLectureProgress(req, res);
};

/** GET /student/courses/:courseId/progress - recomputed progress snapshot. */
export const getCourseProgress = async (req, res) => {
  const enrollment = await getAccessEnrollment(req.user.id, req.params.courseId);
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this course.');
  return successResponse(res, { data: { progress: await recalculateCourseProgress(enrollment.id) } });
};

/** GET /student/courses/:courseId/resources - all active resources of an enrolled course. */
export const getCourseResources = async (req, res) => {
  await assertCourseContentAccess(req.user, req.params.courseId);
  const resources = await CourseResource.findAll({
    where: { course_id: req.params.courseId, status: 'active' },
    attributes: ['id', 'title', 'file_name', 'file_type', 'file_size', 'lecture_id', 'created_at'],
    include: [{ model: Lecture, as: 'lecture', attributes: ['id', 'title'] }],
    order: [['created_at', 'ASC']]
  });
  return successResponse(res, { data: { resources } });
};

/** GET /student/resources/:resourceId/download */
export const downloadResource = async (req, res) => {
  const resource = await CourseResource.findByPk(req.params.resourceId);
  if (!resource || resource.status !== 'active') throw ApiError.notFound('Resource not found.');
  if (resource.lecture_id) {
    await loadLectureWithAccess(req.user, resource.lecture_id);
  } else {
    await assertCourseContentAccess(req.user, resource.course_id);
  }
  return sendStoredFile(res, resource.file_url, { downloadName: resource.file_name });
};

/** Records a counted "play" of a recorded video and returns the updated progress. */
const countVideoPlay = async (req, video) => {
  const enrollment = await getAccessEnrollment(req.user.id, video.course_id);
  if (!enrollment) {
    // Staff previewing a course: nothing to count.
    return { counted: false, reason: 'not_enrolled', increment_applied: 0, progress: null };
  }
  // Every play is logged with its device (admin student insights), counted or not.
  await logVideoPlay(req, video);
  return recordProgressActivity({ enrollment, type: 'video_play', referenceId: video.id });
};

/**
 * POST /student/videos/:videoId/play - call when the student presses play on a
 * recorded video. Adds the fixed progress increment (up to 90%).
 */
export const playVideo = async (req, res) => {
  const video = await RecordedVideo.findByPk(req.params.videoId);
  if (!video || !PLAYABLE_VIDEO.includes(video.status)) throw ApiError.notFound('Video not found.');
  if (video.lecture_id) await loadLectureWithAccess(req.user, video.lecture_id);
  else await assertCourseContentAccess(req.user, video.course_id);
  const result = await countVideoPlay(req, video);
  return successResponse(res, { message: result.counted ? `Progress +${result.increment_applied}%.` : 'Play recorded.', data: result });
};

/** POST /student/lectures/:lectureId/play - same as above, using the lecture's recorded video. */
export const playLectureVideo = async (req, res) => {
  const { lecture } = await loadLectureWithAccess(req.user, req.params.lectureId);
  const video = await RecordedVideo.findOne({
    where: { lecture_id: lecture.id, status: { [Op.in]: PLAYABLE_VIDEO } },
    order: [['sort_order', 'ASC']]
  });
  if (!video) throw ApiError.notFound('This lecture has no playable recorded video.');
  const result = await countVideoPlay(req, video);
  return successResponse(res, { message: result.counted ? `Progress +${result.increment_applied}%.` : 'Play recorded.', data: result });
};

/** GET /student/videos/:videoId - any playable course video (library view) for an enrolled student. */
export const getVideo = async (req, res) => {
  const video = await RecordedVideo.findByPk(req.params.videoId);
  if (!video || !PLAYABLE_VIDEO.includes(video.status)) throw ApiError.notFound('Video not found.');
  if (video.lecture_id) await loadLectureWithAccess(req.user, video.lecture_id);
  else await assertCourseContentAccess(req.user, video.course_id);
  const vp = await VideoProgress.findOne({ where: { user_id: req.user.id, video_id: video.id } });
  const playback = await getVideoPlayback(video, req.user.id);
  return successResponse(res, {
    data: {
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        duration_seconds: video.duration_seconds,
        thumbnail_url: playback.thumbnail_url,
        lecture_id: video.lecture_id,
        section_id: video.section_id,
        stream_url: playback.stream_url,
        playback
      },
      progress: vp
    }
  });
};

export default {
  getMyCourses,
  continueLearning,
  getCoursePlayer,
  getLecture,
  updateLectureProgress,
  completeLecture,
  getCourseProgress,
  getCourseResources,
  downloadResource,
  getVideo,
  playVideo,
  playLectureVideo
};
