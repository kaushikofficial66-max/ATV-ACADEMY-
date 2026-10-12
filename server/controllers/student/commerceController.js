import { Op } from 'sequelize';
import {
  Wishlist,
  Course,
  Category,
  CartItem,
  Order,
  OrderItem,
  Payment,
  User
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination } from '../../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../../utils/serializers.js';
import { getAccessEnrollment } from '../../services/accessService.js';
import { decorateCourses, effectivePrice } from '../../services/courseService.js';
import {
  getOrCreateActiveCart,
  getCartSummary,
  validateCoupon,
  createCheckoutOrder,
  startGatewayPayment,
  fulfillOrder,
  markPaymentFailed,
  getOrderDetails,
  assertLmsCheckoutAllowed
} from '../../services/orderService.js';
import { verifyPaymentSignature, fetchGatewayPayment } from '../../services/paymentService.js';
import { buildOrderUrl } from '../../services/woocommerceService.js';
import { getPurchaseStatus } from '../../services/woocommerceSyncService.js';
import { toMoney } from '../../utils/helpers.js';

/** Internal sync bookkeeping that students do not need to see. */
const STUDENT_HIDDEN_ORDER_ATTRS = ['sync_note', 'woocommerce_modified_at'];

/** Store orders are managed on WooCommerce; students get a link to the store's order page. */
const presentOrder = async (order) => {
  const json = order.toJSON ? order.toJSON() : { ...order };
  STUDENT_HIDDEN_ORDER_ATTRS.forEach((key) => delete json[key]);
  json.store_order_url = json.source === 'woocommerce' ? await buildOrderUrl(json.woocommerce_order_id) : null;
  return json;
};

const assertLmsOrder = (order) => {
  if (order.source === 'woocommerce') {
    throw ApiError.badRequest('This order was placed on our store. Manage payments, cancellations and refunds there.');
  }
};

const findPurchasableCourse = async (courseId) => {
  const course = await Course.findByPk(courseId);
  if (!course || course.status !== 'published') throw ApiError.notFound('Course not found or not available.');
  return course;
};

// ==========================================================================
// Wishlist
// ==========================================================================

/** GET /student/wishlist */
export const getWishlist = async (req, res) => {
  const items = await Wishlist.findAll({
    where: { user_id: req.user.id },
    include: [
      {
        model: Course,
        as: 'course',
        attributes: ['id', 'title', 'slug', 'thumbnail_url', 'price', 'discount_price', 'level', 'status', 'short_description'],
        include: [
          { model: Category, as: 'category', attributes: ['id', 'name'] },
          { model: User, as: 'tutors', attributes: PUBLIC_USER_ATTRS, through: { attributes: [] } }
        ]
      }
    ],
    order: [['created_at', 'DESC']]
  });
  const courses = await decorateCourses(items.map((i) => i.course).filter(Boolean));
  return successResponse(res, {
    data: {
      wishlist: items.map((i) => ({ id: i.id, added_at: i.created_at, course: courses.find((c) => c.id === i.course_id) || null }))
    }
  });
};

/** POST /student/wishlist { course_id } */
export const addToWishlist = async (req, res) => {
  const course = await findPurchasableCourse(req.body.course_id);
  if (await getAccessEnrollment(req.user.id, course.id)) throw ApiError.conflict('You are already enrolled in this course.');
  const [item, created] = await Wishlist.findOrCreate({
    where: { user_id: req.user.id, course_id: course.id },
    defaults: { user_id: req.user.id, course_id: course.id }
  });
  return successResponse(res, {
    statusCode: created ? 201 : 200,
    message: created ? 'Added to wishlist.' : 'Course is already in your wishlist.',
    data: { item }
  });
};

/** DELETE /student/wishlist/:courseId */
export const removeFromWishlist = async (req, res) => {
  const removed = await Wishlist.destroy({ where: { user_id: req.user.id, course_id: req.params.courseId } });
  if (!removed) throw ApiError.notFound('Course is not in your wishlist.');
  return successResponse(res, { message: 'Removed from wishlist.' });
};

/** POST /student/wishlist/:courseId/move-to-cart */
export const moveWishlistToCart = async (req, res) => {
  await assertLmsCheckoutAllowed();
  const course = await findPurchasableCourse(req.params.courseId);
  if (await getAccessEnrollment(req.user.id, course.id)) throw ApiError.conflict('You are already enrolled in this course.');
  const cart = await getOrCreateActiveCart(req.user.id);
  await CartItem.findOrCreate({
    where: { cart_id: cart.id, course_id: course.id },
    defaults: { cart_id: cart.id, course_id: course.id, price: toMoney(effectivePrice(course)) }
  });
  await Wishlist.destroy({ where: { user_id: req.user.id, course_id: course.id } });
  return successResponse(res, { message: 'Moved to cart.', data: { cart: await getCartSummary(req.user.id) } });
};

