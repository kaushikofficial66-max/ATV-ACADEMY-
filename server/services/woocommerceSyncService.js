import bcrypt from 'bcryptjs';
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize, User, Role, UserProfile, PasswordReset, Course, Order, OrderItem, Payment, Enrollment } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { toMoney, randomToken, hashToken } from '../utils/helpers.js';
import { getSetting } from './settingsService.js';
import { fulfillOrder, revokeOrderAccess, revokeOrderCourses } from './orderService.js';
import { enrollUser } from './enrollmentService.js';
import { notifyAdmins } from './notificationService.js';
import { sendNotificationEmail } from './mailService.js';
import {
  WC_ORDER_STATUSES,
  getPaidStatuses,
  isApiConfigured,
  isWooCommerceEnabled,
  getOrder,
  getOrderRefunds,
  listOrders
} from './woocommerceService.js';

/**
 * WooCommerce -> LMS synchronisation. WooCommerce owns customers, orders,
 * payments, coupons and refunds; the LMS keeps a mirror of each order that
 * contains a mapped course (orders.source = 'woocommerce') so enrollments,
 * tutor earnings and reports keep working, and grants / revokes access through
 * the regular order + enrollment services.
 */

const LOG = '[WooCommerce Sync]';
const BCRYPT_ROUNDS = 12;
const SETUP_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** WooCommerce status -> LMS order status for orders that do not grant access. */
const UNPAID_STATUS_MAP = {
  pending: 'pending',
  'on-hold': 'pending',
  'checkout-draft': 'pending',
  failed: 'failed',
  cancelled: 'cancelled',
  trash: 'cancelled',
  refunded: 'refunded'
};

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/** WooCommerce *_gmt dates come without a zone ("2026-10-05T10:20:30"). */
const parseGmt = (value) => {
  if (!value) return null;
  const date = new Date(/(z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clip = (value, max) => {
  const str = String(value ?? '').trim();
  return str ? str.slice(0, max) : null;
};

/**
 * Validates the parts of a WooCommerce order payload (REST v3 shape, as sent by
 * order.* webhooks) the LMS relies on. Only learning-relevant fields are kept:
 * no addresses or other billing details beyond name / email / phone.
 */
export const parseWcOrder = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw ApiError.badRequest('Invalid WooCommerce order payload.');
  const id = positiveInt(payload.id);
  if (!id) throw ApiError.badRequest('WooCommerce order payload has no valid id.');
  const status = String(payload.status || '').toLowerCase();
  if (!WC_ORDER_STATUSES.includes(status)) throw ApiError.badRequest(`Unknown WooCommerce order status "${payload.status}".`);
  if (!Array.isArray(payload.line_items)) throw ApiError.badRequest('WooCommerce order payload has no line_items.');

  const billing = payload.billing && typeof payload.billing === 'object' ? payload.billing : {};
  const phone = String(billing.phone || '').replace(/[^\d+]/g, '');
  return {
    id,
    number: clip(payload.number, 80) || String(id),
    status,
    currency: (clip(payload.currency, 10) || 'INR').toUpperCase(),
    total: toMoney(payload.total),
    discountTotal: toMoney(payload.discount_total),
    totalTax: toMoney(payload.total_tax),
    customerId: positiveInt(payload.customer_id),
    email: normalizeEmail(billing.email),
    firstName: clip(billing.first_name, 100),
    lastName: clip(billing.last_name, 100),
    phone: phone.length >= 6 ? phone.slice(0, 20) : null,
    paymentMethod: clip(payload.payment_method, 50),
    paymentMethodTitle: clip(payload.payment_method_title, 100),
    transactionId: clip(payload.transaction_id, 255),
    createdAt: parseGmt(payload.date_created_gmt),
    paidAt: parseGmt(payload.date_paid_gmt),
    modifiedAt: parseGmt(payload.date_modified_gmt),
    couponCodes: clip(
      (Array.isArray(payload.coupon_lines) ? payload.coupon_lines : [])
        .map((c) => String(c?.code || '').trim().toUpperCase())
        .filter(Boolean)
        .join(', '),
      255
    ),
    hasRefunds: Array.isArray(payload.refunds) && payload.refunds.length > 0,
    lineItems: payload.line_items.map((li) => ({
      id: positiveInt(li?.id),
      productId: positiveInt(li?.product_id),
      variationId: positiveInt(li?.variation_id),
      quantity: Math.max(1, Math.trunc(Number(li?.quantity)) || 1),
      name: clip(li?.name, 255) || 'Course',
      subtotal: toMoney(li?.subtotal),
      total: toMoney(li?.total)
    }))
  };
};

/** Maps line items to LMS courses through courses.woocommerce_product_id (product or variation id). */
const resolveCourses = async (lineItems) => {
  const ids = [...new Set(lineItems.flatMap((li) => [li.productId, li.variationId]).filter(Boolean))];
  const courses = ids.length
    ? await Course.findAll({ where: { woocommerce_product_id: { [Op.in]: ids } }, attributes: ['id', 'title', 'woocommerce_product_id'] })
    : [];
  const byProduct = new Map(courses.map((c) => [Number(c.woocommerce_product_id), c]));
  const mapped = [];
  const unmapped = [];
  for (const line of lineItems) {
    const course = byProduct.get(line.productId) || byProduct.get(line.variationId);
    if (course) mapped.push({ line, course });
    else unmapped.push(line);
  }
  return { mapped, unmapped };
};

/** Retries a duplicate-key / deadlock race between concurrent deliveries of the same order. */
const withRaceRetry = async (fn, attempts = 3) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const deadlock = error?.parent?.code === 'ER_LOCK_DEADLOCK' || error?.original?.code === 'ER_LOCK_DEADLOCK';
      if (attempt >= attempts || !(error instanceof UniqueConstraintError || deadlock)) throw error;
    }
  }
};

