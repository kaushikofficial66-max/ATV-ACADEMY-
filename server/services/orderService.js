import { Op } from 'sequelize';
import {
  sequelize,
  Cart,
  CartItem,
  Course,
  Coupon,
  CouponUsage,
  Order,
  OrderItem,
  Payment,
  Enrollment,
  User
} from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { toMoney, generateOrderNumber } from '../utils/helpers.js';
import { effectivePrice } from './courseService.js';
import { enrollUser } from './enrollmentService.js';
import { getSetting } from './settingsService.js';
import { createGatewayOrder } from './paymentService.js';
import { notifyUser, notifyAdmins } from './notificationService.js';
import { isWooCommerceEnabled, getStoreUrl } from './woocommerceService.js';

const COURSE_CART_ATTRS = ['id', 'title', 'slug', 'thumbnail_url', 'price', 'discount_price', 'status', 'level'];

/** 409 used when WooCommerce owns purchases: the LMS must not take payments or coupons. */
export const storePurchaseError = async () => {
  let where = 'our store';
  try {
    where = new URL(await getStoreUrl()).hostname.replace(/^www\./, '');
  } catch {
    // store URL not configured - keep the generic wording
  }
  return ApiError.conflict(`Courses are purchased on ${where}. Use the Buy button on the course page; access appears here automatically after payment.`);
};

/** Blocks LMS cart / coupon / payment actions while WooCommerce handles commerce. */
export const assertLmsCheckoutAllowed = async () => {
  if (await isWooCommerceEnabled()) throw await storePurchaseError();
};

export const getOrCreateActiveCart = async (userId, transaction = null) => {
  const [cart] = await Cart.findOrCreate({
    where: { user_id: userId, status: 'active' },
    defaults: { user_id: userId, status: 'active' },
    transaction
  });
  return cart;
};

/**
 * Validates a coupon for a subtotal and returns { coupon, discount }.
 * Throws 4xx with a user-facing reason when the coupon cannot be used.
 */
export const validateCoupon = async (code, subtotal, { transaction = null, lock = false } = {}) => {
  if (!code) return { coupon: null, discount: 0 };
  const coupon = await Coupon.findOne({
    where: { code: String(code).trim().toUpperCase() },
    transaction,
    ...(lock && transaction && { lock: transaction.LOCK.UPDATE })
  });
  const now = new Date();
  if (!coupon || coupon.status !== 'active') throw ApiError.badRequest('Invalid or inactive coupon code.');
  if (new Date(coupon.start_at) > now) throw ApiError.badRequest('This coupon is not active yet.');
  if (new Date(coupon.expires_at) < now) throw ApiError.badRequest('This coupon has expired.');
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    throw ApiError.badRequest('This coupon has reached its usage limit.');
  }
  if (coupon.minimum_order_amount !== null && Number(subtotal) < Number(coupon.minimum_order_amount)) {
    throw ApiError.badRequest(`A minimum order of ₹${Number(coupon.minimum_order_amount).toFixed(2)} is required for this coupon.`);
  }

  let discount =
    coupon.discount_type === 'percentage'
      ? (Number(subtotal) * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  if (coupon.maximum_discount !== null && discount > Number(coupon.maximum_discount)) discount = Number(coupon.maximum_discount);
  discount = toMoney(Math.min(discount, Number(subtotal)));
  return { coupon, discount };
};

