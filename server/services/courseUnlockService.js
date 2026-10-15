import { Op } from 'sequelize';
import { StorePlan, StorePlanCourse, Course, CourseSection, Lecture, Enrollment, Order, OrderItem } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { toMoney } from '../utils/helpers.js';
import { getGroupSettings, getSetting } from './settingsService.js';
import { createCheckoutOrder } from './orderService.js';
import { getStoreUrl } from './woocommerceService.js';
import { allocateAmounts, loadUpgradeOverrides, upgradePrice } from './storePlanService.js';

/**
 * Locked courses and plan UPGRADES for students who bought (or were given) a STORE PLAN.
 *
 * A student who bought "Essential" has Premiere Pro only, but still sees the courses of the bigger plans as
 * locked: greyed out, with the message "Included in the Pro and Complete plans". To open them the student
 * upgrades to a bigger plan and pays only the DIFFERENCE:
 *
 *   owns Essential (7,999)  ->  Pro upgrade      = 14,999 - 7,999  =  7,000   (opens Photoshop)
 *                           ->  Complete upgrade = 29,999 - 7,999  = 22,000   (opens Photoshop + After Effects)
 *   owns Pro (14,999)       ->  Complete upgrade = 29,999 - 14,999 = 15,000   (opens After Effects)
 *
 * The price of a pair can be overridden by the admin (Admin > Store plans > edit plan > Upgrade prices).
 * An upgrade enrols the student in every course of the target plan they do not have yet; the money is split
 * between those courses by the plan's revenue weights (same as a normal plan purchase).
 *
 * Who sees locked courses: a plan buyer (a paid order with an item that has store_plan_id, set by the WooCommerce
 * order sync) or any student enrolled in a plan course (e.g. added by an admin). Others see none.
 */

const PENDING = ['pending', 'failed'];

/** Ids of the plans this user has actually paid for (refunded / cancelled orders do not count). */
export const planIdsBoughtBy = async (userId) => {
  const orders = await Order.findAll({ where: { user_id: userId, status: 'paid' }, attributes: ['id'] });
  if (!orders.length) return [];
  const items = await OrderItem.findAll({
    where: { order_id: { [Op.in]: orders.map((o) => o.id) }, store_plan_id: { [Op.ne]: null } },
    attributes: ['store_plan_id']
  });
  return [...new Set(items.map((i) => Number(i.store_plan_id)))];
};

const plansUrl = async () => {
  try {
    const store = await getStoreUrl();
    return store ? `${store}/#plans` : null;
  } catch {
    return null;
  }
};

const paymentReady = async () => {
  const cfg = await getGroupSettings('payment');
  return Boolean(cfg.razorpay_key_id && cfg.razorpay_key_secret);
};

/** Lecture count + total length per course (published lectures in active modules). */
const lectureStats = async (courseIds) => {
  if (!courseIds.length) return new Map();
  const rows = await Lecture.findAll({
    where: { status: 'published' },
    attributes: ['id', 'duration_seconds'],
    include: [{ model: CourseSection, as: 'section', attributes: ['course_id'], where: { course_id: { [Op.in]: courseIds }, status: 'active' } }]
  });
  const stats = new Map();
  for (const row of rows) {
    const key = Number(row.section.course_id);
    const s = stats.get(key) || { lecture_count: 0, duration_seconds: 0 };
    s.lecture_count += 1;
    s.duration_seconds += Number(row.duration_seconds || 0);
    stats.set(key, s);
  }
  return stats;
};

/**
 * Everything about what this student owns and can upgrade to.
 * @returns {{ isPlanStudent: boolean, plans: object[], enrolled: Set<number>, owned: object|null, offers: Map<number, object> }}
 *   offers: plan id -> { plan, missing: course[], price, from }  for every plan that still adds courses.
 */