/** Emails a new store customer a link to set their LMS password (reuses the reset flow). */
export const sendAccountSetupEmail = async (user) => {
  try {
    await PasswordReset.update({ used_at: new Date() }, { where: { user_id: user.id, used_at: null } });
    const token = randomToken();
    await PasswordReset.create({ user_id: user.id, token: hashToken(token), expires_at: new Date(Date.now() + SETUP_LINK_TTL_MS) });
    const frontendUrl = String(await getSetting('frontend_url')).split(',')[0].trim();
    await sendNotificationEmail(
      user,
      'Your learning account is ready',
      'Thank you for your purchase! An account has been created for you on our learning platform with this email address. Set a password to start learning (this link is valid for 7 days; afterwards use "Forgot password" on the login page).',
      `${frontendUrl}/reset-password?token=${token}`
    );
  } catch (error) {
    console.error(`${LOG} could not send account setup email to user ${user.id}: ${error.message}`);
  }
};

/**
 * Emails a student who ALREADY had an LMS account that the course(s) they just bought are ready
 * (new students get the account-setup email instead). Never throws.
 */
export const sendCourseReadyEmail = async (user, courseTitles = []) => {
  try {
    // Two webhooks for one payment can race: the other delivery just created this account and is
    // sending the set-password email, so a second "course ready" email would be a duplicate.
    const createdAt = new Date(user.createdAt || user.created_at || 0).getTime();
    if (createdAt && Date.now() - createdAt < 2 * 60 * 1000) return;
    const frontendUrl = String(await getSetting('frontend_url')).split(',')[0].trim();
    const list = courseTitles.filter(Boolean).join(', ') || 'your new course';
    await sendNotificationEmail(
      user,
      'Your course is ready',
      `Thank you for your purchase! You are now enrolled in: ${list}. Log in to your account to start learning. If you forgot your password, use "Forgot password" on the login page.`,
      `${frontendUrl}/login`
    );
  } catch (error) {
    console.error(`${LOG} could not send course-ready email to user ${user.id}: ${error.message}`);
  }
};

/**
 * Finds the LMS user for the order's billing email or creates a student
 * account. Never creates duplicates (email is unique; concurrent creation is
 * resolved by re-reading).
 */