/** Computes totals for a list of courses (+ optional coupon). */
export const priceCourses = async (courses, couponCode = null, options = {}) => {
  const items = courses.map((course) => ({ course, price: toMoney(effectivePrice(course)) }));
  const subtotal = toMoney(items.reduce((sum, i) => sum + i.price, 0));
  const { coupon, discount } = await validateCoupon(couponCode, subtotal, options);
  const taxPercent = Number(await getSetting('tax_percent')) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = toMoney((taxable * taxPercent) / 100);
  const total = toMoney(taxable + tax);

  // Distribute the order discount across items proportionally to their price.
  let remaining = discount;
  const pricedItems = items.map((item, idx) => {
    let share = 0;
    if (discount > 0 && subtotal > 0) {
      share = idx === items.length - 1 ? remaining : toMoney((item.price / subtotal) * discount);
      remaining = toMoney(remaining - share);
    }
    return { ...item, discount: share, final: toMoney(item.price - share) };
  });

  return { items: pricedItems, subtotal, discount, tax_percent: taxPercent, tax, total, coupon };
};

/** Cart contents with live prices and totals for the student. */
export const getCartSummary = async (userId, couponCode = null) => {
  const cart = await getOrCreateActiveCart(userId);
  const items = await CartItem.findAll({
    where: { cart_id: cart.id },
    include: [{ model: Course, as: 'course', attributes: COURSE_CART_ATTRS }],
    order: [['created_at', 'ASC']]
  });

  // Keep stored cart prices in sync with current course pricing.
  for (const item of items) {
    const current = toMoney(effectivePrice(item.course));
    if (Number(item.price) !== current) await item.update({ price: current });
  }

  const purchasable = items.filter((i) => i.course && i.course.status === 'published');
  let pricing;
  let couponError = null;
  try {
    pricing = await priceCourses(purchasable.map((i) => i.course), couponCode);
  } catch (error) {
    if (!couponCode || !(error instanceof ApiError)) throw error;
    couponError = error.message;
    pricing = await priceCourses(purchasable.map((i) => i.course), null);
  }

  return {
    cart_id: cart.id,
    items: items.map((i) => ({
      id: i.id,
      course_id: i.course_id,
      price: Number(i.price),
      available: Boolean(i.course && i.course.status === 'published'),
      course: i.course
    })),
    item_count: items.length,
    subtotal: pricing.subtotal,
    discount_amount: pricing.discount,
    tax_percent: pricing.tax_percent,
    tax_amount: pricing.tax,
    total_amount: pricing.total,
    coupon: pricing.coupon ? { id: pricing.coupon.id, code: pricing.coupon.code, description: pricing.coupon.description } : null,
    coupon_error: couponError
  };
};

/**
 * Creates an order from the cart (or explicit course_ids for "Buy now").
 * Free orders are fulfilled immediately; paid orders get a Razorpay order.
 */
export const createCheckoutOrder = async (user, { courseIds = null, couponCode = null }) => {
  // With WooCommerce in charge only free enrollments go through the LMS.
  const storeOwnsCommerce = await isWooCommerceEnabled();
  if (storeOwnsCommerce && couponCode) throw await storePurchaseError();
  const storeError = storeOwnsCommerce ? await storePurchaseError() : null;

  const order = await sequelize.transaction(async (transaction) => {
    let courses;
    let cart = null;
    if (courseIds && courseIds.length) {
      courses = await Course.findAll({ where: { id: { [Op.in]: courseIds } }, transaction });
    } else {
      cart = await getOrCreateActiveCart(user.id, transaction);
      const cartItems = await CartItem.findAll({
        where: { cart_id: cart.id },
        include: [{ model: Course, as: 'course' }],
        transaction
      });
      courses = cartItems.map((i) => i.course).filter(Boolean);
    }
    if (!courses.length) throw ApiError.badRequest('Your cart is empty.');

    const unavailable = courses.filter((c) => c.status !== 'published');
    if (unavailable.length) {
      throw ApiError.badRequest(`These courses are not available for purchase: ${unavailable.map((c) => c.title).join(', ')}`);
    }
    const already = await Enrollment.findAll({
      where: { user_id: user.id, course_id: { [Op.in]: courses.map((c) => c.id) }, status: { [Op.in]: ['active', 'completed'] } },
      attributes: ['course_id'],
      transaction
    });
    if (already.length) {
      const ids = already.map((e) => e.course_id);
      throw ApiError.conflict(`You are already enrolled in: ${courses.filter((c) => ids.includes(c.id)).map((c) => c.title).join(', ')}`);
    }

    const pricing = await priceCourses(courses, couponCode, { transaction });
    if (storeError && pricing.total > 0) throw storeError;
    const currency = await getSetting('currency');

    const created = await Order.create(
      {
        user_id: user.id,
        order_number: generateOrderNumber(),
        subtotal: pricing.subtotal,
        discount_amount: pricing.discount,
        tax_amount: pricing.tax,
        total_amount: pricing.total,
        currency,
        coupon_id: pricing.coupon ? pricing.coupon.id : null,
        status: 'pending'
      },
      { transaction }
    );
    await OrderItem.bulkCreate(
      pricing.items.map((i) => ({
        order_id: created.id,
        course_id: i.course.id,
        course_title: i.course.title,
        price: i.price,
        discount_amount: i.discount,
        final_amount: i.final
      })),
      { transaction }
    );
    return created;
  });

  if (Number(order.total_amount) === 0) {
    await fulfillOrder(order.id, { gateway: 'free', method: 'free' });
    return { order: await getOrderDetails(order.id), is_free: true };
  }

  const gateway = await startGatewayPayment(order, user);
  return { order: await getOrderDetails(order.id), is_free: false, payment: gateway };
};