const loadUpgradeState = async (user) => {
  const bought = new Set(await planIdsBoughtBy(user.id));
  const plans = await StorePlan.findAll({
    where: { status: 'active' },
    include: [{ model: StorePlanCourse, as: 'planCourses', include: [{ model: Course, as: 'course' }] }],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });
  const enrolled = new Set(
    (await Enrollment.findAll({ where: { user_id: user.id, status: { [Op.in]: ['active', 'completed'] } }, attributes: ['course_id'] })).map((e) => Number(e.course_id))
  );

  const published = (plan) => (plan.planCourses || []).filter((l) => l.course && l.course.status === 'published');
  const inAnyPlan = new Set(plans.flatMap((p) => published(p).map((l) => Number(l.course_id))));
  const isPlanStudent = bought.size > 0 || [...inAnyPlan].some((id) => enrolled.has(id));

  // The plan the student already "has" = the most expensive plan they bought or whose courses they all have.
  const hasAll = (plan) => published(plan).length > 0 && published(plan).every((l) => enrolled.has(Number(l.course_id)));
  const ownedPlans = plans.filter((p) => bought.has(Number(p.id)) || hasAll(p)).sort((a, b) => Number(b.price) - Number(a.price));
  const owned = ownedPlans[0] || null;

  const overrides = await loadUpgradeOverrides();
  const offers = new Map();
  for (const plan of plans) {
    // Only bigger plans than the one they have are upgrades.
    if (owned && (Number(plan.id) === Number(owned.id) || Number(plan.price) <= Number(owned.price))) continue;
    const missing = published(plan).filter((l) => !enrolled.has(Number(l.course_id)));
    if (!missing.length) continue;
    const price = owned ? upgradePrice(owned, plan, overrides) : toMoney(plan.price);
    offers.set(Number(plan.id), { plan, missing, price, from: owned });
  }
  return { isPlanStudent, plans, enrolled, owned, offers, published };
};

const offerJson = (offer) => ({
  plan_id: offer.plan.id,
  name: offer.plan.name,
  slug: offer.plan.slug,
  price: offer.price,
  full_price: toMoney(offer.plan.price),
  from_plan: offer.from ? { id: offer.from.id, name: offer.from.name } : null,
  unlocks: offer.missing.map((l) => ({ id: l.course.id, title: l.course.title }))
});

/**
 * Courses of the store plans that this student cannot open (yet), each with the plan upgrades that open it.
 * @returns {{ is_plan_buyer: boolean, plans_url: string|null, owned_plan: object|null, courses: object[] }}
 */
export const getLockedCourses = async (user) => {
  const url = await plansUrl();
  const state = await loadUpgradeState(user);
  if (!state.isPlanStudent) return { is_plan_buyer: false, plans_url: url, owned_plan: null, courses: [] };

  const byCourse = new Map();
  for (const plan of state.plans) {
    for (const link of state.published(plan)) {
      const id = Number(link.course_id);
      if (state.enrolled.has(id)) continue;
      const entry = byCourse.get(id) || { course: link.course, plans: [] };
      entry.plans.push(plan);
      byCourse.set(id, entry);
    }
  }
  const stats = await lectureStats([...byCourse.keys()]);

  const courses = [...byCourse.values()].map(({ course, plans: containing }) => {
    const options = containing
      .map((p) => state.offers.get(Number(p.id)))
      .filter(Boolean)
      .map(offerJson)
      .sort((a, b) => a.price - b.price);
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      thumbnail_url: course.thumbnail_url,
      short_description: course.short_description,
      level: course.level,
      included_in: containing.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
      upgrade_options: options,
      // The cheapest way to open this course.
      effective_price: options[0] ? options[0].price : 0,
      lecture_count: stats.get(Number(course.id))?.lecture_count || 0,
      duration_seconds: stats.get(Number(course.id))?.duration_seconds || 0
    };
  });

  return {
    is_plan_buyer: true,
    plans_url: url,
    owned_plan: state.owned ? { id: state.owned.id, name: state.owned.name } : null,
    courses
  };
};

