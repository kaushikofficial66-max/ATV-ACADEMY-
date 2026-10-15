import { Op, fn, col } from 'sequelize';
import {
  Order,
  OrderItem,
  Payment,
  Coupon,
  CouponUsage,
  User,
  Role,
  Course,
  Enrollment,
  TutorPayout
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, getSort, dateRange } from '../../utils/pagination.js';
import { pick, toMoney } from '../../utils/helpers.js';
import { fulfillOrder, applyOrderRefund, getOrderDetails } from '../../services/orderService.js';
import { refundGatewayPayment } from '../../services/paymentService.js';
import { notifyUser } from '../../services/notificationService.js';
import { getTutorEarnings } from '../../services/earningsService.js';
import { syncOrderById, reconcileRecentOrders } from '../../services/woocommerceSyncService.js';
import { ensureProductForCourse, syncCoursesFromStore } from '../../services/woocommerceProductService.js';

/** WooCommerce is the source of truth for store orders: payment state and refunds change there only. */
const assertNotStoreOrder = (order, action) => {
  if (order.source === 'woocommerce') {
    throw ApiError.badRequest(`This order belongs to the WooCommerce store - ${action} it in WooCommerce; the LMS updates automatically.`);
  }
};

const BUYER = { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] };

// ==========================================================================
// Orders
// ==========================================================================

/** GET /admin/orders?status=&search=&user_id=&course_id=&coupon_id=&from=&to= */
export const listOrders = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.coupon_id) where.coupon_id = req.query.coupon_id;
  if (req.query.source) where.source = req.query.source;
  if (req.query.search) where.order_number = { [Op.like]: `%${req.query.search}%` };

  const itemInclude = { model: OrderItem, as: 'items', attributes: ['id', 'course_id', 'course_title', 'price', 'discount_amount', 'final_amount'] };
  if (req.query.course_id) Object.assign(itemInclude, { where: { course_id: req.query.course_id } });

  const [{ count, rows }, totals] = await Promise.all([
    Order.findAndCountAll({
      where,
      include: [BUYER, itemInclude, { model: Payment, as: 'payments', attributes: ['id', 'status', 'payment_gateway', 'payment_method', 'gateway_payment_id', 'paid_at'] }],
      order: getSort(req.query, ['created_at', 'total_amount'], ['created_at', 'DESC']),
      limit,
      offset,
      distinct: true
    }),
    Order.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_amount')), 'amount']], where, group: ['status'], raw: true })
  ]);
  return successResponse(res, {
    data: {
      orders: rows,
      totals: Object.fromEntries(totals.map((t) => [t.status, { count: Number(t.count), amount: toMoney(t.amount) }]))
    },
    meta: meta(count)
  });
};

/**
 * GET /admin/orders/:orderId - everything about one order:
 * order (items + course, coupon), buyer + their order history, every payment attempt incl. the gateway
 * response, who marked it paid / refunded, the enrolments it granted, coupon usage.
 */
export const getOrder = async (req, res) => {
  const order = await getOrderDetails(req.params.orderId);
  if (!order) throw ApiError.notFound('Order not found.');
  const [user, payments, enrollments, couponUsages, history] = await Promise.all([
    User.findByPk(order.user_id, { attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'email_verified_at', 'woocommerce_customer_id', 'created_at'] }),
    Payment.findAll({ where: { order_id: order.id }, attributes: { exclude: ['gateway_signature'] }, order: [['created_at', 'DESC']] }),
    Enrollment.findAll({
      where: { order_id: order.id },
      attributes: ['id', 'course_id', 'status', 'enrolled_at', 'expires_at', 'completion_percentage', 'completed_at'],
      include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] }],
      order: [['enrolled_at', 'ASC']]
    }),
    CouponUsage.findAll({ where: { order_id: order.id }, attributes: ['id', 'coupon_id', 'discount_amount', 'created_at'] }),
    Order.findAll({ where: { user_id: order.user_id }, attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_amount')), 'amount']], group: ['status'], raw: true })
  ]);

  // Staff who marked the order paid / refunded it by hand (stored as ids in the payment record).
  const staffIds = new Set();
  for (const p of payments) {
    const raw = p.raw_response || {};
    if (raw.marked_paid_by) staffIds.add(Number(raw.marked_paid_by));
    if (raw.refund?.by) staffIds.add(Number(raw.refund.by));
  }
  const staff = staffIds.size ? await User.findAll({ where: { id: { [Op.in]: [...staffIds] } }, attributes: ['id', 'first_name', 'last_name'] }) : [];

  const stat = (status) => history.find((h) => h.status === status);
  return successResponse(res, {
    data: {
      order,
      user,
      transactions: payments,
      enrollments,
      coupon_usages: couponUsages,
      staff,
      buyer_stats: {
        orders: history.reduce((n, h) => n + Number(h.count), 0),
        paid_orders: Number(stat('paid')?.count || 0),
        paid_amount: toMoney(stat('paid')?.amount || 0)
      }
    }
  });
};