// ==========================================================================
// Cart
// ==========================================================================

/** GET /student/cart?coupon_code= */
export const getCart = async (req, res) => {
  return successResponse(res, { data: { cart: await getCartSummary(req.user.id, req.query.coupon_code || null) } });
};

/** POST /student/cart { course_id } */
export const addToCart = async (req, res) => {
  await assertLmsCheckoutAllowed();
  const course = await findPurchasableCourse(req.body.course_id);
  if (await getAccessEnrollment(req.user.id, course.id)) throw ApiError.conflict('You are already enrolled in this course.');
  const cart = await getOrCreateActiveCart(req.user.id);
  const [, created] = await CartItem.findOrCreate({
    where: { cart_id: cart.id, course_id: course.id },
    defaults: { cart_id: cart.id, course_id: course.id, price: toMoney(effectivePrice(course)) }
  });
  return successResponse(res, {
    statusCode: created ? 201 : 200,
    message: created ? 'Course added to cart.' : 'Course is already in your cart.',
    data: { cart: await getCartSummary(req.user.id) }
  });
};

/** DELETE /student/cart/:courseId */
export const removeFromCart = async (req, res) => {
  const cart = await getOrCreateActiveCart(req.user.id);
  const removed = await CartItem.destroy({ where: { cart_id: cart.id, course_id: req.params.courseId } });
  if (!removed) throw ApiError.notFound('Course is not in your cart.');
  return successResponse(res, { message: 'Removed from cart.', data: { cart: await getCartSummary(req.user.id) } });
};

/** DELETE /student/cart - empty the cart. */
export const clearCart = async (req, res) => {
  const cart = await getOrCreateActiveCart(req.user.id);
  await CartItem.destroy({ where: { cart_id: cart.id } });
  return successResponse(res, { message: 'Cart cleared.', data: { cart: await getCartSummary(req.user.id) } });
};

/** POST /student/cart/move-to-wishlist/:courseId */
export const moveCartToWishlist = async (req, res) => {
  const cart = await getOrCreateActiveCart(req.user.id);
  const removed = await CartItem.destroy({ where: { cart_id: cart.id, course_id: req.params.courseId } });
  if (!removed) throw ApiError.notFound('Course is not in your cart.');
  await Wishlist.findOrCreate({
    where: { user_id: req.user.id, course_id: req.params.courseId },
    defaults: { user_id: req.user.id, course_id: req.params.courseId }
  });
  return successResponse(res, { message: 'Moved to wishlist.', data: { cart: await getCartSummary(req.user.id) } });
};

/**
 * POST /student/cart/apply-coupon { code, course_ids? }
 * Validates the coupon against the current cart (or the given courses for "Buy now").
 */
export const applyCoupon = async (req, res) => {
  // Coupons are validated only by WooCommerce when it handles commerce.
  await assertLmsCheckoutAllowed();
  if (Array.isArray(req.body.course_ids) && req.body.course_ids.length) {
    const courses = await Course.findAll({ where: { id: { [Op.in]: req.body.course_ids }, status: 'published' } });
    const subtotal = toMoney(courses.reduce((s, c) => s + effectivePrice(c), 0));
    const { coupon, discount } = await validateCoupon(req.body.code, subtotal);
    return successResponse(res, {
      message: 'Coupon applied.',
      data: { coupon: { id: coupon.id, code: coupon.code, description: coupon.description }, subtotal, discount_amount: discount }
    });
  }
  const summary = await getCartSummary(req.user.id, req.body.code);
  if (summary.coupon_error) throw ApiError.badRequest(summary.coupon_error);
  if (!summary.item_count) throw ApiError.badRequest('Your cart is empty.');
  return successResponse(res, { message: 'Coupon applied.', data: { cart: summary } });
};

// ==========================================================================
// Checkout & payment
// ==========================================================================

/**
 * POST /student/checkout { coupon_code?, course_ids? }
 * Creates the order. Free orders enroll immediately; paid orders return
 * Razorpay Checkout options (key_id, razorpay_order_id, amount in paise...).
 */
export const checkout = async (req, res) => {
  const result = await createCheckoutOrder(req.user, {
    courseIds: Array.isArray(req.body.course_ids) ? req.body.course_ids : null,
    couponCode: req.body.coupon_code || null
  });
  return successResponse(res, {
    statusCode: 201,
    message: result.is_free ? 'Order completed. You are now enrolled.' : 'Order created. Complete the payment to enroll.',
    data: result
  });
};

/**
 * POST /student/payments/verify
 * { razorpay_order_id, razorpay_payment_id, razorpay_signature } from Razorpay Checkout's handler.
 * The signature is mandatory and verified server-side before granting access.
 */