const findLocked = async (user, courseId) => {
  const result = await getLockedCourses(user);
  const course = result.courses.find((c) => Number(c.id) === Number(courseId));
  if (!course) throw ApiError.notFound('This course is not available to unlock.');
  return { course, plans_url: result.plans_url, owned_plan: result.owned_plan };
};

/** A locked course with its module / lecture outline (titles only - no content) and the upgrades that open it. */
export const getLockedCourseOutline = async (user, courseId) => {
  const { course, plans_url: url, owned_plan: owned } = await findLocked(user, courseId);
  const sections = await CourseSection.findAll({
    where: { course_id: course.id, status: 'active' },
    attributes: ['id', 'title', 'description', 'sort_order'],
    include: [{ model: Lecture, as: 'lectures', where: { status: 'published' }, required: false, attributes: ['id', 'title', 'lecture_type', 'duration_seconds', 'sort_order'] }],
    order: [['sort_order', 'ASC'], [{ model: Lecture, as: 'lectures' }, 'sort_order', 'ASC']]
  });
  const ready = await paymentReady();
  const options = course.upgrade_options;
  let reason = null;
  if (!options.length || options.every((o) => o.price <= 0)) reason = 'The price of this upgrade has not been set yet. Please contact support.';
  else if (!ready) reason = 'Online payment is not available right now. Please contact support.';
  return {
    course,
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      lectures: (s.lectures || []).map((l) => ({ id: l.id, title: l.title, lecture_type: l.lecture_type, duration_seconds: l.duration_seconds }))
    })),
    purchase: {
      can_buy: !reason,
      reason,
      owned_plan: owned,
      options,
      currency: await getSetting('currency')
    },
    plans_url: url
  };
};

/**
 * Starts the Razorpay payment for a plan upgrade that opens `courseId` (the cheapest one unless `planId` is given).
 * The student pays the upgrade price and is enrolled in every course of that plan they do not have yet.
 * Only courses that are really locked for this student can be bought this way, so this does not open the
 * in-portal checkout in general (WooCommerce keeps handling everything else).
 * Returns what createCheckoutOrder returns: { order, payment: { key_id, razorpay_order_id, amount, ... } }.
 */
export const startUnlockPayment = async (user, courseId, planId = null) => {
  const { course } = await findLocked(user, courseId);
  const option = planId ? course.upgrade_options.find((o) => Number(o.plan_id) === Number(planId)) : course.upgrade_options[0];
  if (!option) throw ApiError.badRequest('That plan does not open this course.');
  if (option.price <= 0) throw ApiError.badRequest('The price of this upgrade has not been set yet. Please contact support.');
  if (!(await paymentReady())) throw new ApiError(503, 'Online payment is not available right now. Please contact support.');

  // Split the upgrade price between the courses it opens, by the plan's revenue weights.
  const state = await loadUpgradeState(user);
  const offer = state.offers.get(Number(option.plan_id));
  if (!offer) throw ApiError.badRequest('That plan does not open any new course for you.');
  const parts = allocateAmounts(offer.price, offer.missing.map((l) => Number(l.revenue_weight)));
  const amounts = new Map(offer.missing.map((l, i) => [Number(l.course_id), parts[i]]));
  const courseIds = offer.missing.map((l) => Number(l.course_id));

  // Old unpaid attempts for these courses are closed so only one pending upgrade exists.
  const stale = await Order.findAll({
    where: { user_id: user.id, source: 'lms', status: { [Op.in]: PENDING } },
    include: [{ model: OrderItem, as: 'items', where: { course_id: { [Op.in]: courseIds } }, attributes: ['id'] }],
    attributes: ['id']
  });
  if (stale.length) await Order.update({ status: 'cancelled' }, { where: { id: { [Op.in]: stale.map((o) => o.id) } } });

  return createCheckoutOrder(user, { courseIds, allowStore: true, upgrade: { planId: Number(option.plan_id), amounts } });
};
