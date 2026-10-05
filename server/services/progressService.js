import { Op } from 'sequelize';
import {
  sequelize,
  Enrollment,
  CourseSection,
  Lecture,
  LectureProgress,
  CourseProgress,
  Project,
  ProjectSubmission,
  RecordedVideo,
  VideoProgress,
  Course,
  User,
  ProgressActivity
} from '../models/index.js';
import { getSetting } from './settingsService.js';
import { issueCompletionCertificate } from './certificateService.js';
import { notifyUser } from './notificationService.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Ids of the published lectures in active sections of a course. */
export const getCountableLectureIds = async (courseId) => {
  const lectures = await Lecture.findAll({
    attributes: ['id'],
    where: { status: 'published' },
    include: [{ model: CourseSection, as: 'section', attributes: [], where: { course_id: courseId, status: 'active' } }]
  });
  return lectures.map((l) => l.id);
};

export const courseRequiresProject = async (courseId) =>
  Boolean(await Project.findOne({ where: { course_id: courseId, status: 'active' }, attributes: ['id'] }));

export const hasApprovedProject = async (enrollmentId) =>
  Boolean(await ProjectSubmission.findOne({ where: { enrollment_id: enrollmentId, status: 'approved' }, attributes: ['id'] }));

/** The progress rule settings (admin-configurable). */
export const getProgressRules = async () => {
  const [increment, cap, cooldown] = await Promise.all([
    getSetting('progress_increment_percent'),
    getSetting('progress_auto_cap_percent'),
    getSetting('progress_activity_cooldown_minutes')
  ]);
  const safeCap = Math.min(100, Math.max(1, Number(cap) || 90));
  return {
    increment: Math.min(safeCap, Math.max(0.01, Number(increment) || 10)),
    cap: safeCap,
    cooldownMinutes: Math.max(0, Number(cooldown) || 0)
  };
};

const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  project_unlocked: 'Final project unlocked',
  pending_approval: 'Pending Approval',
  resubmission_required: 'Changes requested - resubmit your project',
  completed: 'Completed'
};

/**
 * Phase of the 90% completion rule for one enrollment:
 *  not_started -> in_progress (0-90%) -> project_unlocked (90%, submit project)
 *  -> pending_approval (project submitted) -> completed (approved, 100%)
 *  A rejected project gives `resubmission_required` (stays at 90%).
 */
export const describeProgress = ({ enrollment, autoPct, rules, requiresProject, latestSubmission }) => {
  const completed = enrollment.status === 'completed';
  let status;
  if (completed) status = 'completed';
  else if (latestSubmission && ['submitted', 'under_review'].includes(latestSubmission.status)) status = 'pending_approval';
  else if (latestSubmission && ['rejected', 'resubmission_required'].includes(latestSubmission.status)) status = 'resubmission_required';
  else if (autoPct >= rules.cap) status = requiresProject ? 'project_unlocked' : 'completed';
  else status = autoPct > 0 ? 'in_progress' : 'not_started';

  const canSubmitProject = requiresProject && !completed && autoPct >= rules.cap && ['project_unlocked', 'resubmission_required'].includes(status);
  return {
    completion_percentage: completed ? 100 : Number(enrollment.completion_percentage),
    auto_progress_percentage: round2(autoPct),
    progress_cap_percentage: rules.cap,
    increment_percentage: rules.increment,
    status,
    status_label: STATUS_LABELS[status],
    requires_project: requiresProject,
    can_submit_project: canSubmitProject,
    eligible_for_final_project: requiresProject && autoPct >= rules.cap,
    project_submission_status: latestSubmission ? latestSubmission.status : null,
    certificate_available: completed
  };
};

const sumIncrements = async (enrollmentId, transaction = null) =>
  Number((await ProgressActivity.sum('increment_percent', { where: { enrollment_id: enrollmentId }, transaction })) || 0);

const latestSubmissionFor = (enrollmentId) =>
  ProjectSubmission.findOne({
    where: { enrollment_id: enrollmentId },
    attributes: ['id', 'status', 'tutor_feedback', 'submitted_at', 'reviewed_at'],
    order: [['submitted_at', 'DESC'], ['id', 'DESC']]
  });