export const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const payment = await Payment.findOne({ where: { gateway_order_id: razorpay_order_id, user_id: req.user.id } });
  if (!payment) throw ApiError.notFound('Payment record not found.');

  const valid = await verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  if (!valid) {
    await markPaymentFailed(payment, { reason: 'signature_verification_failed' });
    throw ApiError.badRequest('Payment verification failed. If money was deducted it will be refunded automatically by the bank, or contact support.');
  }

  const gatewayPayment = await fetchGatewayPayment(razorpay_payment_id);
  const order = await fulfillOrder(payment.order_id, {
    paymentId: payment.id,
    gatewayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
    method: gatewayPayment?.method || null,
    raw: gatewayPayment
  });

  return successResponse(res, {
    message: 'Payment successful! You are now enrolled.',
    data: { order: await getOrderDetails(order.id, { user_id: req.user.id }) }
  });
};

/** POST /student/payments/failed { razorpay_order_id, error } - record a failed/abandoned payment. */
export const reportPaymentFailure = async (req, res) => {
  const payment = await Payment.findOne({ where: { gateway_order_id: req.body.razorpay_order_id, user_id: req.user.id } });
  if (!payment) throw ApiError.notFound('Payment record not found.');
  await markPaymentFailed(payment, { raw: req.body.error || { reason: 'client_reported_failure' } });
  return successResponse(res, { message: 'Payment marked as failed. You can retry from your orders.' });
};

/** POST /student/orders/:orderId/retry-payment - new Razorpay order for a pending/failed order. */
export const retryPayment = async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, user_id: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found.');
  assertLmsOrder(order);
  await assertLmsCheckoutAllowed();
  if (!['pending', 'failed'].includes(order.status)) throw ApiError.badRequest(`A ${order.status} order cannot be paid.`);

  const items = await OrderItem.findAll({ where: { order_id: order.id } });
  for (const item of items) {
    if (await getAccessEnrollment(req.user.id, item.course_id)) {
      throw ApiError.conflict(`You are already enrolled in "${item.course_title}". Please place a new order.`);
    }
  }
  const payment = await startGatewayPayment(order, req.user);
  return successResponse(res, { data: { order: await getOrderDetails(order.id), payment } });
};

/** POST /student/orders/:orderId/cancel - cancel an unpaid order. */
export const cancelOrder = async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, user_id: req.user.id } });
  if (!order) throw ApiError.notFound('Order not found.');
  assertLmsOrder(order);
  if (!['pending', 'failed'].includes(order.status)) throw ApiError.badRequest(`A ${order.status} order cannot be cancelled.`);
  await order.update({ status: 'cancelled' });
  await Payment.update({ status: 'failed' }, { where: { order_id: order.id, status: { [Op.in]: ['created', 'pending'] } } });
  return successResponse(res, { message: 'Order cancelled.' });
};

// ==========================================================================
// Orders
// ==========================================================================

/** GET /student/orders?status= - order history. */
export const listMyOrders = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { user_id: req.user.id };
  if (req.query.status) where.status = req.query.status;
  const { count, rows } = await Order.findAndCountAll({
    where,
    attributes: { exclude: STUDENT_HIDDEN_ORDER_ATTRS },
    include: [
      { model: OrderItem, as: 'items', include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] }] },
      { model: Payment, as: 'payments', attributes: ['id', 'status', 'payment_method', 'paid_at', 'amount', 'gateway_payment_id'] }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });
  return successResponse(res, { data: { orders: await Promise.all(rows.map(presentOrder)) }, meta: meta(count) });
};

/** GET /student/orders/:orderId - order details incl. payment status. */
export const getMyOrder = async (req, res) => {
  const order = await getOrderDetails(req.params.orderId, { user_id: req.user.id });
  if (!order) throw ApiError.notFound('Order not found.');
  const latestPayment = order.payments?.[0] || null;
  return successResponse(res, {
    data: {
      order: await presentOrder(order),
      payment_status: latestPayment ? latestPayment.status : order.status === 'paid' ? 'success' : 'not_started'
    }
  });
};

/**
 * GET /student/purchases/woocommerce/:wcOrderId
 * Status of a store purchase for the logged-in student ("processing" until the
 * WooCommerce order has been verified and synced). Never grants access itself.
 */
export const getStorePurchaseStatus = async (req, res) => {
  const { status, order } = await getPurchaseStatus(req.user, req.params.wcOrderId);
  return successResponse(res, {
    data: {
      status,
      order: order
        ? {
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            woocommerce_status: order.woocommerce_status,
            total_amount: order.total_amount,
            currency: order.currency,
            courses: (order.items || []).map((i) => ({ id: i.course_id, title: i.course_title }))
          }
        : null
    }
  });
};

export default {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveWishlistToCart,
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  moveCartToWishlist,
  applyCoupon,
  checkout,
  verifyPayment,
  reportPaymentFailure,
  retryPayment,
  cancelOrder,
  listMyOrders,
  getMyOrder,
  getStorePurchaseStatus
};