export const syncCustomer = async (wcOrder) => {
  const email = wcOrder.email;
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('WooCommerce order has no valid billing email.');

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    if (!existing.woocommerce_customer_id && wcOrder.customerId) await existing.update({ woocommerce_customer_id: wcOrder.customerId });
    return { user: existing, created: false };
  }

  const role = await Role.findOne({ where: { name: 'student', status: 'active' } });
  if (!role) throw new ApiError(500, 'Role "student" is not configured. Run the database seed.');
  // users.phone is unique: only copy the billing phone when nobody uses it yet.
  const phoneFree = wcOrder.phone && !(await User.findOne({ where: { phone: wcOrder.phone }, attributes: ['id'] }));

  try {
    const user = await sequelize.transaction(async (transaction) => {
      const created = await User.create(
        {
          role_id: role.id,
          first_name: wcOrder.firstName || email.split('@')[0].slice(0, 100),
          last_name: wcOrder.lastName,
          email,
          phone: phoneFree ? wcOrder.phone : null,
          woocommerce_customer_id: wcOrder.customerId,
          // Unusable random password: the student sets one through the emailed link.
          password_hash: await bcrypt.hash(randomToken(32), BCRYPT_ROUNDS),
          status: 'active'
        },
        { transaction }
      );
      await UserProfile.create({ user_id: created.id }, { transaction });
      return created;
    });
    return { user, created: true };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const user = await User.findOne({ where: { email } });
      if (user) return { user, created: false };
    }
    throw error;
  }
};