/**
 * PATCH /admin/orders/:orderId/status { status, note }
 * - paid: mark an offline / manually-verified payment as paid (enrolls the student)
 * - cancelled / failed: only for unpaid orders
 */
export const updateOrderStatus = async (req, res) => {
  const order = await Order.findByPk(req.params.orderId);
  if (!order) throw ApiError.notFound('Order not found.');
  assertNotStoreOrder(order, 'change the status of');
  const { status } = req.body;

  if (status === 'paid') {
    if (order.status !== 'pending' && order.status !== 'failed') throw ApiError.badRequest(`A ${order.status} order cannot be marked as paid.`);
    const manualPayment = await Payment.create({
      order_id: order.id,
      user_id: order.user_id,
      payment_gateway: 'manual',
      gateway_payment_id: req.body.transaction_reference || null,
      amount: order.total_amount,
      currency: order.currency,
      status: 'created',
      payment_method: req.body.payment_method || 'offline',
      raw_response: { marked_paid_by: req.user.id, note: req.body.note || null }
    });
    await fulfillOrder(order.id, {
      paymentId: manualPayment.id,
      gatewayPaymentId: req.body.transaction_reference || null,
      method: req.body.payment_method || 'offline',
      gateway: 'manual'
    });
  } else if (['cancelled', 'failed'].includes(status)) {
    if (order.status === 'paid' || order.status === 'refunded') throw ApiError.badRequest('Paid orders must be refunded, not cancelled.');
    await order.update({ status });
  } else if (status === 'pending') {
    if (order.status !== 'failed' && order.status !== 'cancelled') throw ApiError.badRequest('Only failed or cancelled orders can be reopened.');
    await order.update({ status });
  } else {
    throw ApiError.badRequest('Use the refund endpoint to refund an order.');
  }
  return successResponse(res, { message: `Order marked as ${status}.`, data: { order: await getOrderDetails(order.id) } });
};

/**
 * POST /admin/orders/:orderId/refund { reason, gateway_refund (default true) }
 * Refunds via Razorpay when the order was paid online, then cancels the
 * enrollments granted by the order.
 */
export const refundOrder = async (req, res) => {
  const order = await Order.findByPk(req.params.orderId);
  if (!order) throw ApiError.notFound('Order not found.');
  assertNotStoreOrder(order, 'refund');
  if (order.status !== 'paid') throw ApiError.badRequest('Only paid orders can be refunded.');

  const payment = await Payment.findOne({ where: { order_id: order.id, status: 'success' }, order: [['paid_at', 'DESC']] });
  let refund = null;
  const useGateway = req.body.gateway_refund !== false && payment && payment.payment_gateway === 'razorpay' && payment.gateway_payment_id;
  if (useGateway) refund = await refundGatewayPayment(payment.gateway_payment_id, req.body.amount || null);

  await applyOrderRefund(order.id, { paymentId: payment?.id || null, refund: refund || { manual: true, reason: req.body.reason || null, by: req.user.id } });
  return successResponse(res, {
    message: useGateway ? 'Refund initiated with Razorpay and access revoked.' : 'Order marked as refunded and access revoked.',
    data: { order: await getOrderDetails(order.id), refund }
  });
};

