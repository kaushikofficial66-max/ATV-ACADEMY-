import bcrypt from 'bcryptjs';
import { Op, fn, col, literal } from 'sequelize';
import {
  sequelize,
  User,
  Role,
  UserProfile,
  Enrollment,
  Course,
  CourseProgress,
  Certificate,
  Order,
  OrderItem,
  Payment,
  CourseTutor,
  LiveClass,
  Review,
  PasswordReset,
  TutorPayout,
  UserSession,
  VideoPlayLog,
  QuizAttempt,
  Quiz,
  ProjectSubmission,
  Project,
  LiveClassParticipant,
  CommunityPost,
  CommunityComment,
  Wishlist,
  Cart,
  CartItem,
  Notification,
  LectureProgress,
  ProgressActivity,
  RecordedVideo,
  LiveClassTutor
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, getSort, dateRange } from '../../utils/pagination.js';
import { serializeUser } from '../../utils/serializers.js';
import { generateToken } from '../../utils/jwt.js';
import { randomToken, hashToken, toMoney } from '../../utils/helpers.js';
import { enrollUser } from '../../services/enrollmentService.js';
import { notifyUser } from '../../services/notificationService.js';
import { sendPasswordResetEmail, sendNotificationEmail } from '../../services/mailService.js';
import { getSetting } from '../../services/settingsService.js';
import { getTutorEarnings } from '../../services/earningsService.js';
import { decorateCourses } from '../../services/courseService.js';
import { listPendingProjectApprovals } from '../../services/progressService.js';

const BASE_ATTRS = ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_image', 'status', 'email_verified_at', 'last_login_at', 'created_at'];

const roleInclude = (name) => ({ model: Role, as: 'role', attributes: ['id', 'name'], where: { name } });

const searchWhere = (search) =>
  search
    ? {
        [Op.or]: [
          { first_name: { [Op.like]: `%${search}%` } },
          { last_name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ]
      }
    : {};

const findUserWithRole = async (userId, roleName) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password_hash'] },
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }, { model: UserProfile, as: 'profile' }]
  });
  if (!user || (roleName && user.role.name !== roleName)) throw ApiError.notFound(`${roleName ? roleName[0].toUpperCase() + roleName.slice(1) : 'User'} not found.`);
  return user;
};

// ==========================================================================
// Students
// ==========================================================================

/** GET /admin/students?search=&status=&course_id=&verified=&from=&to=&sort= */
export const listStudents = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...searchWhere(req.query.search), ...dateRange(req.query, 'created_at') };
  if (req.query.status) where.status = req.query.status;
  if (req.query.verified === 'true') where.email_verified_at = { [Op.ne]: null };
  if (req.query.verified === 'false') where.email_verified_at = null;
  if (req.query.course_id) {
    where[Op.and] = [literal(`EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = \`User\`.\`id\` AND e.course_id = ${Number(req.query.course_id) || 0})`)];
  }

  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: [
      ...BASE_ATTRS,
      [literal("(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = `User`.`id` AND e.status <> 'cancelled')"), 'enrollment_count'],
      [literal("(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = `User`.`id` AND e.status = 'completed')"), 'completed_count'],
      [literal("(SELECT COALESCE(SUM(o.total_amount),0) FROM orders o WHERE o.user_id = `User`.`id` AND o.status = 'paid')"), 'total_spent']
    ],
    include: [roleInclude('student')],
    order: getSort(req.query, ['created_at', 'first_name', 'email', 'last_login_at']),
    limit,
    offset
  });
  return successResponse(res, { data: { students: rows }, meta: meta(count) });
};

