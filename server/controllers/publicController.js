import { Op, fn, col, literal } from 'sequelize';
import {
  Course,
  Category,
  CourseSection,
  Lecture,
  User,
  Role,
  UserProfile,
  Review,
  Enrollment,
  Wishlist,
  Cart,
  CartItem,
  CmsPage,
  CmsContent,
  CourseTutor,
  RecordedVideo,
  Project,
  Quiz,
  LiveClass
} from '../models/index.js';
import { successResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/ApiError.js';
import { getPagination } from '../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../utils/serializers.js';
import { decorateCourses, getRatingsForCourses } from '../services/courseService.js';
import { canManageCourse, getAccessEnrollment } from '../services/accessService.js';
import { getPublicSettings } from '../services/settingsService.js';
import { isWooCommerceEnabled, buildBuyUrl } from '../services/woocommerceService.js';
import { loadCertificateForRender, DOWNLOADABLE_STATUSES } from '../services/certificateService.js';

const TUTOR_INCLUDE = {
  model: User,
  as: 'tutors',
  attributes: PUBLIC_USER_ATTRS,
  through: { attributes: ['is_primary'] }
};
const CATEGORY_INCLUDE = { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] };
const COURSE_CARD_ATTRS = [
  'id',
  'title',
  'slug',
  'short_description',
  'thumbnail_url',
  'price',
  'discount_price',
  'duration_minutes',
  'level',
  'language',
  'published_at',
  'category_id'
];

const getActiveContents = async () => {
  const rows = await CmsContent.findAll({ where: { status: 'active' }, attributes: ['section_key', 'title', 'content', 'image_url', 'data', 'updated_at'] });
  return Object.fromEntries(rows.map((r) => [r.section_key, r]));
};

/** GET /public/home - everything the homepage needs in one call. */
export const getHomepage = async (req, res) => {
  const contents = await getActiveContents();

  const featuredIds = contents.featured_courses?.data?.course_ids;
  const featuredWhere = { status: 'published', ...(Array.isArray(featuredIds) && featuredIds.length && { id: { [Op.in]: featuredIds } }) };
  const [featured, latest, popularRows, categories, studentCount, tutorCount, courseCount, testimonials] = await Promise.all([
    Course.findAll({ where: featuredWhere, attributes: COURSE_CARD_ATTRS, include: [CATEGORY_INCLUDE, TUTOR_INCLUDE], order: [['published_at', 'DESC']], limit: 8 }),
    Course.findAll({ where: { status: 'published' }, attributes: COURSE_CARD_ATTRS, include: [CATEGORY_INCLUDE, TUTOR_INCLUDE], order: [['published_at', 'DESC']], limit: 8 }),
    Enrollment.findAll({
      attributes: ['course_id', [fn('COUNT', col('Enrollment.id')), 'students']],
      where: { status: { [Op.in]: ['active', 'completed'] } },
      include: [{ model: Course, as: 'course', attributes: [], where: { status: 'published' } }],
      group: ['course_id'],
      order: [[literal('students'), 'DESC']],
      limit: 8,
      raw: true
    }),
    Category.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'slug', 'description', 'image_url', [literal("(SELECT COUNT(*) FROM courses c WHERE c.category_id = Category.id AND c.status = 'published')"), 'course_count']],
      order: [['name', 'ASC']]
    }),
    User.count({ where: { status: 'active' }, include: [{ model: Role, as: 'role', where: { name: 'student' } }] }),
    User.count({ where: { status: 'active' }, include: [{ model: Role, as: 'role', where: { name: 'tutor' } }] }),
    Course.count({ where: { status: 'published' } }),
    Review.findAll({
      where: { status: 'approved', rating: { [Op.gte]: 4 }, review: { [Op.ne]: null } },
      include: [
        { model: User, as: 'user', attributes: PUBLIC_USER_ATTRS },
        { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }
      ],
      order: [['created_at', 'DESC']],
      limit: 6
    })
  ]);

  const popularIds = popularRows.map((r) => r.course_id);
  const popular = popularIds.length
    ? await Course.findAll({ where: { id: { [Op.in]: popularIds } }, attributes: COURSE_CARD_ATTRS, include: [CATEGORY_INCLUDE, TUTOR_INCLUDE] })
    : [];
  popular.sort((a, b) => popularIds.indexOf(a.id) - popularIds.indexOf(b.id));

  return successResponse(res, {
    data: {
      contents,
      featured_courses: await decorateCourses(featured),
      latest_courses: await decorateCourses(latest),
      popular_courses: await decorateCourses(popular),
      categories,
      testimonials,
      stats: { students: studentCount, tutors: tutorCount, courses: courseCount }
    }
  });
};