/** Creates / updates the LMS mirror of the WooCommerce order, its course items and payment reference. */
const upsertMirror = (wcOrder, userId, mapped) =>
  withRaceRetry(() =>
    sequelize.transaction(async (transaction) => {
      const fields = {
        subtotal: toMoney(wcOrder.lineItems.reduce((s, li) => s + li.subtotal, 0)),
        discount_amount: wcOrder.discountTotal,
        tax_amount: wcOrder.totalTax,
        total_amount: wcOrder.total,
        currency: wcOrder.currency,
        coupon_codes: wcOrder.couponCodes,
        woocommerce_status: wcOrder.status,
        woocommerce_modified_at: wcOrder.modifiedAt
      };
      let order = await Order.findOne({ where: { woocommerce_order_id: wcOrder.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (order) {
        await order.update(fields, { transaction });
      } else {
        order = await Order.create(
          {
            ...fields,
            user_id: userId,
            order_number: `WC-${wcOrder.number}`,
            source: 'woocommerce',
            woocommerce_order_id: wcOrder.id,
            status: 'pending',
            ...(wcOrder.createdAt && { created_at: wcOrder.createdAt })
          },
          { transaction }
        );
      }

      // Only course lines are mirrored; they drive tutor earnings and course revenue.
      await OrderItem.destroy({ where: { order_id: order.id }, transaction });
      await OrderItem.bulkCreate(
        mapped.map(({ line, course }) => ({
          order_id: order.id,
          course_id: course.id,
          course_title: course.title,
          price: line.subtotal,
          discount_amount: toMoney(Math.max(0, line.subtotal - line.total)),
          final_amount: line.total
        })),
        { transaction }
      );

      const paymentFields = {
        gateway_order_id: String(wcOrder.id),
        gateway_payment_id: wcOrder.transactionId,
        amount: wcOrder.total,
        currency: wcOrder.currency,
        payment_method: wcOrder.paymentMethod
      };
      let payment = await Payment.findOne({ where: { order_id: order.id, payment_gateway: 'woocommerce' }, transaction });
      if (payment) {
        await payment.update(paymentFields, { transaction });
      } else {
        payment = await Payment.create(
          {
            ...paymentFields,
            order_id: order.id,
            user_id: order.user_id,
            payment_gateway: 'woocommerce',
            status: 'created',
            // Reference only - the payment itself is processed and stored by WooCommerce.
            raw_response: { source: 'woocommerce', payment_method_title: wcOrder.paymentMethodTitle }
          },
          { transaction }
        );
      }
      return { order, payment };
    })
  );

/**
 * Partial refunds keep the order "completed" on WooCommerce. Courses whose line
 * item was fully refunded (by quantity or amount) lose access; the rest stay.
 */
const syncLineRefunds = async (order, wcOrder, mapped) => {
  if (!(await isApiConfigured())) {
    console.warn(`${LOG} order=${wcOrder.id} has refunds but the REST API is not configured - refunded courses were not revoked`);
    return 'Partial refund on WooCommerce: add REST API keys so refunded courses are revoked automatically.';
  }
  try {
    const refunds = await getOrderRefunds(wcOrder.id);
    const refunded = new Map();
    for (const refund of refunds) {
      for (const li of refund.line_items || []) {
        const key = positiveInt(li.variation_id) || positiveInt(li.product_id);
        if (!key) continue;
        const prev = refunded.get(key) || { qty: 0, amount: 0 };
        refunded.set(key, { qty: prev.qty + Math.abs(Number(li.quantity) || 0), amount: toMoney(prev.amount + Math.abs(Number(li.total) || 0)) });
      }
    }
    const courseIds = mapped
      .filter(({ line }) => {
        const r = refunded.get(line.variationId) || refunded.get(line.productId);
        return r && (r.qty >= line.quantity || (line.total > 0 && r.amount >= line.total - 0.01));
      })
      .map(({ course }) => course.id);
    const revoked = await revokeOrderCourses(order.id, courseIds);
    if (revoked) console.log(`${LOG} order=${wcOrder.id} partial refund: revoked courses=${courseIds.join(',')}`);
    return courseIds.length ? `Partially refunded: access removed for course(s) ${courseIds.join(', ')}.` : null;
  } catch (error) {
    console.error(`${LOG} order=${wcOrder.id} partial refund lookup failed: ${error.message}`);
    return `Partial refund could not be checked (${error.message.slice(0, 150)}). Use Resync to retry.`;
  }
};

/**
 * Applies a WooCommerce order (webhook payload or REST API response) to the LMS.
 * Idempotent: the same payload any number of times yields one user, one mirror
 * order, one payment reference and at most one enrollment per course. Payloads
 * older than the last applied one are ignored.
 */
export const syncOrder = async (payload, { trigger = 'webhook' } = {}) => {
  const wcOrder = parseWcOrder(payload);
  const isPaid = (await getPaidStatuses()).includes(wcOrder.status);
  const existing = await Order.findOne({ where: { woocommerce_order_id: wcOrder.id } });
  const summary = { woocommerce_order_id: wcOrder.id, status: wcOrder.status, trigger };
  const log = (result, extra = '') =>
    console.log(
      `${LOG} order=${wcOrder.id} status=${wcOrder.status} customer=${wcOrder.email || '-'} ` +
        `products=${wcOrder.lineItems.map((l) => l.productId).join(',') || '-'} trigger=${trigger} result=${result}${extra}`
    );

  if (existing?.woocommerce_modified_at && wcOrder.modifiedAt && wcOrder.modifiedAt < new Date(existing.woocommerce_modified_at)) {
    log('stale_ignored');
    return { ...summary, action: 'stale', order_id: existing.id };
  }

  const { mapped, unmapped } = await resolveCourses(wcOrder.lineItems);
  if (!existing && !mapped.length) {
    log('ignored', ' reason=no_mapped_course');
    return { ...summary, action: 'ignored', reason: 'no_mapped_course' };
  }
  if (!existing && !isPaid) {
    // Unpaid orders stay WooCommerce-only until payment (no LMS account for abandoned checkouts).
    log('ignored', ' reason=not_paid');
    return { ...summary, action: 'ignored', reason: 'not_paid' };
  }

  let user;
  let userCreated = false;
  if (existing) {
    user = await User.findByPk(existing.user_id);
  } else {
    if (!EMAIL_RE.test(wcOrder.email)) {
      log('error', ' reason=missing_email');
      await notifyAdmins({
        title: 'WooCommerce order needs attention',
        message: `Paid WooCommerce order #${wcOrder.number} has no valid billing email, so no student could be enrolled. Fix the order email in WooCommerce, then use Resync.`,
        type: 'admin_woocommerce_sync',
        reference_type: 'woocommerce_order',
        reference_id: wcOrder.id
      });
      return { ...summary, action: 'error', reason: 'missing_email' };
    }
    ({ user, created: userCreated } = await syncCustomer(wcOrder));
  }

  const notes = [];
  if (unmapped.length) notes.push(`Not linked to a course: product(s) ${unmapped.map((l) => l.productId || l.name).join(', ')}.`);
  if (mapped.some(({ line }) => line.quantity > 1)) notes.push('Quantity above 1: the buyer is enrolled once per course.');

  const { order, payment } = await upsertMirror(wcOrder, user.id, mapped);
  let action;

  if (isPaid) {
    const wasPaid = order.status === 'paid';
    if (['cancelled', 'failed', 'refunded'].includes(order.status)) await order.update({ status: 'pending' }); // re-opened on the store
    await fulfillOrder(order.id, {
      paymentId: payment.id,
      gatewayPaymentId: wcOrder.transactionId,
      method: wcOrder.paymentMethod,
      gateway: 'woocommerce'
    });
    if (wcOrder.paidAt && !wasPaid) await payment.update({ paid_at: wcOrder.paidAt });
    if (wasPaid) {
      // Courses mapped after payment (or added to the order later): enroll where no enrollment exists yet.
      for (const { course } of mapped) {
        if (!(await Enrollment.findOne({ where: { user_id: order.user_id, course_id: course.id }, attributes: ['id'] }))) {
          await enrollUser(order.user_id, course.id, { orderId: order.id });
        }
      }
    }
    if (wcOrder.hasRefunds) {
      const note = await syncLineRefunds(order, wcOrder, mapped);
      if (note) notes.push(note);
    }
    action = wasPaid ? 'already_paid' : 'enrolled';
  } else {
    const status = UNPAID_STATUS_MAP[wcOrder.status] || 'pending';
    const result = await revokeOrderAccess(order.id, { status, refund: status === 'refunded' ? { source: 'woocommerce', trigger } : null });
    action = result.changed ? `${status}${result.revoked ? '_access_revoked' : ''}` : 'unchanged';
  }

  await order.update({ sync_note: notes.length ? notes.join(' ').slice(0, 500) : null });
  if (userCreated) await sendAccountSetupEmail(user);
  else if (action === 'enrolled') await sendCourseReadyEmail(user, mapped.map((m) => m.course.title));

  log(action, ` lms_order=${order.id} user=${user.id}${userCreated ? '(created)' : ''} courses=${mapped.map((m) => m.course.id).join(',') || '-'}`);
  return { ...summary, action, order_id: order.id, user_id: user.id, user_created: userCreated, course_ids: mapped.map((m) => m.course.id) };
};

/** order.deleted (trashed / deleted on the store): access granted by the order is revoked. */
export const syncDeletedOrder = async (wcOrderId) => {
  const id = positiveInt(wcOrderId);
  if (!id) throw ApiError.badRequest('WooCommerce order payload has no valid id.');
  const order = await Order.findOne({ where: { woocommerce_order_id: id } });
  if (!order) {
    console.log(`${LOG} order=${id} deleted - not mirrored, ignored`);
    return { woocommerce_order_id: id, action: 'ignored' };
  }
  const result = await revokeOrderAccess(order.id, { status: 'cancelled' });
  await order.update({ woocommerce_status: 'trash' });
  console.log(`${LOG} order=${id} deleted on store lms_order=${order.id} revoked=${result.revoked}`);
  return { woocommerce_order_id: id, action: result.changed ? 'cancelled' : 'unchanged', order_id: order.id };
};

/** Pulls one order from the WooCommerce REST API and syncs it (admin "Resync", purchase status page). */
export const syncOrderById = async (wcOrderId, { trigger = 'api' } = {}) => {
  const id = positiveInt(wcOrderId);
  if (!id) throw ApiError.badRequest('Invalid WooCommerce order id.');
  let payload;
  try {
    payload = await getOrder(id);
  } catch (error) {
    // Deleted on the store: mirror the deletion.
    if (error.statusCode === 404) return syncDeletedOrder(id);
    throw error;
  }
  return syncOrder(payload, { trigger });
};

let lastReconciledAt = null;
const RECONCILE_OVERLAP_MS = 10 * 60 * 1000;
const RECONCILE_INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RECONCILE_MAX_PAGES = 20;

/**
 * Safety net for missed webhooks (WooCommerce does not retry failed deliveries
 * and disables a webhook after repeated failures): re-syncs every order
 * modified since the previous run.
 */
export const reconcileRecentOrders = async ({ since = null } = {}) => {
  if (!(await isWooCommerceEnabled()) || !(await getSetting('woocommerce_reconcile_enabled')) || !(await isApiConfigured())) {
    return { skipped: true };
  }
  const startedAt = new Date();
  const from = since || (lastReconciledAt ? new Date(lastReconciledAt.getTime() - RECONCILE_OVERLAP_MS) : new Date(Date.now() - RECONCILE_INITIAL_LOOKBACK_MS));
  const counts = { checked: 0, synced: 0, ignored: 0, failed: 0 };
  for (let page = 1; page <= RECONCILE_MAX_PAGES; page += 1) {
    const { orders, totalPages } = await listOrders({ modifiedAfter: from, page });
    for (const payload of orders) {
      counts.checked += 1;
      try {
        const result = await syncOrder(payload, { trigger: 'reconcile' });
        if (['ignored', 'stale', 'unchanged', 'already_paid'].includes(result.action)) counts.ignored += 1;
        else counts.synced += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(`${LOG} reconcile order=${payload?.id} failed: ${error.message}`);
      }
    }
    if (page >= totalPages) break;
  }
  // Only advance the window when every order was processed, so failures are retried next run.
  if (!counts.failed) lastReconciledAt = startedAt;
  if (counts.synced || counts.failed) console.log(`${LOG} reconcile since=${from.toISOString()} ${JSON.stringify(counts)}`);
  return counts;
};

const statusPulls = new Map();
const STATUS_PULL_INTERVAL_MS = 15 * 1000;

/** At most one REST pull per order and per student every 15 seconds. */
const mayPull = (orderId, userId) => {
  const now = Date.now();
  const keys = [`o${orderId}`, `u${userId}`];
  if (keys.some((k) => now - (statusPulls.get(k) || 0) < STATUS_PULL_INTERVAL_MS)) return false;
  if (statusPulls.size > 5000) statusPulls.clear();
  keys.forEach((k) => statusPulls.set(k, now));
  return true;
};

/**
 * Student-facing purchase status after returning from the store's thank-you
 * page. Access is only ever granted by data from WooCommerce itself: if the
 * webhook has not arrived yet, the order is pulled from the REST API
 * (throttled), never trusted from the browser.
 */
export const getPurchaseStatus = async (user, wcOrderId) => {
  const id = positiveInt(wcOrderId);
  if (!id) throw ApiError.badRequest('Invalid order number.');
  const find = () =>
    Order.findOne({
      where: { woocommerce_order_id: id, user_id: user.id },
      attributes: ['id', 'order_number', 'status', 'woocommerce_status', 'total_amount', 'currency'],
      include: [{ model: OrderItem, as: 'items', attributes: ['course_id', 'course_title'] }]
    });

  let order = await find();
  if ((!order || order.status !== 'paid') && (await isApiConfigured()) && mayPull(id, user.id)) {
    try {
      await syncOrderById(id, { trigger: 'status_check' });
      order = await find();
    } catch (error) {
      console.warn(`${LOG} status check pull for order=${id} failed: ${error.message}`);
    }
  }
  if (!order) return { status: 'processing', order: null };
  return { status: order.status, order };
};

export default {
  parseWcOrder,
  normalizeEmail,
  syncCustomer,
  syncOrder,
  syncDeletedOrder,
  syncOrderById,
  reconcileRecentOrders,
  getPurchaseStatus
};