/** Students active within this window count as "online". */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const countBy = (rows, key) =>
  rows.reduce((acc, r) => {
    const k = r[key] || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

/**
 * GET /admin/students/:studentId - everything stored about a student, grouped
 * for the admin "More info" view: profile, activity & sessions (devices,
 * login / logout), learning (enrollments, lectures, quizzes, projects, live
 * classes), watching (video plays per device), purchases, certificates,
 * community & reviews, notifications.
 */
export const getStudentDetails = async (req, res) => {
  const student = await findUserWithRole(req.params.studentId, 'student');
  const uid = student.id;

  const [
    enrollments,
    orders,
    certificates,
    reviews,
    sessions,
    sessionCount,
    lastLogout,
    plays,
    quizAttempts,
    submissions,
    liveClasses,
    postCount,
    commentCount,
    wishlist,
    cart,
    notificationsTotal,
    notificationsUnread,
    lecturesCompleted,
    progressActivities
  ] = await Promise.all([
    Enrollment.findAll({
      where: { user_id: uid },
      include: [
        { model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] },
        { model: CourseProgress, as: 'courseProgress' },
        { model: Certificate, as: 'certificate', attributes: ['id', 'status', 'certificate_number'] }
      ],
      order: [['enrolled_at', 'DESC']]
    }),
    Order.findAll({
      where: { user_id: uid },
      include: [
        { model: OrderItem, as: 'items', attributes: ['course_id', 'course_title', 'final_amount'] },
        { model: Payment, as: 'payments', attributes: ['id', 'status', 'payment_method', 'gateway_payment_id', 'paid_at', 'amount'] }
      ],
      order: [['created_at', 'DESC']]
    }),
    Certificate.findAll({ where: { user_id: uid }, include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }], order: [['created_at', 'DESC']] }),
    Review.findAll({ where: { user_id: uid }, include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }], order: [['created_at', 'DESC']] }),
    UserSession.findAll({ where: { user_id: uid }, attributes: { exclude: ['user_agent'] }, order: [['login_at', 'DESC']], limit: 50 }),
    UserSession.count({ where: { user_id: uid } }),
    UserSession.findOne({ where: { user_id: uid, logout_at: { [Op.ne]: null } }, order: [['logout_at', 'DESC']], attributes: ['logout_at'] }),
    VideoPlayLog.findAll({
      where: { user_id: uid },
      include: [
        { model: RecordedVideo, as: 'video', attributes: ['id', 'title'] },
        { model: Course, as: 'course', attributes: ['id', 'title'] }
      ],
      order: [['played_at', 'DESC']],
      limit: 500
    }),
    QuizAttempt.findAll({
      where: { user_id: uid },
      include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title', 'course_id'] }],
      order: [['started_at', 'DESC']],
      limit: 50
    }),
    ProjectSubmission.findAll({
      where: { student_id: uid },
      attributes: { exclude: ['file_url'] },
      include: [{ model: Project, as: 'project', attributes: ['id', 'title'], include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }] }],
      order: [['submitted_at', 'DESC']]
    }),
    LiveClassParticipant.findAll({
      where: { user_id: uid },
      include: [{ model: LiveClass, as: 'liveClass', attributes: ['id', 'title', 'scheduled_start', 'status'], include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }] }],
      order: [['created_at', 'DESC']],
      limit: 50
    }),
    CommunityPost.count({ where: { user_id: uid, status: { [Op.ne]: 'deleted' } } }),
    CommunityComment.count({ where: { user_id: uid, status: { [Op.ne]: 'deleted' } } }),
    Wishlist.findAll({ where: { user_id: uid }, include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }] }),
    Cart.findOne({ where: { user_id: uid, status: 'active' }, include: [{ model: CartItem, as: 'items', include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }] }] }),
    Notification.count({ where: { user_id: uid } }),
    Notification.count({ where: { user_id: uid, is_read: false } }),
    LectureProgress.count({ where: { user_id: uid, completed: true } }),
    ProgressActivity.findAll({
      where: { user_id: uid },
      include: [{ model: Course, as: 'course', attributes: ['id', 'title'] }],
      order: [['created_at', 'DESC']],
      limit: 30
    })
  ]);

  const paid = orders.filter((o) => o.status === 'paid');
  const lastSeen = sessions.reduce((max, s) => (!max || new Date(s.last_seen_at) > new Date(max) ? s.last_seen_at : max), null);
  const finishedQuizzes = quizAttempts.filter((a) => a.status !== 'started');

  return successResponse(res, {
    data: {
      student: serializeUser(student),
      stats: {
        enrollments: enrollments.length,
        completed: enrollments.filter((e) => e.status === 'completed').length,
        total_spent: toMoney(paid.reduce((s, o) => s + Number(o.total_amount), 0)),
        orders: orders.length,
        certificates: certificates.length,
        reviews: reviews.length
      },
      activity: {
        account_status: student.status,
        email_verified: Boolean(student.email_verified_at),
        joined_at: student.createdAt || student.get('created_at'),
        last_login_at: student.last_login_at,
        last_logout_at: lastLogout?.logout_at || null,
        last_seen_at: lastSeen,
        is_online: Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS && sessions.some((s) => !s.logout_at)),
        total_logins: sessionCount,
        active_sessions: sessions.filter((s) => !s.logout_at).length
      },
      devices: {
        logins_by_device: countBy(sessions, 'device_type'),
        logins_by_os: countBy(sessions, 'os'),
        logins_by_browser: countBy(sessions, 'browser'),
        plays_by_device: countBy(plays, 'device_type'),
        plays_by_os: countBy(plays, 'os')
      },
      sessions,
      watching: {
        total_plays: plays.length,
        last_played_at: plays[0]?.played_at || null,
        videos_watched: new Set(plays.map((p) => p.video_id)).size,
        lectures_completed: lecturesCompleted,
        recent_plays: plays.slice(0, 30)
      },
      learning: {
        quiz_attempts: quizAttempts,
        quizzes_passed: finishedQuizzes.filter((a) => a.passed).length,
        quiz_average: finishedQuizzes.length ? toMoney(finishedQuizzes.reduce((s, a) => s + Number(a.percentage || 0), 0) / finishedQuizzes.length) : null,
        project_submissions: submissions,
        live_classes: liveClasses,
        progress_activities: progressActivities
      },
      engagement: {
        community_posts: postCount,
        community_comments: commentCount,
        wishlist: wishlist.map((w) => w.course).filter(Boolean),
        cart: cart ? cart.items.map((i) => ({ course: i.course, price: i.price })) : [],
        notifications_total: notificationsTotal,
        notifications_unread: notificationsUnread
      },
      enrollments,
      orders,
      certificates,
      reviews
    }
  });
};