/**
 * Recomputes course_progress and enrollment.completion_percentage with the
 * 90% completion rule:
 *  - auto progress = SUM of counted play/join increments, capped at 90%;
 *  - with an active final project, only project approval takes the course to
 *    100% (enrollment `completed`) and issues the certificate immediately;
 *  - without a project, reaching the cap completes the course.
 * Lecture counts are kept for the curriculum view (checkmarks / resume).
 */
export const recalculateCourseProgress = async (enrollmentId, { lastLectureId = null, approvedBy = null } = {}) => {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;
  const rules = await getProgressRules();

  const lectureIds = await getCountableLectureIds(enrollment.course_id);
  const totalLectures = lectureIds.length;
  const completedLectures = totalLectures
    ? await LectureProgress.count({ where: { user_id: enrollment.user_id, lecture_id: { [Op.in]: lectureIds }, completed: true } })
    : 0;

  const autoPct = Math.min(rules.cap, await sumIncrements(enrollment.id));
  const requiresProject = await courseRequiresProject(enrollment.course_id);
  const projectApproved = await hasApprovedProject(enrollment.id);
  const isComplete = projectApproved || (!requiresProject && autoPct >= rules.cap);

  const wasCompleted = enrollment.status === 'completed';
  const becomesCompleted = isComplete && !wasCompleted && enrollment.status === 'active';
  const overall = wasCompleted || becomesCompleted ? 100 : round2(autoPct);

  const [progress] = await CourseProgress.findOrCreate({ where: { enrollment_id: enrollment.id }, defaults: { enrollment_id: enrollment.id } });
  await progress.update({
    total_lectures: totalLectures,
    completed_lectures: completedLectures,
    completion_percentage: round2(autoPct),
    ...(lastLectureId && { last_lecture_id: lastLectureId }),
    ...((wasCompleted || becomesCompleted) && !progress.completed_at && { completed_at: new Date() })
  });

  await enrollment.update({
    completion_percentage: overall,
    ...(becomesCompleted && { status: 'completed', completed_at: new Date() })
  });

  if (becomesCompleted) {
    await issueCompletionCertificate(enrollment, approvedBy);
    const course = await Course.findByPk(enrollment.course_id, { attributes: ['title'] });
    await notifyUser(enrollment.user_id, {
      title: 'Course completed - certificate ready',
      message: `Congratulations! You completed "${course?.title}" (100%). Your certificate is ready to view and download.`,
      type: 'course_completed',
      reference_type: 'enrollment',
      reference_id: enrollment.id
    });
  }

  const latestSubmission = requiresProject || projectApproved ? await latestSubmissionFor(enrollment.id) : null;
  return {
    enrollment_id: enrollment.id,
    total_lectures: totalLectures,
    completed_lectures: completedLectures,
    lecture_completion_percentage: totalLectures ? round2((completedLectures / totalLectures) * 100) : 0,
    project_approved: projectApproved,
    enrollment_status: enrollment.status,
    ...describeProgress({ enrollment, autoPct, rules, requiresProject, latestSubmission })
  };
};

/**
 * Phase 1: adds the fixed increment when a student plays a recorded video or
 * joins a live class. Never goes above the cap. Repeated plays/joins of the
 * same item within the cooldown window count once. Row-locked so concurrent
 * clicks cannot overshoot the cap.
 * Returns { counted, reason, increment_applied, progress }.
 */