/** GET /admin/payments?status=&gateway=&search= - transactions list. */
export const listPayments = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.gateway) where.payment_gateway = req.query.gateway;
  if (req.query.search) {
    where[Op.or] = [{ gateway_payment_id: { [Op.like]: `%${req.query.search}%` } }, { gateway_order_id: { [Op.like]: `%${req.query.search}%` } }];
  }
  const { count, rows } = await Payment.findAndCountAll({
    where,
    attributes: { exclude: ['raw_response', 'gateway_signature'] },
    include: [{ model: Order, as: 'order', attributes: ['id', 'order_number', 'status'] }, BUYER],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { payments: rows }, meta: meta(count) });
};

/** GET /admin/payments/:paymentId - full transaction details incl. gateway response. */
export const getPayment = async (req, res) => {
  const payment = await Payment.findByPk(req.params.paymentId, {
    include: [{ model: Order, as: 'order', include: [{ model: OrderItem, as: 'items' }] }, BUYER]
  });
  if (!payment) throw ApiError.notFound('Payment not found.');
  return successResponse(res, { data: { payment } });
};

// ==========================================================================
// WooCommerce sync
// ==========================================================================

/** POST /admin/woocommerce/orders/:wcOrderId/sync - re-pull one store order via the REST API and apply it. */
export const syncWooCommerceOrder = async (req, res) => {
  const result = await syncOrderById(req.params.wcOrderId, { trigger: `admin:${req.user.id}` });
  const order = result.order_id ? await getOrderDetails(result.order_id) : null;
  return successResponse(res, { message: `WooCommerce order #${req.params.wcOrderId}: ${result.action.replace(/_/g, ' ')}.`, data: { result, order } });
};

/** POST /admin/woocommerce/reconcile { since? } - re-sync every store order modified since `since` (default: last run). */
export const reconcileWooCommerce = async (req, res) => {
  const since = req.body?.since ? new Date(req.body.since) : null;
  if (since && Number.isNaN(since.getTime())) throw ApiError.badRequest('since must be a date.');
  const result = await reconcileRecentOrders({ since });
  if (result.skipped) throw ApiError.badRequest('WooCommerce reconciliation is disabled or the REST API is not configured (Admin > Settings > Woocommerce).');
  return successResponse(res, { message: `Checked ${result.checked} order(s): ${result.synced} updated, ${result.failed} failed.`, data: result });
};

/**
 * POST /admin/courses/:courseId/woocommerce-product - create the store product
 * for a course now (retry after an error, or a free course / auto-create off).
 */
export const createCourseProduct = async (req, res) => {
  const course = await Course.findByPk(req.params.courseId);
  if (!course) throw ApiError.notFound('Course not found.');
  if (course.woocommerce_product_id) throw ApiError.conflict(`This course is already linked to store product #${course.woocommerce_product_id}.`);
  const result = await ensureProductForCourse(course, { force: true });
  if (result.action === 'skipped') throw ApiError.badRequest('Enable WooCommerce and add REST API keys (Read/Write) in Admin > Settings > Woocommerce first.');
  if (result.action === 'error') throw new ApiError(502, `Could not create the store product: ${result.error}`);
  await course.reload();
  return successResponse(res, {
    statusCode: result.action === 'created' ? 201 : 200,
    message: result.action === 'created' ? 'Draft product created on the store. Complete and publish it in WordPress.' : 'Linked to the existing store product.',
    data: { course, store_product: result }
  });
};

/** POST /admin/woocommerce/products/sync { course_ids? } - read price / status of linked products now. */
export const syncCourseProducts = async (req, res) => {
  const ids = Array.isArray(req.body?.course_ids) ? req.body.course_ids.map(Number).filter((n) => n > 0) : null;
  const result = await syncCoursesFromStore({ courseIds: ids });
  if (result.skipped) throw ApiError.badRequest('Enable WooCommerce and add REST API keys in Admin > Settings > Woocommerce first.');
  return successResponse(res, {
    message: `Synced ${result.synced} of ${result.checked} linked course(s)${result.missing ? `, ${result.missing} product(s) missing on the store` : ''}${result.failed ? `, ${result.failed} failed` : ''}.`,
    data: result
  });
};

// ==========================================================================
// Coupons
// ==========================================================================

const COUPON_FIELDS = ['description', 'discount_type', 'discount_value', 'minimum_order_amount', 'maximum_discount', 'usage_limit', 'start_at', 'expires_at', 'status'];