/** How long an admin "view as" session lasts. */
const IMPERSONATION_TTL = '2h';

/**
 * POST /admin/users/:userId/impersonate - "view as" a student or tutor.
 * Returns a short-lived token for that user carrying the admin's id (`imp`).
 * No password is needed; the session is read-only (enforced in the auth
 * middleware) and is not recorded as the user's own login.
 */
export const impersonateUser = async (req, res) => {
  const user = await findUserWithRole(req.params.userId);
  const role = user.role.name;
  if (!['student', 'tutor'].includes(role)) throw ApiError.badRequest('You can only view the app as a student or a tutor.');
  if (user.status === 'blocked') throw ApiError.badRequest('This account is blocked. Unblock it to view the app as this user.');

  const token = generateToken({ id: user.id, role, imp: req.user.id }, IMPERSONATION_TTL);
  console.info(`[Impersonation] admin #${req.user.id} (${req.user.email}) is viewing as ${role} #${user.id} (${user.email})`);

  const data = serializeUser(user);
  data.impersonated_by = { id: req.user.id, first_name: req.user.first_name, last_name: req.user.last_name };
  return successResponse(res, {
    message: `Viewing as ${user.first_name} (${role}). Read-only preview.`,
    data: { token, user: data, expires_in: IMPERSONATION_TTL }
  });
};