/** GET /public/contents/:sectionKey - a single CMS content block. */
export const getContentBlock = async (req, res) => {
  const block = await CmsContent.findOne({ where: { section_key: req.params.sectionKey, status: 'active' } });
  if (!block) throw ApiError.notFound('Content not found.');
  return successResponse(res, { data: { content: block } });
};

/** GET /public/categories */
export const getCategories = async (req, res) => {
  const categories = await Category.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'slug', 'description', 'image_url', [literal("(SELECT COUNT(*) FROM courses c WHERE c.category_id = Category.id AND c.status = 'published')"), 'course_count']],
    order: [['name', 'ASC']]
  });
  return successResponse(res, { data: { categories } });
};

/**
 * GET /public/courses
 * Filters: search, category (id or slug), level, language, price=free|paid,
 * min_price, max_price, tutor_id, sort=newest|popular|price_asc|price_desc|title
 */
export const listCourses = async (req, res) => {
  const { search, category, category_id, level, language, price, min_price, max_price, tutor_id, sort } = req.query;
  const { limit, offset, meta } = getPagination(req.query, 12);

  const where = { status: 'published' };
  if (search) {
    where[Op.or] = [{ title: { [Op.like]: `%${search}%` } }, { short_description: { [Op.like]: `%${search}%` } }];
  }
  const categoryFilter = category_id || category;
  if (categoryFilter) {
    if (/^\d+$/.test(String(categoryFilter))) where.category_id = categoryFilter;
    else {
      const cat = await Category.findOne({ where: { slug: categoryFilter } });
      where.category_id = cat ? cat.id : -1;
    }
  }
  if (level) where.level = level;
  if (language) where.language = language;
  const priceExpr = literal('COALESCE(`Course`.`discount_price`, `Course`.`price`)');
  const andConditions = [];
  if (price === 'free') andConditions.push(literal('COALESCE(`Course`.`discount_price`, `Course`.`price`) = 0'));
  if (price === 'paid') andConditions.push(literal('COALESCE(`Course`.`discount_price`, `Course`.`price`) > 0'));
  if (min_price !== undefined && min_price !== '') andConditions.push(literal(`COALESCE(\`Course\`.\`discount_price\`, \`Course\`.\`price\`) >= ${Number(min_price) || 0}`));
  if (max_price !== undefined && max_price !== '') andConditions.push(literal(`COALESCE(\`Course\`.\`discount_price\`, \`Course\`.\`price\`) <= ${Number(max_price) || 0}`));
  if (tutor_id) {
    andConditions.push(literal(`EXISTS (SELECT 1 FROM course_tutors ct WHERE ct.course_id = \`Course\`.\`id\` AND ct.tutor_id = ${Number(tutor_id) || 0})`));
  }
  if (andConditions.length) where[Op.and] = andConditions;

  const orderMap = {
    newest: [['published_at', 'DESC']],
    oldest: [['published_at', 'ASC']],
    price_asc: [[priceExpr, 'ASC']],
    price_desc: [[priceExpr, 'DESC']],
    title: [['title', 'ASC']],
    popular: [[literal("(SELECT COUNT(*) FROM enrollments e WHERE e.course_id = `Course`.`id` AND e.status IN ('active','completed'))"), 'DESC']],
    rating: [[literal("(SELECT COALESCE(AVG(r.rating),0) FROM reviews r WHERE r.course_id = `Course`.`id` AND r.status = 'approved')"), 'DESC']]
  };

  const { count, rows } = await Course.findAndCountAll({
    where,
    attributes: COURSE_CARD_ATTRS,
    include: [CATEGORY_INCLUDE, TUTOR_INCLUDE],
    order: orderMap[sort] || orderMap.newest,
    limit,
    offset,
    distinct: true
  });

  return successResponse(res, { data: { courses: await decorateCourses(rows) }, meta: meta(count) });
};

/**
 * GET /public/courses/:identifier (id or slug)
 * Published courses for everyone; staff who manage the course can preview drafts.
 */