const normalizeCoupon = (body) => {
  const data = pick(body, COUPON_FIELDS);
  for (const key of ['minimum_order_amount', 'maximum_discount', 'usage_limit']) if (data[key] === '') data[key] = null;
  if (data.discount_type === 'percentage' && data.discount_value !== undefined && (Number(data.discount_value) <= 0 || Number(data.discount_value) > 100)) {
    throw ApiError.badRequest('Percentage discount must be between 0 and 100.');
  }
  if (data.start_at && data.expires_at && new Date(data.expires_at) <= new Date(data.start_at)) {
    throw ApiError.badRequest('expires_at must be after start_at.');
  }
  return data;
};

/** Reports coupons past their expiry as `expired` (and persists it). */
const syncExpired = async () => {
  await Coupon.update({ status: 'expired' }, { where: { status: 'active', expires_at: { [Op.lt]: new Date() } } });
};

/** GET /admin/coupons?status=&search= */
export const listCoupons = async (req, res) => {
  await syncExpired();
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.code = { [Op.like]: `%${req.query.search.toUpperCase()}%` };
  const { count, rows } = await Coupon.findAndCountAll({
    where,
    attributes: { include: [[Coupon.sequelize.literal('(SELECT COALESCE(SUM(cu.discount_amount),0) FROM coupon_usages cu WHERE cu.coupon_id = `Coupon`.`id`)'), 'total_discount_given']] },
    include: [{ model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { coupons: rows }, meta: meta(count) });
};

/** POST /admin/coupons */
export const createCoupon = async (req, res) => {
  const data = normalizeCoupon(req.body);
  const coupon = await Coupon.create({
    ...data,
    code: String(req.body.code).trim().toUpperCase(),
    start_at: data.start_at || new Date(),
    status: data.status || 'active',
    created_by: req.user.id
  });
  return successResponse(res, { statusCode: 201, message: 'Coupon created.', data: { coupon } });
};

/** GET /admin/coupons/:couponId - coupon with usage history. */
export const getCoupon = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.couponId, { include: [{ model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name'] }] });
  if (!coupon) throw ApiError.notFound('Coupon not found.');
  const usages = await CouponUsage.findAll({
    where: { coupon_id: coupon.id },
    include: [
      { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: Order, as: 'order', attributes: ['id', 'order_number', 'total_amount', 'status'] }
    ],
    order: [['created_at', 'DESC']],
    limit: 200
  });
  return successResponse(res, { data: { coupon, usages } });
};

/** PUT /admin/coupons/:couponId */
export const updateCoupon = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.couponId);
  if (!coupon) throw ApiError.notFound('Coupon not found.');
  const data = normalizeCoupon({ ...req.body, discount_type: req.body.discount_type || coupon.discount_type });
  if (req.body.code) data.code = String(req.body.code).trim().toUpperCase();
  const start = data.start_at || coupon.start_at;
  const end = data.expires_at || coupon.expires_at;
  if (new Date(end) <= new Date(start)) throw ApiError.badRequest('expires_at must be after start_at.');
  if (data.usage_limit !== undefined && data.usage_limit !== null && Number(data.usage_limit) < coupon.usage_count) {
    throw ApiError.badRequest(`usage_limit cannot be lower than the current usage (${coupon.usage_count}).`);
  }
  // Re-activating an extended coupon.
  if (!data.status && coupon.status === 'expired' && new Date(end) > new Date()) data.status = 'active';
  await coupon.update(data);
  return successResponse(res, { message: 'Coupon updated.', data: { coupon } });
};

/** PATCH /admin/coupons/:couponId/status { status: active|inactive } */
export const updateCouponStatus = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.couponId);
  if (!coupon) throw ApiError.notFound('Coupon not found.');
  if (req.body.status === 'active' && new Date(coupon.expires_at) < new Date()) throw ApiError.badRequest('This coupon has expired. Extend expires_at first.');
  await coupon.update({ status: req.body.status });
  return successResponse(res, { message: `Coupon ${req.body.status}.`, data: { coupon } });
};