/** PATCH /admin/users/:userId/status { status, reason } - students and tutors. */
export const updateUserStatus = async (req, res) => {
  const user = await findUserWithRole(req.params.userId);
  if (user.id === req.user.id) throw ApiError.badRequest('You cannot change your own account status.');
  const { status, reason } = req.body;
  await User.update({ status }, { where: { id: user.id } });

  const messages = {
    active: 'Your account has been activated.',
    inactive: 'Your account has been deactivated.',
    blocked: 'Your account has been blocked.',
    pending: 'Your account is pending review.'
  };
  await notifyUser(user.id, { title: 'Account status updated', message: `${messages[status]}${reason ? ` Reason: ${reason}` : ''}`, type: 'account_status' });
  return successResponse(res, { message: `Account status changed to ${status}.`, data: { user_id: user.id, status } });
};

/**
 * POST /admin/students/:studentId/enrollments { course_id, expires_at? }
 * Manual enrollment (complimentary / offline payment).
 */
export const enrollStudent = async (req, res) => {
  const student = await findUserWithRole(req.params.studentId, 'student');
  const course = await Course.findByPk(req.body.course_id);
  if (!course) throw ApiError.notFound('Course not found.');
  const { enrollment, created } = await sequelize.transaction((transaction) =>
    enrollUser(student.id, course.id, { expiresAt: req.body.expires_at || null, transaction })
  );
  return successResponse(res, {
    statusCode: created ? 201 : 200,
    message: created ? `Enrolled in "${course.title}".` : `Enrollment in "${course.title}" is active.`,
    data: { enrollment }
  });
};

/** POST /admin/users - create a student, tutor or admin account. */
export const createUser = async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  if (await User.findOne({ where: { email } })) throw ApiError.conflict('An account with this email already exists.');
  if (req.body.phone && (await User.findOne({ where: { phone: req.body.phone } }))) throw ApiError.conflict('An account with this phone number already exists.');
  const role = await Role.findOne({ where: { name: req.body.role } });
  if (!role) throw ApiError.badRequest('Invalid role.');

  const password = req.body.password || randomToken(6);
  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      {
        role_id: role.id,
        first_name: req.body.first_name,
        last_name: req.body.last_name || null,
        email,
        phone: req.body.phone || null,
        password_hash: await bcrypt.hash(password, 12),
        status: req.body.status || 'active',
        email_verified_at: req.body.email_verified ? new Date() : null
      },
      { transaction }
    );
    await UserProfile.create({ user_id: created.id }, { transaction });
    return created;
  });

  // Let the user set their own password via a reset link.
  let inviteSent = false;
  if (req.body.send_invite !== false) {
    const token = randomToken();
    await PasswordReset.create({ user_id: user.id, token: hashToken(token), expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000) });
    const frontendUrl = await getSetting('frontend_url');
    inviteSent = (await sendPasswordResetEmail(user, `${frontendUrl}/reset-password?token=${token}`)).sent;
  }

  return successResponse(res, {
    statusCode: 201,
    message: 'Account created.',
    data: {
      user: serializeUser(await findUserWithRole(user.id)),
      invite_email_sent: inviteSent,
      ...(!req.body.password && !inviteSent && { temporary_password: password })
    }
  });
};

/** PUT /admin/users/:userId - edit basic account and profile fields. */
export const updateUser = async (req, res) => {
  const user = await findUserWithRole(req.params.userId);
  const updates = {};
  for (const key of ['first_name', 'last_name', 'phone']) if (req.body[key] !== undefined) updates[key] = req.body[key] || null;
  if (req.body.email) {
    const email = String(req.body.email).trim().toLowerCase();
    if (email !== user.email && (await User.findOne({ where: { email } }))) throw ApiError.conflict('Email already in use.');
    updates.email = email;
  }
  if (req.body.email_verified !== undefined) updates.email_verified_at = req.body.email_verified ? user.email_verified_at || new Date() : null;
  await User.update(updates, { where: { id: user.id } });
  if (req.body.profile && typeof req.body.profile === 'object') {
    const [profile] = await UserProfile.findOrCreate({ where: { user_id: user.id }, defaults: { user_id: user.id } });
    await profile.update(req.body.profile);
  }
  return successResponse(res, { message: 'User updated.', data: { user: serializeUser(await findUserWithRole(user.id)) } });
};