/** Creates (or re-creates for retries) the Razorpay order + payments row. */
export const startGatewayPayment = async (order, user) => {
  let gatewayOrder;
  let keyId;
  try {
    ({ order: gatewayOrder, keyId } = await createGatewayOrder({
      amount: order.total_amount,
      currency: order.currency,
      receipt: order.order_number,
      notes: { order_id: String(order.id), user_id: String(user.id) }
    }));
  } catch (error) {
    await order.update({ status: 'failed' });
    throw error;
  }

  const payment = await Payment.create({
    order_id: order.id,
    user_id: user.id,
    payment_gateway: 'razorpay',
    gateway_order_id: gatewayOrder.id,
    amount: order.total_amount,
    currency: order.currency,
    status: 'created',
    raw_response: { order: gatewayOrder }
  });
  if (order.status !== 'pending') await order.update({ status: 'pending' });

  return {
    payment_id: payment.id,
    gateway: 'razorpay',
    key_id: keyId,
    razorpay_order_id: gatewayOrder.id,
    amount: gatewayOrder.amount,
    currency: gatewayOrder.currency,
    name: await getSetting('site_name'),
    description: `Order ${order.order_number}`,
    prefill: { name: `${user.first_name} ${user.last_name || ''}`.trim(), email: user.email, contact: user.phone || '' }
  };
};

/**
 * Marks an order paid and grants access. Idempotent and safe to call from
 * both the checkout callback and the webhook (row-locked).
 */
