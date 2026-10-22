import crypto from 'crypto';
import { UniqueConstraintError, Op } from 'sequelize';
import { sequelize, Course, Order, OrderItem, Payment, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { toMoney } from '../utils/helpers.js';
import { getSetting } from './settingsService.js';
import { fulfillOrder } from './orderService.js';
import { syncCustomer, sendAccountSetupEmail, sendCourseReadyEmail, normalizeEmail } from './woocommerceSyncService.js';
import { notifyAdmins } from './notificationService.js';
import { issueAndSendInvoice } from './invoiceService.js';

/**
 * antarikshtv.com -> LMS. The marketing website takes the Razorpay payment
 * itself and stores its own order / payment rows; once a payment is verified it
 * pushes the paid order here. The LMS mirrors it (orders.source = 'website'),
 * creates the student when the email is new, enrolls them and emails the
 * set-password link (the same reset flow the WooCommerce sync uses).
 */

const LOG = '[ATV Site Sync]';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clip = (value, max) => {
  const str = String(value ?? '').trim();
  return str ? str.slice(0, max) : null;
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** X-ATV-Signature: hex(HMAC-SHA256(raw body, ATV_SITE_WEBHOOK_SECRET)). False when no secret is configured. */
export const verifySiteSignature = async (rawBody, signature) => {
  const secret = await getSetting('atv_site_webhook_secret');
  if (!secret || !signature || !rawBody || !rawBody.length) return false;
  return safeEqual(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), String(signature).trim().toLowerCase());
};

/** Validates the payload and keeps only the fields the LMS needs. */
export const parseSiteOrder = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw ApiError.badRequest('Invalid payload.');
  const order = payload.order || {};
  const customer = payload.customer || {};

  const externalId = clip(order.id, 64);
  if (!externalId) throw ApiError.badRequest('order.id is required.');
  if (String(order.status || '').toLowerCase() !== 'paid') throw ApiError.badRequest('Only paid orders are accepted.');

  const amount = toMoney(order.amount);
  if (!(amount > 0)) throw ApiError.badRequest('order.amount must be greater than zero.');

  const email = normalizeEmail(customer.email);
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('customer.email is not a valid email address.');

  const courseIds = [...new Set((Array.isArray(payload.course_ids) ? payload.course_ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!courseIds.length) throw ApiError.unprocessable('No LMS course is linked to this plan. Set the plan -> course id mapping on the website.');

  const phone = String(customer.phone || '').replace(/[^\d+]/g, '');
  const paidAt = order.paid_at ? new Date(order.paid_at) : null;
  return {
    externalId,
    number: clip(order.number, 80) || externalId,
    plan: clip(order.plan, 50),
    amount,
    currency: (clip(order.currency, 10) || 'INR').toUpperCase(),
    razorpayOrderId: clip(order.razorpay_order_id, 255),
    razorpayPaymentId: clip(order.razorpay_payment_id, 255),
    method: clip(order.method, 50),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    courseIds,
    customer: {
      email,
      firstName: clip(customer.first_name, 100),
      lastName: clip(customer.last_name, 100),
      phone: phone.length >= 6 ? phone.slice(0, 20) : null,
      customerId: null
    }
  };
};

/** Splits the paid amount over the courses (cents-exact; the remainder lands on the last line). */
const splitAmount = (amount, count) => {
  const base = Math.floor((amount * 100) / count) / 100;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? toMoney(amount - base * (count - 1)) : base));
};