/** POST /admin/users/:userId/send-password-reset */
export const sendUserPasswordReset = async (req, res) => {
  const user = await findUserWithRole(req.params.userId);
  const token = randomToken();
  await PasswordReset.create({ user_id: user.id, token: hashToken(token), expires_at: new Date(Date.now() + 60 * 60 * 1000) });
  const frontendUrl = await getSetting('frontend_url');
  const mail = await sendPasswordResetEmail(user, `${frontendUrl}/reset-password?token=${token}`);
  if (!mail.sent) throw new ApiError(503, mail.error);
  return successResponse(res, { message: 'Password reset email sent.' });
};

// ==========================================================================
// Tutors
// ==========================================================================

/** GET /admin/tutors?search=&status= (status=pending lists applications) */
export const listTutors = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...searchWhere(req.query.search), ...dateRange(req.query, 'created_at') };
  if (req.query.status) where.status = req.query.status;
  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: [
      ...BASE_ATTRS,
      [literal('(SELECT COUNT(*) FROM course_tutors ct WHERE ct.tutor_id = `User`.`id`)'), 'course_count'],
      [literal("(SELECT COUNT(DISTINCT e.user_id) FROM course_tutors ct JOIN enrollments e ON e.course_id = ct.course_id WHERE ct.tutor_id = `User`.`id` AND e.status IN ('active','completed'))"), 'student_count'],
      [literal("(SELECT COUNT(*) FROM live_classes lc WHERE lc.status = 'completed' AND (lc.tutor_id = `User`.`id` OR lc.id IN (SELECT live_class_id FROM live_class_tutors WHERE tutor_id = `User`.`id`)))"), 'classes_taken']
    ],
    include: [roleInclude('tutor'), { model: UserProfile, as: 'profile', attributes: ['bio', 'city', 'country', 'linkedin_url', 'website'] }],
    order: getSort(req.query, ['created_at', 'first_name', 'email', 'last_login_at']),
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { tutors: rows }, meta: meta(count) });
};

/**
 * Everything a tutor has done, for the admin "More info" view: sign-in activity and devices, live classes taken
 * (hours, attendance, recordings), what they review and publish, and how students rate their courses.
 * A tutor counts for a live class when they are its host (live_classes.tutor_id) or a co-tutor.
 */