export const fulfillOrder = async (orderId, { paymentId = null, gatewayOrderId = null, gatewayPaymentId = null, signature = null, method = null, raw = null, gateway = 'razorpay' } = {}) => {
  let newlyPaid = false;
  const result = await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw ApiError.notFound('Order not found.');
    if (order.status === 'paid') return order;
    if (['refunded', 'cancelled'].includes(order.status)) {
      throw ApiError.conflict(`Order is ${order.status} and cannot be fulfilled.`);
    }

    let payment = null;
    if (paymentId) payment = await Payment.findByPk(paymentId, { transaction });
    else if (gatewayOrderId) payment = await Payment.findOne({ where: { gateway_order_id: gatewayOrderId, order_id: order.id }, transaction });

    if (payment) {
      await payment.update(
        {
          status: 'success',
          gateway_payment_id: gatewayPaymentId || payment.gateway_payment_id,
          gateway_signature: signature || payment.gateway_signature,
          payment_method: method || payment.payment_method,
          paid_at: new Date(),
          ...(raw && { raw_response: { ...(payment.raw_response || {}), payment: raw } })
        },
        { transaction }
      );
    } else if (gateway === 'free') {
      await Payment.create(
        {
          order_id: order.id,
          user_id: order.user_id,
          payment_gateway: 'free',
          amount: 0,
          currency: order.currency,
          status: 'success',
          payment_method: 'free',
          paid_at: new Date()
        },
        { transaction }
      );
    }

    await order.update({ status: 'paid' }, { transaction });

    if (order.coupon_id) {
      const [, created] = await CouponUsage.findOrCreate({
        where: { coupon_id: order.coupon_id, order_id: order.id },
        defaults: { coupon_id: order.coupon_id, order_id: order.id, user_id: order.user_id, discount_amount: order.discount_amount },
        transaction
      });
      if (created) await Coupon.increment('usage_count', { by: 1, where: { id: order.coupon_id }, transaction });
    }

    const items = await OrderItem.findAll({ where: { order_id: order.id }, transaction });
    for (const item of items) {
      await enrollUser(order.user_id, item.course_id, { orderId: order.id, transaction, notify: false });
    }

    await Cart.update({ status: 'converted' }, { where: { user_id: order.user_id, status: 'active' }, transaction });
    newlyPaid = true;
    return order;
  });

  if (newlyPaid) {
    await notifyUser(result.user_id, {
      title: 'Payment successful',
      message: `Payment for order ${result.order_number} was successful. Your courses are now available in My Courses, and you have lifetime community access.`,
      type: 'order_paid',
      reference_type: 'order',
      reference_id: result.id
    });
    if (Number(result.total_amount) > 0) {
      const buyer = await User.findByPk(result.user_id, { attributes: ['first_name', 'last_name'] });
      await notifyAdmins({
        title: 'New order',
        message: `${buyer?.first_name || 'A student'} paid ₹${Number(result.total_amount).toFixed(2)} for order ${result.order_number}.`,
        type: 'admin_new_order',
        reference_type: 'order',
        reference_id: result.id
      });
    }
  }
  return result;
};

export const markPaymentFailed = async (payment, { reason = null, raw = null } = {}) => {
  if (!payment || payment.status === 'success') return;
  await payment.update({
    status: 'failed',
    ...(raw || reason ? { raw_response: { ...(payment.raw_response || {}), failure: raw || { reason } } } : {})
  });
  const order = await Order.findByPk(payment.order_id);
  if (order && order.status === 'pending') await order.update({ status: 'failed' });
};

/**
 * Cancels the active enrollments an order granted (optionally only some
 * courses). Completed enrollments are kept, as for refunds. A course the
 * student also holds through another paid order stays accessible, re-linked to
 * that order. Returns the number of enrollments that lost access.
 */
const cancelOrderEnrollments = async (order, { courseIds = null, transaction }) => {
  const enrollments = await Enrollment.findAll({
    where: {
      order_id: order.id,
      status: { [Op.in]: ['active', 'expired'] },
      ...(courseIds && { course_id: { [Op.in]: courseIds } })
    },
    transaction
  });
  let revoked = 0;
  for (const enrollment of enrollments) {
    const other = await OrderItem.findOne({
      where: { course_id: enrollment.course_id, order_id: { [Op.ne]: order.id } },
      include: [{ model: Order, as: 'order', attributes: ['id'], where: { user_id: order.user_id, status: 'paid' } }],
      transaction
    });
    if (other) {
      await enrollment.update({ order_id: other.order_id }, { transaction });
    } else {
      await enrollment.update({ status: 'cancelled' }, { transaction });
      revoked += 1;
    }
  }
  return revoked;
};

/**
 * Moves an order to refunded / cancelled / failed / pending and cancels the
 * enrollments it granted. Nothing is deleted. Idempotent. Used by admin
 * refunds, the Razorpay refund webhook and WooCommerce status sync.
 */