/** DELETE /admin/coupons/:couponId - only unused coupons (otherwise deactivate). */
export const deleteCoupon = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.couponId);
  if (!coupon) throw ApiError.notFound('Coupon not found.');
  if ((await CouponUsage.count({ where: { coupon_id: coupon.id } })) || (await Order.count({ where: { coupon_id: coupon.id } }))) {
    throw ApiError.conflict('This coupon has been used. Set it to inactive instead.');
  }
  await coupon.destroy();
  return successResponse(res, { message: 'Coupon deleted.' });
};

// ==========================================================================
// Tutor payouts
// ==========================================================================

/** GET /admin/payouts?tutor_id=&status= */
export const listPayouts = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.tutor_id) where.tutor_id = req.query.tutor_id;
  if (req.query.status) where.status = req.query.status;
  const { count, rows } = await TutorPayout.findAndCountAll({
    where,
    include: [
      { model: User, as: 'tutor', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { payouts: rows }, meta: meta(count) });
};

/** GET /admin/tutors/:tutorId/earnings */
export const getTutorEarningsForAdmin = async (req, res) => {
  return successResponse(res, { data: await getTutorEarnings(req.params.tutorId, req.query) });
};

/** POST /admin/payouts { tutor_id, amount, period_start, period_end, payout_method, transaction_reference, note, status } */
export const createPayout = async (req, res) => {
  const tutor = await User.findByPk(req.body.tutor_id, { include: [{ model: Role, as: 'role' }] });
  if (!tutor || tutor.role.name !== 'tutor') throw ApiError.badRequest('tutor_id must reference a tutor.');
  const earnings = await getTutorEarnings(tutor.id);
  if (Number(req.body.amount) > earnings.balance && !req.body.allow_overpay) {
    throw ApiError.badRequest(`Amount exceeds the tutor's unpaid balance (₹${earnings.balance}). Pass allow_overpay=true to override.`);
  }
  const status = req.body.status || 'pending';
  const payout = await TutorPayout.create({
    ...pick(req.body, ['amount', 'currency', 'period_start', 'period_end', 'payout_method', 'transaction_reference', 'note']),
    tutor_id: tutor.id,
    status,
    paid_at: status === 'paid' ? new Date() : null,
    created_by: req.user.id
  });
  await notifyUser(tutor.id, {
    title: status === 'paid' ? 'Payout sent' : 'Payout scheduled',
    message: `A payout of ₹${Number(payout.amount).toFixed(2)} has been ${status === 'paid' ? 'sent' : 'scheduled'}.`,
    type: 'tutor_payout',
    reference_type: 'tutor_payout',
    reference_id: payout.id
  });
  return successResponse(res, { statusCode: 201, message: 'Payout recorded.', data: { payout } });
};

/** PATCH /admin/payouts/:payoutId { status, transaction_reference, note } */
export const updatePayout = async (req, res) => {
  const payout = await TutorPayout.findByPk(req.params.payoutId);
  if (!payout) throw ApiError.notFound('Payout not found.');
  const data = pick(req.body, ['status', 'transaction_reference', 'note', 'payout_method']);
  if (data.status === 'paid' && payout.status !== 'paid') data.paid_at = new Date();
  await payout.update(data);
  if (data.status && data.status !== 'pending') {
    await notifyUser(payout.tutor_id, {
      title: 'Payout update',
      message: `Your payout of ₹${Number(payout.amount).toFixed(2)} is now ${data.status}.`,
      type: 'tutor_payout',
      reference_type: 'tutor_payout',
      reference_id: payout.id
    });
  }
  return successResponse(res, { message: 'Payout updated.', data: { payout } });
};

// Exposed for course filters in admin UI
export const listCourseOptions = async (req, res) => {
  const courses = await Course.findAll({ attributes: ['id', 'title', 'status'], order: [['title', 'ASC']] });
  return successResponse(res, { data: { courses } });
};

export default {
  listOrders,
  getOrder,
  updateOrderStatus,
  refundOrder,
  listPayments,
  getPayment,
  syncWooCommerceOrder,
  reconcileWooCommerce,
  createCourseProduct,
  syncCourseProducts,
  listCoupons,
  createCoupon,
  getCoupon,
  updateCoupon,
  updateCouponStatus,
  deleteCoupon,
  listPayouts,
  getTutorEarningsForAdmin,
  createPayout,
  updatePayout,
  listCourseOptions
};