const getTutorActivity = async (tutor, courseIds) => {
  const tid = tutor.id;
  const q = (sql, replacements = {}) => sequelize.query(sql, { replacements: { tid, courseIds: courseIds.length ? courseIds : [0], ...replacements }, type: 'SELECT' });
  const mine = '(lc.tutor_id = :tid OR lc.id IN (SELECT live_class_id FROM live_class_tutors WHERE tutor_id = :tid))';

  const [sessions, sessionCount, lastLogout, classStats, recentClasses, monthly, reviewed, videos, ratings, comments, posts, certificates, enrolled, completed] = await Promise.all([
    UserSession.findAll({ where: { user_id: tid }, attributes: { exclude: ['user_agent'] }, order: [['login_at', 'DESC']], limit: 30 }),
    UserSession.count({ where: { user_id: tid } }),
    UserSession.findOne({ where: { user_id: tid, logout_at: { [Op.ne]: null } }, order: [['logout_at', 'DESC']], attributes: ['logout_at'] }),
    q(`SELECT COUNT(*) AS total,
         SUM(lc.status = 'completed') AS completed, SUM(lc.status = 'cancelled') AS cancelled,
         SUM(lc.status IN ('scheduled','live') AND lc.scheduled_end >= NOW()) AS upcoming,
         SUM(lc.status = 'completed' AND lc.recording_status = 'uploaded') AS recorded,
         COALESCE(SUM(CASE WHEN lc.status = 'completed' THEN TIMESTAMPDIFF(MINUTE, lc.scheduled_start, lc.scheduled_end) END), 0) AS minutes_taught,
         MAX(CASE WHEN lc.status = 'completed' THEN lc.scheduled_start END) AS last_class_at,
         MIN(CASE WHEN lc.status IN ('scheduled','live') AND lc.scheduled_end >= NOW() THEN lc.scheduled_start END) AS next_class_at
       FROM live_classes lc WHERE ${mine}`),
    q(`SELECT lc.id, lc.title, lc.status, lc.scheduled_start, lc.scheduled_end, lc.recording_status, c.title AS course_title,
         (SELECT COUNT(*) FROM live_class_participants p WHERE p.live_class_id = lc.id) AS registered,
         (SELECT COUNT(*) FROM live_class_participants p WHERE p.live_class_id = lc.id AND p.attendance_status = 'joined') AS joined
       FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id WHERE ${mine} ORDER BY lc.scheduled_start DESC LIMIT 25`),
    q(`SELECT DATE_FORMAT(lc.scheduled_start, '%Y-%m') AS month, COUNT(*) AS classes,
         ROUND(SUM(TIMESTAMPDIFF(MINUTE, lc.scheduled_start, lc.scheduled_end)) / 60, 1) AS hours
       FROM live_classes lc WHERE ${mine} AND lc.status = 'completed' AND lc.scheduled_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month DESC`),
    q(`SELECT COUNT(*) AS total, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected, MAX(reviewed_at) AS last_reviewed_at
       FROM project_submissions WHERE reviewed_by = :tid`).catch(() => [{}]),
    RecordedVideo.count({ where: { uploaded_by: tid } }),
    q('SELECT COUNT(*) AS total, ROUND(AVG(rating), 2) AS average FROM reviews WHERE course_id IN (:courseIds)').catch(() => [{}]),
    CommunityComment.count({ where: { user_id: tid, status: { [Op.ne]: 'deleted' } } }),
    CommunityPost.count({ where: { user_id: tid, status: { [Op.ne]: 'deleted' } } }),
    Certificate.count({ where: { course_id: { [Op.in]: courseIds } } }),
    Enrollment.count({ where: { course_id: { [Op.in]: courseIds }, status: { [Op.in]: ['active', 'completed'] } } }),
    Enrollment.count({ where: { course_id: { [Op.in]: courseIds }, status: 'completed' } })
  ]);

  const cs = classStats[0] || {};
  const lastSeen = sessions.reduce((max, x) => (!max || new Date(x.last_seen_at) > new Date(max) ? x.last_seen_at : max), null);
  const n = (v) => Number(v || 0);
  return {
    account_status: tutor.status,
    joined_at: tutor.createdAt || tutor.get('created_at'),
    last_login_at: tutor.last_login_at,
    last_logout_at: lastLogout?.logout_at || null,
    last_seen_at: lastSeen,
    is_online: Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS && sessions.some((x) => !x.logout_at)),
    total_logins: sessionCount,
    active_sessions: sessions.filter((x) => !x.logout_at).length,
    logins_by_device: countBy(sessions, 'device_type'),
    logins_by_os: countBy(sessions, 'os'),
    logins_by_browser: countBy(sessions, 'browser'),
    sessions,
    classes: {
      total: n(cs.total),
      completed: n(cs.completed),
      cancelled: n(cs.cancelled),
      upcoming: n(cs.upcoming),
      recorded: n(cs.recorded),
      hours_taught: Math.round((n(cs.minutes_taught) / 60) * 10) / 10,
      last_class_at: cs.last_class_at || null,
      next_class_at: cs.next_class_at || null,
      by_month: monthly,
      recent: recentClasses.map((c) => ({ ...c, registered: n(c.registered), joined: n(c.joined) }))
    },
    teaching: {
      students_enrolled: enrolled,
      students_completed: completed,
      completion_rate: enrolled ? Math.round((completed / enrolled) * 100) : null,
      certificates_issued: certificates,
      projects_reviewed: n(reviewed[0]?.total),
      projects_approved: n(reviewed[0]?.approved),
      projects_rejected: n(reviewed[0]?.rejected),
      last_project_review_at: reviewed[0]?.last_reviewed_at || null,
      videos_uploaded: videos,
      reviews_received: n(ratings[0]?.total),
      average_rating: ratings[0]?.average === null || ratings[0]?.average === undefined ? null : Number(ratings[0].average),
      community_posts: posts,
      community_comments: comments
    }
  };
};