export const revokeOrderAccess = async (orderId, { status = 'refunded', paymentId = null, refund = null } = {}) => {
  const result = { changed: false, previous_status: null, revoked: 0 };
  await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.status === status) return;
    const wasPaid = order.status === 'paid';
    Object.assign(result, { changed: true, previous_status: order.status });
    await order.update({ status }, { transaction });

    if (status === 'refunded') {
      const paymentWhere = paymentId ? { id: paymentId } : { order_id: order.id, status: 'success' };
      const payments = await Payment.findAll({ where: paymentWhere, transaction });
      for (const p of payments) {
        await p.update(
          { status: 'refunded', ...(refund && { raw_response: { ...(p.raw_response || {}), refund } }) },
          { transaction }
        );
      }
    } else if (status !== 'pending') {
      await Payment.update({ status: 'failed' }, { where: { order_id: order.id, status: { [Op.in]: ['created', 'pending'] } }, transaction });
    }

    result.revoked = await cancelOrderEnrollments(order, { transaction });
    if (order.coupon_id && (wasPaid || status === 'refunded')) {
      const removed = await CouponUsage.destroy({ where: { coupon_id: order.coupon_id, order_id: order.id }, transaction });
      if (removed) await Coupon.decrement('usage_count', { by: 1, where: { id: order.coupon_id, usage_count: { [Op.gt]: 0 } }, transaction });
    }

    if (status === 'refunded' || result.revoked) {
      transaction.afterCommit(() =>
        notifyUser(order.user_id, {
          title: status === 'refunded' ? 'Order refunded' : 'Order updated',
          message:
            status === 'refunded'
              ? `Order ${order.order_number} has been refunded. Access to the purchased courses has been removed.`
              : `Order ${order.order_number} is now ${status === 'pending' ? 'on hold' : status}. Access to its courses has been removed until the order is paid.`,
          type: status === 'refunded' ? 'order_refunded' : 'order_updated',
          reference_type: 'order',
          reference_id: order.id
        })
      );
    }
  });
  return result;
};

/**
 * Marks an order refunded and cancels the enrollments it granted.
 * Called by the admin refund action and the refund.processed webhook.
 */
export const applyOrderRefund = async (orderId, { paymentId = null, refund = null } = {}) =>
  revokeOrderAccess(orderId, { status: 'refunded', paymentId, refund });

/** Revokes only some courses of a still-paid order (partial / line-item refund). */
export const revokeOrderCourses = async (orderId, courseIds) => {
  if (!courseIds.length) return 0;
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) return 0;
    const revoked = await cancelOrderEnrollments(order, { courseIds, transaction });
    if (revoked) {
      transaction.afterCommit(() =>
        notifyUser(order.user_id, {
          title: 'Order partially refunded',
          message: `Part of order ${order.order_number} was refunded. Access to the refunded course(s) has been removed.`,
          type: 'order_refunded',
          reference_type: 'order',
          reference_id: order.id
        })
      );
    }
    return revoked;
  });
};

export const getOrderDetails = async (orderId, where = {}) =>
  Order.findOne({
    where: { id: orderId, ...where },
    include: [
      { model: OrderItem, as: 'items', include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] }] },
      { model: Payment, as: 'payments', attributes: { exclude: ['raw_response', 'gateway_signature'] } },
      { model: Coupon, as: 'coupon', attributes: ['id', 'code', 'discount_type', 'discount_value'] }
    ],
    order: [[{ model: Payment, as: 'payments' }, 'created_at', 'DESC']]
  });

export default {
  getOrCreateActiveCart,
  validateCoupon,
  priceCourses,
  getCartSummary,
  createCheckoutOrder,
  startGatewayPayment,
  fulfillOrder,
  markPaymentFailed,
  revokeOrderAccess,
  applyOrderRefund,
  revokeOrderCourses,
  assertLmsCheckoutAllowed,
  getOrderDetails
};