export const recordProgressActivity = async ({ enrollment, type, referenceId = null }) => {
  const rules = await getProgressRules();
  let result = { counted: false, reason: null, increment_applied: 0 };
  let reachedCap = false;

  if (enrollment.status !== 'active') {
    result.reason = enrollment.status === 'completed' ? 'course_completed' : `enrollment_${enrollment.status}`;
  } else {
    await sequelize.transaction(async (transaction) => {
      await Enrollment.findByPk(enrollment.id, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] });
      const current = await sumIncrements(enrollment.id, transaction);
      if (current >= rules.cap) {
        result.reason = 'cap_reached';
        return;
      }
      if (rules.cooldownMinutes > 0) {
        const recent = await ProgressActivity.findOne({
          where: {
            enrollment_id: enrollment.id,
            activity_type: type,
            reference_id: referenceId,
            created_at: { [Op.gte]: new Date(Date.now() - rules.cooldownMinutes * 60 * 1000) }
          },
          attributes: ['id'],
          transaction
        });
        if (recent) {
          result.reason = 'already_counted_recently';
          return;
        }
      }
      const applied = round2(Math.min(rules.increment, rules.cap - current));
      const after = round2(current + applied);
      await ProgressActivity.create(
        { enrollment_id: enrollment.id, user_id: enrollment.user_id, course_id: enrollment.course_id, activity_type: type, reference_id: referenceId, increment_percent: applied, progress_after: after },
        { transaction }
      );
      result = { counted: true, reason: null, increment_applied: applied };
      reachedCap = after >= rules.cap;
    });
  }

  const progress = await recalculateCourseProgress(enrollment.id);
  if (reachedCap && progress.requires_project && progress.status === 'project_unlocked') {
    const course = await Course.findByPk(enrollment.course_id, { attributes: ['title'] });
    await notifyUser(enrollment.user_id, {
      title: 'Final project unlocked',
      message: `You reached ${rules.cap}% in "${course?.title}". Submit your final project to complete the course and get your certificate.`,
      type: 'project_unlocked',
      reference_type: 'course',
      reference_id: enrollment.course_id
    });
  }
  return { ...result, progress };
};

/**
 * Phase 2: project submissions waiting for approval, for the tutor (own
 * courses) and admin (all courses) dashboards. Returns { count, items }.
 */
export const listPendingProjectApprovals = async ({ courseIds = null, limit = 10 } = {}) => {
  const projectWhere = courseIds ? { course_id: { [Op.in]: courseIds } } : {};
  const where = { status: { [Op.in]: ['submitted', 'under_review'] } };
  const include = [
    {
      model: Project,
      as: 'project',
      attributes: ['id', 'title', 'course_id'],
      where: projectWhere,
      include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }]
    },
    { model: User, as: 'student', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'] }
  ];
  const [count, items] = await Promise.all([
    ProjectSubmission.count({ where, include: [{ model: Project, as: 'project', attributes: [], where: projectWhere }] }),
    ProjectSubmission.findAll({
      where,
      attributes: ['id', 'status', 'file_name', 'submission_note', 'submitted_at', 'enrollment_id'],
      include,
      order: [['submitted_at', 'ASC']],
      limit
    })
  ]);
  return { count, items };
};

/**
 * Batch progress summaries for list views (my courses, dashboards), keyed by
 * enrollment id. Uses course_progress.completion_percentage (auto progress).
 */
export const getProgressSummaries = async (enrollments) => {
  if (!enrollments.length) return {};
  const rules = await getProgressRules();
  const courseIds = [...new Set(enrollments.map((e) => e.course_id))];
  const enrollmentIds = enrollments.map((e) => e.id);
  const [projects, submissions, progressRows] = await Promise.all([
    Project.findAll({ where: { course_id: { [Op.in]: courseIds }, status: 'active' }, attributes: ['course_id'] }),
    ProjectSubmission.findAll({
      where: { enrollment_id: { [Op.in]: enrollmentIds } },
      attributes: ['id', 'enrollment_id', 'status', 'submitted_at'],
      order: [['submitted_at', 'DESC'], ['id', 'DESC']]
    }),
    CourseProgress.findAll({ where: { enrollment_id: { [Op.in]: enrollmentIds } }, attributes: ['enrollment_id', 'completion_percentage'] })
  ]);
  const withProject = new Set(projects.map((p) => p.course_id));
  const latest = {};
  submissions.forEach((s) => {
    if (!latest[s.enrollment_id]) latest[s.enrollment_id] = s;
  });
  const auto = Object.fromEntries(progressRows.map((p) => [p.enrollment_id, Number(p.completion_percentage)]));
  return Object.fromEntries(
    enrollments.map((e) => [
      e.id,
      describeProgress({ enrollment: e, autoPct: auto[e.id] ?? 0, rules, requiresProject: withProject.has(e.course_id), latestSubmission: latest[e.id] || null })
    ])
  );
};