/** GET /admin/tutors/:tutorId - profile, courses, students, earnings, payouts, activity. */
export const getTutorDetails = async (req, res) => {
  const tutor = await findUserWithRole(req.params.tutorId, 'tutor');
  const assignments = await CourseTutor.findAll({ where: { tutor_id: tutor.id }, attributes: ['course_id', 'is_primary'] });
  const courses = await Course.findAll({ where: { id: { [Op.in]: assignments.map((a) => a.course_id) } }, attributes: ['id', 'title', 'slug', 'status', 'price', 'discount_price', 'thumbnail_url', 'created_at'] });
  const [decorated, earnings, upcoming, payouts, activity] = await Promise.all([
    decorateCourses(courses),
    getTutorEarnings(tutor.id),
    LiveClass.count({ where: { tutor_id: tutor.id, status: { [Op.in]: ['scheduled', 'live'] }, scheduled_end: { [Op.gte]: new Date() } } }),
    TutorPayout.findAll({ where: { tutor_id: tutor.id }, order: [['created_at', 'DESC']], limit: 10 }),
    getTutorActivity(tutor, assignments.map((a) => a.course_id))
  ]);
  return successResponse(res, {
    data: {
      tutor: serializeUser(tutor),
      courses: decorated.map((c) => ({ ...c, is_primary: assignments.find((a) => a.course_id === c.id)?.is_primary })),
      stats: {
        courses: decorated.length,
        published_courses: decorated.filter((c) => c.status === 'published').length,
        students: decorated.reduce((s, c) => s + c.student_count, 0),
        upcoming_live_classes: upcoming
      },
      earnings,
      recent_payouts: payouts,
      activity
    }
  });
};

/**
 * PATCH /admin/tutors/:tutorId/approval { action: 'approve' | 'reject', reason }
 * Approve activates a pending tutor; reject sets the account inactive.
 */
export const reviewTutorApplication = async (req, res) => {
  const tutor = await findUserWithRole(req.params.tutorId, 'tutor');
  const approve = req.body.action === 'approve';
  await User.update({ status: approve ? 'active' : 'inactive' }, { where: { id: tutor.id } });

  const title = approve ? 'Tutor application approved' : 'Tutor application not approved';
  const message = approve
    ? 'Congratulations! Your tutor account is approved. You can now create courses.'
    : `Your tutor application was not approved.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`;
  await notifyUser(tutor.id, { title, message, type: 'tutor_approval' });
  await sendNotificationEmail(tutor, title, message);

  return successResponse(res, { message: approve ? 'Tutor approved.' : 'Tutor application rejected.', data: { tutor_id: tutor.id, status: approve ? 'active' : 'inactive' } });
};

