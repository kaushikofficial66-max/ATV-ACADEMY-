import { body, query, check } from 'express-validator';

const password = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters long.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter.')
    .matches(/\d/)
    .withMessage('Password must contain a number.');

const optionalId = (field) => body(field).optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage(`${field} must be a valid id.`);
const requiredId = (field) => body(field).isInt({ min: 1 }).withMessage(`${field} is required.`);
const money = (field) => body(field).optional({ values: 'null' }).isFloat({ min: 0 }).withMessage(`${field} must be a positive amount.`);

export const v = {
  register: [
    body('first_name').trim().notEmpty().withMessage('First name is required.').isLength({ max: 100 }),
    body('last_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('A valid email is required.').isLength({ max: 150 }),
    body('phone').optional({ values: 'falsy' }).trim().matches(/^\+?[0-9\s-]{7,20}$/).withMessage('Invalid phone number.'),
    body('role').optional().isIn(['student', 'tutor']).withMessage('Role must be student or tutor.'),
    password('password')
  ],
  login: [body('email').trim().isEmail().withMessage('A valid email is required.'), body('password').notEmpty().withMessage('Password is required.')],
  email: [body('email').trim().isEmail().withMessage('A valid email is required.')],
  // Email verification token: 64 hex chars from the emailed link; accepted in the JSON body or ?token=.
  verifyEmailToken: [
    check('token').custom((value, { req }) => {
      const token = req.body?.token ?? req.query?.token;
      if (!token || typeof token !== 'string') throw new Error('token is required - use the token from the verification email link.');
      if (/^eyJ/.test(token)) throw new Error('This is a login token (JWT). Use the token from the verification email link instead.');
      if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid verification token - use the token from the verification email link.');
      return true;
    })
  ],
  resetPassword: [body('token').isString().isLength({ min: 20 }).withMessage('A valid token is required.'), password('new_password')],
  changePassword: [body('current_password').notEmpty().withMessage('Current password is required.'), password('new_password')],
  changeEmail: [body('new_email').trim().isEmail().withMessage('A valid email is required.'), body('current_password').notEmpty().withMessage('Current password is required.')],
  passwordConfirm: [body('current_password').notEmpty().withMessage('Current password is required.')],
  profile: [
    body('first_name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('last_name').optional({ values: 'null' }).trim().isLength({ max: 100 }),
    body('phone').optional({ values: 'falsy' }).trim().matches(/^\+?[0-9\s-]{7,20}$/).withMessage('Invalid phone number.'),
    body('date_of_birth').optional({ values: 'falsy' }).isISO8601().withMessage('date_of_birth must be YYYY-MM-DD.'),
    body('website').optional({ values: 'falsy' }).isURL().withMessage('website must be a URL.'),
    body('linkedin_url').optional({ values: 'falsy' }).isURL().withMessage('linkedin_url must be a URL.')
  ],

  courseCreate: [
    body('title').trim().notEmpty().withMessage('Course title is required.').isLength({ max: 255 }),
    requiredId('category_id'),
    money('price'),
    money('discount_price'),
    body('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'all']),
    body('duration_minutes').optional({ values: 'falsy' }).isInt({ min: 0 }),
    body('language').optional().isLength({ max: 50 }),
    optionalId('woocommerce_product_id')
  ],
  courseUpdate: [
    body('title').optional().trim().notEmpty().isLength({ max: 255 }),
    optionalId('category_id'),
    money('price'),
    money('discount_price'),
    body('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'all']),
    body('duration_minutes').optional({ values: 'falsy' }).isInt({ min: 0 }),
    optionalId('woocommerce_product_id')
  ],
  courseStatus: [body('status').isIn(['draft', 'pending', 'approved', 'published', 'rejected', 'archived']).withMessage('Invalid status.')],
  section: [body('title').trim().notEmpty().withMessage('Section title is required.').isLength({ max: 255 }), body('status').optional().isIn(['active', 'inactive'])],
  sectionUpdate: [body('title').optional().trim().notEmpty().isLength({ max: 255 }), body('status').optional().isIn(['active', 'inactive'])],
  lecture: [
    body('title').trim().notEmpty().withMessage('Lecture title is required.').isLength({ max: 255 }),
    body('lecture_type').optional().isIn(['video', 'text', 'document', 'quiz', 'live_class']),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
    body('duration_seconds').optional({ values: 'falsy' }).isInt({ min: 0 })
  ],
  lectureUpdate: [
    body('title').optional().trim().notEmpty().isLength({ max: 255 }),
    body('lecture_type').optional().isIn(['video', 'text', 'document', 'quiz', 'live_class']),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
    body('duration_seconds').optional({ values: 'falsy' }).isInt({ min: 0 })
  ],
  video: [optionalId('section_id'), optionalId('lecture_id'), body('duration_seconds').optional({ values: 'falsy' }).isInt({ min: 0 }), body('title').optional().isLength({ max: 255 })],
  videoDirectUpload: [
    optionalId('section_id'),
    optionalId('lecture_id'),
    body('title').optional().isLength({ max: 255 }),
    body('upload_length').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('upload_length must be the file size in bytes.'),
    body('max_duration_seconds').optional({ values: 'falsy' }).isInt({ min: 1, max: 21600 }).withMessage('max_duration_seconds must be between 1 and 21600.'),
    body('tus').optional().isBoolean()
  ],
  quiz: [
    body('title').trim().notEmpty().withMessage('Quiz title is required.').isLength({ max: 255 }),
    body('passing_marks').optional().isFloat({ min: 0 }),
    body('passing_percentage').optional().isFloat({ min: 0, max: 100 }),
    body('time_limit_minutes').optional({ values: 'null' }).isInt({ min: 0 }),
    body('max_attempts').optional({ values: 'null' }).isInt({ min: 0 }),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
    body('questions').optional().isArray()
  ],
  quizUpdate: [
    body('title').optional().trim().notEmpty().isLength({ max: 255 }),
    body('passing_marks').optional().isFloat({ min: 0 }),
    body('passing_percentage').optional().isFloat({ min: 0, max: 100 }),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
    body('questions').optional().isArray()
  ],
  project: [body('title').trim().notEmpty().withMessage('Project title is required.').isLength({ max: 255 }), body('status').optional().isIn(['active', 'inactive'])],
  projectUpdate: [body('title').optional().trim().notEmpty().isLength({ max: 255 }), body('status').optional().isIn(['active', 'inactive'])],
  submissionReview: [body('status').isIn(['under_review', 'approved', 'rejected', 'resubmission_required']).withMessage('Invalid review status.')],
  liveClass: [
    requiredId('course_id'),
    optionalId('section_id'),
    body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 255 }),
    body('scheduled_start').isISO8601().withMessage('scheduled_start must be an ISO date-time.'),
    body('scheduled_end').isISO8601().withMessage('scheduled_end must be an ISO date-time.'),
    body('zoom_join_url').optional({ values: 'falsy' }).isURL().withMessage('zoom_join_url must be a URL.')
  ],
  liveClassUpdate: [
    body('scheduled_start').optional().isISO8601(),
    body('scheduled_end').optional().isISO8601(),
    body('zoom_join_url').optional({ values: 'falsy' }).isURL()
  ],
  liveClassStatus: [body('status').isIn(['scheduled', 'live', 'completed', 'cancelled']).withMessage('Invalid status.')],

  courseIdBody: [requiredId('course_id')],
  progress: [
    body('watched_seconds').optional().isFloat({ min: 0 }).withMessage('watched_seconds must be >= 0.'),
    body('position_seconds').optional().isFloat({ min: 0 }),
    body('completed').optional().isBoolean()
  ],
  quizSubmit: [body('answers').isArray().withMessage('answers must be an array.')],
  checkout: [body('course_ids').optional().isArray({ min: 1 }), body('coupon_code').optional({ values: 'falsy' }).isString().isLength({ max: 50 })],
  coupon: [body('code').trim().notEmpty().withMessage('Coupon code is required.')],
  paymentVerify: [
    body('razorpay_order_id').notEmpty().withMessage('razorpay_order_id is required.'),
    body('razorpay_payment_id').notEmpty().withMessage('razorpay_payment_id is required.'),
    body('razorpay_signature').notEmpty().withMessage('razorpay_signature is required.')
  ],
  review: [body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'), body('review').optional({ values: 'null' }).isLength({ max: 5000 })],
  communityText: [body('content').trim().notEmpty().withMessage('Content is required.').isLength({ max: 10000 })],

  // Admin
  userStatus: [body('status').isIn(['active', 'inactive', 'blocked', 'pending']).withMessage('Invalid status.')],
  tutorApproval: [body('action').isIn(['approve', 'reject']).withMessage('action must be approve or reject.')],
  createUser: [
    body('first_name').trim().notEmpty().withMessage('First name is required.'),
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('role').isIn(['student', 'tutor', 'admin']).withMessage('role must be student, tutor or admin.'),
    body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('status').optional().isIn(['active', 'inactive', 'blocked', 'pending'])
  ],
  courseApproval: [body('action').isIn(['approve', 'reject', 'publish']).withMessage('action must be approve, reject or publish.')],
  category: [body('name').trim().notEmpty().withMessage('Category name is required.').isLength({ max: 150 }), body('status').optional().isIn(['active', 'inactive'])],
  categoryUpdate: [body('name').optional().trim().notEmpty().isLength({ max: 150 }), body('status').optional().isIn(['active', 'inactive'])],
  enrollmentUpdate: [body('status').optional().isIn(['active', 'completed', 'cancelled', 'expired']), body('expires_at').optional({ values: 'null' }).isISO8601()],
  orderStatus: [body('status').isIn(['paid', 'cancelled', 'failed', 'pending']).withMessage('Invalid status.')],
  couponCreate: [
    body('code').trim().notEmpty().withMessage('Coupon code is required.').isLength({ max: 50 }).matches(/^[A-Za-z0-9_-]+$/).withMessage('Code may contain letters, numbers, - and _.'),
    body('discount_type').isIn(['percentage', 'fixed']).withMessage('discount_type must be percentage or fixed.'),
    body('discount_value').isFloat({ gt: 0 }).withMessage('discount_value must be greater than 0.'),
    body('expires_at').isISO8601().withMessage('expires_at is required (ISO date).'),
    body('start_at').optional().isISO8601(),
    money('minimum_order_amount'),
    money('maximum_discount'),
    body('usage_limit').optional({ values: 'null' }).isInt({ min: 1 }),
    body('status').optional().isIn(['active', 'inactive'])
  ],
  couponUpdate: [
    body('discount_type').optional().isIn(['percentage', 'fixed']),
    body('discount_value').optional().isFloat({ gt: 0 }),
    body('expires_at').optional().isISO8601(),
    body('start_at').optional().isISO8601(),
    body('status').optional().isIn(['active', 'inactive'])
  ],
  couponStatus: [body('status').isIn(['active', 'inactive']).withMessage('status must be active or inactive.')],
  payout: [requiredId('tutor_id'), body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0.'), body('status').optional().isIn(['pending', 'processing', 'paid', 'failed', 'cancelled'])],
  payoutUpdate: [body('status').optional().isIn(['pending', 'processing', 'paid', 'failed', 'cancelled'])],
  postStatus: [body('status').isIn(['published', 'hidden', 'deleted', 'pending']).withMessage('Invalid status.')],
  commentStatus: [body('status').isIn(['visible', 'hidden', 'deleted']).withMessage('Invalid status.')],
  reviewModeration: [body('status').isIn(['approved', 'rejected', 'pending']).withMessage('Invalid status.')],
  communication: [
    body('channel').isIn(['email', 'whatsapp']).withMessage('channel must be email or whatsapp.'),
    body('recipient_type').isIn(['student', 'tutor', 'all_students', 'all_tutors', 'all_users']).withMessage('Invalid recipient_type.'),
    optionalId('recipient_id'),
    body('subject').optional({ values: 'null' }).isLength({ max: 255 }),
    body('message').trim().notEmpty().withMessage('Message is required.').isLength({ max: 4096 })
  ],
  adminNotification: [
    body('audience').isIn(['user', 'all_students', 'all_tutors', 'all_users', 'course_students']).withMessage('Invalid audience.'),
    body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 255 }),
    body('message').trim().notEmpty().withMessage('Message is required.')
  ],
  page: [body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 255 }), body('status').optional().isIn(['draft', 'published', 'inactive'])],
  pageUpdate: [body('title').optional().trim().notEmpty().isLength({ max: 255 }), body('status').optional().isIn(['draft', 'published', 'inactive'])],
  contentStatus: [body('status').optional().isIn(['active', 'inactive'])],
  reportType: [query('format').optional().isIn(['json', 'csv'])]
};

export default v;