export const getCourseDetails = async (req, res) => {
  const { identifier } = req.params;
  const where = /^\d+$/.test(identifier) ? { id: identifier } : { slug: identifier };

  const course = await Course.findOne({
    where,
    include: [
      CATEGORY_INCLUDE,
      {
        model: User,
        as: 'tutors',
        attributes: PUBLIC_USER_ATTRS,
        through: { attributes: ['is_primary'] },
        include: [{ model: UserProfile, as: 'profile', attributes: ['bio', 'website', 'linkedin_url', 'city', 'country'] }]
      },
      {
        model: CourseSection,
        as: 'sections',
        where: { status: 'active' },
        required: false,
        attributes: ['id', 'title', 'description', 'sort_order'],
        include: [
          {
            model: Lecture,
            as: 'lectures',
            where: { status: 'published' },
            required: false,
            attributes: ['id', 'title', 'lecture_type', 'sort_order', 'is_preview', 'duration_seconds']
          }
        ]
      }
    ],
    order: [
      [{ model: CourseSection, as: 'sections' }, 'sort_order', 'ASC'],
      [{ model: CourseSection, as: 'sections' }, { model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']
    ]
  });

  if (!course) throw ApiError.notFound('Course not found.');
  const isStaffPreview = req.user ? await canManageCourse(req.user, course.id) : false;
  if (course.status !== 'published' && !isStaffPreview) throw ApiError.notFound('Course not found.');

  const [decorated] = await decorateCourses([course]);
  // Paid courses are bought on the WooCommerce store; null = not purchasable there (yet):
  // unlinked, or the product is not published on the store.
  const storeCheckout = await isWooCommerceEnabled();
  const productStatus = course.woocommerce_product_status;
  const onSale = storeCheckout && course.woocommerce_product_id && (!productStatus || productStatus === 'publish');
  decorated.purchase = {
    store_checkout: storeCheckout,
    purchase_url: onSale ? await buildBuyUrl(course.woocommerce_product_id) : null,
    product_url: onSale ? course.woocommerce_product_url : null
  };
  for (const key of ['woocommerce_product_id', 'woocommerce_product_status', 'woocommerce_product_url', 'woocommerce_synced_at', 'woocommerce_sync_error']) {
    delete decorated[key];
  }

  const [ratingBreakdown, projectCount, quizCount, upcomingLiveClasses, resourceVideoCount] = await Promise.all([
    Review.findAll({
      attributes: ['rating', [fn('COUNT', col('id')), 'count']],
      where: { course_id: course.id, status: 'approved' },
      group: ['rating'],
      raw: true
    }),
    Project.count({ where: { course_id: course.id, status: 'active' } }),
    Quiz.count({ where: { course_id: course.id, status: 'published' } }),
    LiveClass.count({ where: { course_id: course.id, status: { [Op.in]: ['scheduled', 'live'] }, scheduled_end: { [Op.gte]: new Date() } } }),
    RecordedVideo.count({ where: { course_id: course.id, status: { [Op.in]: ['ready', 'published'] } } })
  ]);

  let viewer = null;
  if (req.user) {
    const [enrollment, wish, cart] = await Promise.all([
      getAccessEnrollment(req.user.id, course.id),
      Wishlist.findOne({ where: { user_id: req.user.id, course_id: course.id }, attributes: ['id'] }),
      Cart.findOne({ where: { user_id: req.user.id, status: 'active' }, attributes: ['id'] })
    ]);
    const inCart = cart ? Boolean(await CartItem.findOne({ where: { cart_id: cart.id, course_id: course.id }, attributes: ['id'] })) : false;
    viewer = {
      is_enrolled: Boolean(enrollment),
      enrollment_id: enrollment ? enrollment.id : null,
      completion_percentage: enrollment ? Number(enrollment.completion_percentage) : null,
      in_wishlist: Boolean(wish),
      in_cart: inCart,
      can_manage: isStaffPreview
    };
  }

  return successResponse(res, {
    data: {
      course: decorated,
      includes: {
        recorded_videos: resourceVideoCount,
        quizzes: quizCount,
        final_project: projectCount > 0,
        upcoming_live_classes: upcomingLiveClasses,
        certificate: true,
        lifetime_community_access: true
      },
      rating_breakdown: [5, 4, 3, 2, 1].map((star) => ({
        rating: star,
        count: Number(ratingBreakdown.find((r) => Number(r.rating) === star)?.count || 0)
      })),
      viewer
    }
  });
};

/** GET /public/courses/:courseId/reviews - approved reviews, paginated. */
export const getCourseReviews = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 10);
  const { count, rows } = await Review.findAndCountAll({
    where: { course_id: req.params.courseId, status: 'approved' },
    attributes: ['id', 'rating', 'review', 'created_at', 'updated_at'],
    include: [{ model: User, as: 'user', attributes: PUBLIC_USER_ATTRS }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { reviews: rows }, meta: meta(count) });
};

/** GET /public/tutors - active tutors with at least one published course (or all with ?all=true). */
export const listTutors = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 12);
  const where = { status: 'active' };
  if (req.query.search) {
    where[Op.or] = [
      { first_name: { [Op.like]: `%${req.query.search}%` } },
      { last_name: { [Op.like]: `%${req.query.search}%` } }
    ];
  }
  if (req.query.all !== 'true') {
    where[Op.and] = [literal("EXISTS (SELECT 1 FROM course_tutors ct JOIN courses c ON c.id = ct.course_id WHERE ct.tutor_id = `User`.`id` AND c.status = 'published')")];
  }
  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: [
      ...PUBLIC_USER_ATTRS,
      [literal("(SELECT COUNT(*) FROM course_tutors ct JOIN courses c ON c.id = ct.course_id WHERE ct.tutor_id = `User`.`id` AND c.status = 'published')"), 'course_count'],
      [literal("(SELECT COUNT(DISTINCT e.user_id) FROM course_tutors ct JOIN enrollments e ON e.course_id = ct.course_id WHERE ct.tutor_id = `User`.`id` AND e.status IN ('active','completed'))"), 'student_count'],
      [literal("(SELECT ROUND(AVG(r.rating),1) FROM course_tutors ct JOIN reviews r ON r.course_id = ct.course_id WHERE ct.tutor_id = `User`.`id` AND r.status = 'approved')"), 'average_rating']
    ],
    include: [
      { model: Role, as: 'role', attributes: [], where: { name: 'tutor' } },
      { model: UserProfile, as: 'profile', attributes: ['bio', 'city', 'country', 'website', 'linkedin_url'] }
    ],
    order: [[literal('student_count'), 'DESC']],
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { tutors: rows }, meta: meta(count) });
};