/** GET /admin/dashboard - overview + student / tutor / course / sales summaries. */
export const getDashboard = async (req, res) => {
  const countByRole = async (name, extraWhere = {}) => User.count({ where: extraWhere, include: [{ model: Role, as: 'role', where: { name }, attributes: [] }] });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    students,
    activeStudents,
    newStudents,
    tutors,
    pendingTutors,
    courseStatus,
    enrollmentStatus,
    revenueAll,
    revenueMonth,
    ordersByStatus,
    monthly,
    topCourses,
    recentOrders,
    pendingReviews,
    pendingCertificates,
    upcomingClasses,
    pendingApprovals
  ] = await Promise.all([
    countByRole('student'),
    countByRole('student', { status: 'active' }),
    countByRole('student', { created_at: { [Op.gte]: thirtyDaysAgo } }),
    countByRole('tutor'),
    countByRole('tutor', { status: 'pending' }),
    Course.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
    Enrollment.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
    Order.sum('total_amount', { where: { status: 'paid' } }),
    Order.sum('total_amount', { where: { status: 'paid', created_at: { [Op.gte]: startOfMonth } } }),
    Order.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
    Order.findAll({
      attributes: [[fn('DATE_FORMAT', col('created_at'), '%Y-%m'), 'month'], [fn('SUM', col('total_amount')), 'revenue'], [fn('COUNT', col('id')), 'orders']],
      where: { status: 'paid', created_at: { [Op.gte]: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
      group: [literal('month')],
      order: [[literal('month'), 'ASC']],
      raw: true
    }),
    OrderItem.findAll({
      attributes: ['course_id', 'course_title', [fn('SUM', col('final_amount')), 'revenue'], [fn('COUNT', col('OrderItem.id')), 'sales']],
      include: [{ model: Order, as: 'order', attributes: [], where: { status: 'paid' } }],
      group: ['course_id', 'course_title'],
      order: [[literal('revenue'), 'DESC']],
      limit: 5,
      raw: true
    }),
    Order.findAll({ include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }], order: [['created_at', 'DESC']], limit: 5 }),
    Review.count({ where: { status: 'pending' } }),
    Certificate.count({ where: { status: 'pending' } }),
    LiveClass.count({ where: { status: { [Op.in]: ['scheduled', 'live'] }, scheduled_end: { [Op.gte]: new Date() } } }),
    listPendingProjectApprovals({ limit: 10 })
  ]);

  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const courses = toMap(courseStatus);
  const orders = toMap(ordersByStatus);

  return successResponse(res, {
    data: {
      overview: {
        total_students: students,
        total_tutors: tutors,
        total_courses: Object.values(courses).reduce((a, b) => a + b, 0),
        total_revenue: toMoney(revenueAll || 0),
        pending_tutor_approvals: pendingTutors,
        pending_course_approvals: courses.pending || 0,
        pending_review_moderation: pendingReviews,
        pending_certificates: pendingCertificates,
        pending_project_approvals: pendingApprovals.count,
        upcoming_live_classes: upcomingClasses
      },
      // Phase 2 of the 90% rule: final projects waiting for approval (oldest first).
      pending_project_approvals: pendingApprovals.items,
      student_summary: { total: students, active: activeStudents, new_last_30_days: newStudents, enrollments: toMap(enrollmentStatus) },
      tutor_summary: { total: tutors, pending_approval: pendingTutors, active: await countByRole('tutor', { status: 'active' }) },
      course_summary: { by_status: courses, top_selling: topCourses.map((c) => ({ ...c, revenue: toMoney(c.revenue), sales: Number(c.sales) })) },
      sales_summary: {
        total_revenue: toMoney(revenueAll || 0),
        revenue_this_month: toMoney(revenueMonth || 0),
        orders_by_status: orders,
        monthly: monthly.map((m) => ({ month: m.month, revenue: toMoney(m.revenue), orders: Number(m.orders) })),
        recent_orders: recentOrders
      }
    }
  });
};

export default {
  impersonateUser,
  listStudents,
  getStudentDetails,
  updateUserStatus,
  enrollStudent,
  createUser,
  updateUser,
  sendUserPasswordReset,
  listTutors,
  getTutorDetails,
  reviewTutorApplication,
  getDashboard
};