const createMirror = (site, userId, courses) =>
  sequelize.transaction(async (transaction) => {
    const order = await Order.create(
      {
        user_id: userId,
        order_number: `WEB-${site.number}`.slice(0, 100),
        source: 'website',
        external_order_id: site.externalId,
        subtotal: site.amount,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: site.amount,
        currency: site.currency,
        status: 'pending',
        sync_note: site.plan ? `Website plan: ${site.plan}` : null
      },
      { transaction }
    );
    const parts = splitAmount(site.amount, courses.length);
    await OrderItem.bulkCreate(
      courses.map((course, i) => ({
        order_id: order.id,
        course_id: course.id,
        course_title: course.title,
        price: parts[i],
        discount_amount: 0,
        final_amount: parts[i]
      })),
      { transaction }
    );
    const payment = await Payment.create(
      {
        order_id: order.id,
        user_id: userId,
        payment_gateway: 'razorpay',
        gateway_order_id: site.razorpayOrderId,
        gateway_payment_id: site.razorpayPaymentId,
        amount: site.amount,
        currency: site.currency,
        payment_method: site.method,
        status: 'created',
        raw_response: { source: 'atv-site', plan: site.plan }
      },
      { transaction }
    );
    return { order, payment };
  });

/**
 * Applies a paid website order. Idempotent: the same external order id any
 * number of times yields one order, one payment and one enrollment per course.
 */
export const syncSiteOrder = async (payload, { trigger = 'webhook' } = {}) => {
  const site = parseSiteOrder(payload);
  const summary = { external_order_id: site.externalId, trigger };

  const existing = await Order.findOne({ where: { external_order_id: site.externalId } });
  if (existing?.status === 'paid') {
    console.log(`${LOG} order=${site.externalId} already_synced lms_order=${existing.id}`);
    return { ...summary, action: 'already_synced', order_id: existing.id, user_id: existing.user_id };
  }

  const courses = await Course.findAll({ where: { id: { [Op.in]: site.courseIds } }, attributes: ['id', 'title'] });
  if (courses.length !== site.courseIds.length) {
    const missing = site.courseIds.filter((id) => !courses.some((c) => c.id === id));
    await notifyAdmins({
      title: 'Website order needs attention',
      message: `Paid website order ${site.number} (${site.customer.email}) points at unknown LMS course id(s) ${missing.join(', ')}. Fix the plan -> course mapping on antarikshtv.com, then resync the order.`,
      type: 'admin_website_sync',
      reference_type: 'website_order',
      reference_id: null
    });
    throw ApiError.unprocessable(`Unknown LMS course id(s): ${missing.join(', ')}.`);
  }

  let order = existing;
  let payment = null;
  let user;
  let userCreated = false;
  if (existing) {
    // A previous attempt stopped after mirroring but before fulfilling: finish it.
    payment = await Payment.findOne({ where: { order_id: existing.id, payment_gateway: 'razorpay' } });
  } else {
    ({ user, created: userCreated } = await syncCustomer(site.customer));
    try {
      ({ order, payment } = await createMirror(site, user.id, courses));
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      // A concurrent delivery created it first.
      order = await Order.findOne({ where: { external_order_id: site.externalId } });
      if (!order) throw error;
      payment = await Payment.findOne({ where: { order_id: order.id, payment_gateway: 'razorpay' } });
      userCreated = false;
    }
  }

  await fulfillOrder(order.id, {
    paymentId: payment?.id || null,
    gatewayPaymentId: site.razorpayPaymentId,
    method: site.method,
    gateway: 'razorpay'
  });
  if (site.paidAt && payment) await payment.update({ paid_at: site.paidAt });

  if (userCreated) {
    await sendAccountSetupEmail(user);
  } else {
    const buyer = user || (await User.findByPk(order.user_id));
    if (buyer) await sendCourseReadyEmail(buyer, courses.map((c) => c.title));
  }

  await issueAndSendInvoice(order.id);

  console.log(`${LOG} order=${site.externalId} enrolled lms_order=${order.id} user=${order.user_id}${userCreated ? '(created)' : ''} courses=${site.courseIds.join(',')}`);
  return { ...summary, action: 'enrolled', order_id: order.id, user_id: order.user_id, user_created: userCreated, course_ids: site.courseIds };
};

export default { verifySiteSignature, parseSiteOrder, syncSiteOrder };