/**
 * Records watch position for a lecture (and its recorded video) for resume and
 * curriculum checkmarks. A lecture is ticked once `lecture_completion_threshold`
 * (90%) of it is watched, or when marked complete for non-video lectures.
 * Course % is driven by play / live-class-join activity (recordProgressActivity),
 * not by this watch time.
 */
export const recordLectureProgress = async ({ user, enrollment, lecture, watchedSeconds, positionSeconds, markComplete }) => {
  const threshold = await getSetting('lecture_completion_threshold');
  const video = await RecordedVideo.findOne({
    where: { lecture_id: lecture.id, status: { [Op.in]: ['ready', 'published'] } },
    order: [['sort_order', 'ASC']]
  });

  const duration = Number((video && video.duration_seconds) || lecture.duration_seconds || 0);
  const watched = Math.max(0, Math.floor(Number(watchedSeconds) || 0));
  const position = Math.max(0, Math.floor(Number(positionSeconds ?? watchedSeconds) || 0));

  await sequelize.transaction(async (transaction) => {
    let pct = 0;
    if (duration > 0) pct = Math.min(100, round2((watched / duration) * 100));

    // Video lectures with a known duration must reach the threshold; others
    // (or videos with unknown duration) can be marked complete explicitly.
    const isVideoWithDuration = lecture.lecture_type === 'video' && duration > 0;
    const reachedThreshold = duration > 0 && pct >= threshold;
    const completeNow = reachedThreshold || (markComplete && !isVideoWithDuration);

    if (video) {
      const [vp] = await VideoProgress.findOrCreate({
        where: { user_id: user.id, video_id: video.id },
        defaults: { user_id: user.id, video_id: video.id },
        transaction
      });
      const vpWatched = Math.max(vp.watched_seconds, watched);
      const vpPct = duration > 0 ? Math.min(100, round2((vpWatched / duration) * 100)) : vp.completion_percentage;
      await vp.update(
        {
          watched_seconds: vpWatched,
          last_position_seconds: position,
          completion_percentage: vpPct,
          ...(vpPct >= threshold && !vp.completed && { completed: true, completed_at: new Date() })
        },
        { transaction }
      );
    }

    const [lp] = await LectureProgress.findOrCreate({
      where: { user_id: user.id, lecture_id: lecture.id },
      defaults: { user_id: user.id, lecture_id: lecture.id, enrollment_id: enrollment.id },
      transaction
    });
    const lpWatched = Math.max(lp.watched_seconds, watched);
    const lpPct = duration > 0 ? Math.min(100, round2((lpWatched / duration) * 100)) : completeNow ? 100 : Number(lp.completion_percentage);
    await lp.update(
      {
        enrollment_id: enrollment.id,
        watched_seconds: lpWatched,
        completion_percentage: lp.completed ? Math.max(lpPct, Number(lp.completion_percentage)) : lpPct,
        ...((completeNow || lpPct >= threshold) && !lp.completed && { completed: true, completed_at: new Date() })
      },
      { transaction }
    );
  });

  const lectureProgress = await LectureProgress.findOne({ where: { user_id: user.id, lecture_id: lecture.id } });
  const courseProgress = await recalculateCourseProgress(enrollment.id, { lastLectureId: lecture.id });
  return {
    lecture_progress: lectureProgress,
    completion_threshold: threshold,
    requires_full_watch: lecture.lecture_type === 'video' && duration > 0,
    course_progress: courseProgress
  };
};

/** Recalculate every enrollment of a course (after curriculum changes). */
export const recalculateCourseEnrollments = async (courseId) => {
  const enrollments = await Enrollment.findAll({
    where: { course_id: courseId, status: 'active' },
    attributes: ['id']
  });
  for (const e of enrollments) await recalculateCourseProgress(e.id);
};

export default {
  getCountableLectureIds,
  courseRequiresProject,
  hasApprovedProject,
  getProgressRules,
  describeProgress,
  recalculateCourseProgress,
  recordProgressActivity,
  getProgressSummaries,
  listPendingProjectApprovals,
  recordLectureProgress,
  recalculateCourseEnrollments
};