/** GET /public/tutors/:tutorId - public tutor profile with published courses. */
export const getTutorProfile = async (req, res) => {
  const tutor = await User.findOne({
    where: { id: req.params.tutorId, status: 'active' },
    attributes: [...PUBLIC_USER_ATTRS, 'created_at'],
    include: [
      { model: Role, as: 'role', attributes: [], where: { name: 'tutor' } },
      { model: UserProfile, as: 'profile', attributes: ['bio', 'city', 'state', 'country', 'website', 'linkedin_url'] }
    ]
  });
  if (!tutor) throw ApiError.notFound('Tutor not found.');

  const assignments = await CourseTutor.findAll({ where: { tutor_id: tutor.id }, attributes: ['course_id'] });
  const courses = await Course.findAll({
    where: { id: { [Op.in]: assignments.map((a) => a.course_id) }, status: 'published' },
    attributes: COURSE_CARD_ATTRS,
    include: [CATEGORY_INCLUDE, TUTOR_INCLUDE],
    order: [['published_at', 'DESC']]
  });
  const decorated = await decorateCourses(courses);
  const ratings = await getRatingsForCourses(courses.map((c) => c.id));
  const totalReviews = Object.values(ratings).reduce((s, r) => s + r.review_count, 0);
  const weighted = Object.values(ratings).reduce((s, r) => s + r.average_rating * r.review_count, 0);

  return successResponse(res, {
    data: {
      tutor,
      stats: {
        courses: decorated.length,
        students: decorated.reduce((s, c) => s + c.student_count, 0),
        reviews: totalReviews,
        average_rating: totalReviews ? Math.round((weighted / totalReviews) * 10) / 10 : 0
      },
      courses: decorated
    }
  });
};

/** GET /public/pages - published static pages (for footer / nav). */
export const listPages = async (req, res) => {
  const pages = await CmsPage.findAll({
    where: { status: 'published' },
    attributes: ['id', 'title', 'slug', 'meta_title', 'meta_description', 'published_at'],
    order: [['title', 'ASC']]
  });
  return successResponse(res, { data: { pages } });
};

/** GET /public/pages/:slug - static page (About, Terms, Privacy, ...). */
export const getPage = async (req, res) => {
  const page = await CmsPage.findOne({ where: { slug: req.params.slug, status: 'published' } });
  if (!page) throw ApiError.notFound('Page not found.');
  return successResponse(res, { data: { page } });
};

/** GET /public/settings - non-secret site settings (name, logo, currency, Razorpay key id...). */
export const getSiteSettings = async (req, res) => {
  return successResponse(res, { data: { settings: await getPublicSettings() } });
};

/** GET /public/certificates/verify/:certificateNumber */
export const verifyCertificate = async (req, res) => {
  const certificate = await loadCertificateForRender({
    certificate_number: req.params.certificateNumber,
    status: { [Op.in]: DOWNLOADABLE_STATUSES }
  });
  if (!certificate) throw ApiError.notFound('Certificate not found or has been revoked.');
  return successResponse(res, {
    message: 'Certificate is valid.',
    data: {
      certificate: {
        certificate_number: certificate.certificate_number,
        issue_date: certificate.issue_date,
        status: certificate.status,
        student_name: `${certificate.student.first_name} ${certificate.student.last_name || ''}`.trim(),
        course: { id: certificate.course.id, title: certificate.course.title },
        approved_by: certificate.approver ? `${certificate.approver.first_name} ${certificate.approver.last_name || ''}`.trim() : null
      }
    }
  });
};

export default {
  getHomepage,
  getContentBlock,
  getCategories,
  listCourses,
  getCourseDetails,
  getCourseReviews,
  listTutors,
  getTutorProfile,
  listPages,
  getPage,
  getSiteSettings,
  verifyCertificate
};
