import { Payment } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { verifyWebhookSignature } from '../services/paymentService.js';
import { fulfillOrder, markPaymentFailed, applyOrderRefund } from '../services/orderService.js';
import { verifyWebhookSignature as verifyWooSignature, isTrustedSource } from '../services/woocommerceService.js';
import { syncOrder, syncDeletedOrder, syncOrderById } from '../services/woocommerceSyncService.js';
import { applyProductToCourse, markProductDeleted } from '../services/woocommerceProductService.js';
import { verifySiteSignature, syncSiteOrder } from '../services/atvSiteSyncService.js';

/**
 * POST /webhooks/atv-site
 * Server-to-server push from the antarikshtv.com checkout after a verified
 * Razorpay payment. Signed with X-ATV-Signature = hex HMAC-SHA256(raw body,
 * ATV_SITE_WEBHOOK_SECRET). Idempotent on order.id. Responds 2xx once the order
 * is applied, 4xx for requests that will never succeed (bad signature / payload
 * / unmapped course) and 5xx for transient failures so the website retries.
 */
export const atvSiteWebhook = async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
  if (!(await verifySiteSignature(raw, req.headers['x-atv-signature']))) throw ApiError.unauthorized('Invalid signature.');

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed JSON body.');
  }
  const result = await syncSiteOrder(payload, { trigger: 'webhook' });
  return res.status(200).json({ success: true, result });
};

/**
 * POST /webhooks/atv-site/poke   body: { "order_id": 123 }
 * "Instant sync": the antarikshtv.com plugin calls this the moment WooCommerce marks an order paid, so the student
 * gets the account / invoice emails right away instead of waiting for WooCommerce's queued webhook or the 10-minute
 * catch-up job (which stay in place as the safety net). The LMS pulls the order from WooCommerce itself, so the
 * request carries nothing but the id. Signed like /webhooks/atv-site: X-ATV-Signature = hex HMAC-SHA256(raw body,
 * ATV_SITE_WEBHOOK_SECRET). Idempotent: syncing an order that is already synced changes nothing.
 */
export const atvSitePoke = async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
  if (!(await verifySiteSignature(raw, req.headers['x-atv-signature']))) throw ApiError.unauthorized('Invalid signature.');
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed JSON body.');
  }
  const result = await syncOrderById(payload?.order_id, { trigger: 'poke' });
  return res.status(200).json({ success: true, result });
};

/**
 * POST /webhooks/razorpay
 * Configure in Razorpay Dashboard > Webhooks with events: payment.captured,
 * order.paid, payment.failed, refund.processed. Uses the raw body for HMAC
 * verification (see the express.raw mount in index.js). It makes enrollment
 * reliable even if the student closes the tab before /payments/verify runs.
 */
export const razorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!(await verifyWebhookSignature(raw, signature))) throw ApiError.unauthorized('Invalid webhook signature.');

  const event = JSON.parse(raw.toString('utf8'));
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id;

  const payment = gatewayOrderId ? await Payment.findOne({ where: { gateway_order_id: gatewayOrderId } }) : null;
  if (!payment) {
    // Not one of ours (or already cleaned up) - acknowledge so Razorpay stops retrying.
    return res.status(200).json({ success: true, ignored: true });
  }

  switch (event.event) {
    case 'payment.captured':
    case 'order.paid':
      await fulfillOrder(payment.order_id, {
        paymentId: payment.id,
        gatewayPaymentId: paymentEntity?.id || null,
        method: paymentEntity?.method || null,
        raw: paymentEntity || orderEntity
      });
      break;
    case 'payment.failed':
      await markPaymentFailed(payment, { raw: paymentEntity?.error_description ? { reason: paymentEntity.error_description, code: paymentEntity.error_code } : paymentEntity });
      break;
    case 'refund.processed':
      await applyOrderRefund(payment.order_id, { paymentId: payment.id, refund: event.payload?.refund?.entity || null });
      break;
    default:
      break;
  }
  return res.status(200).json({ success: true });
};

/**
 * POST /webhooks/woocommerce
 * WooCommerce > Settings > Advanced > Webhooks, delivery URL
 * https://<api-host>/api/v1/webhooks/woocommerce, API version v3, with the
 * shared secret, topics: Order created, Order updated, Order deleted, Order
 * restored, plus Product updated / Product deleted (price + publish status of
 * linked courses). Requests must carry a valid X-WC-Webhook-Signature (base64
 * HMAC-SHA256 of the raw body); enrollment is never granted any other way.
 */
export const woocommerceWebhook = async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
  const topic = String(req.headers['x-wc-webhook-topic'] || '');

  // Saving a webhook in WooCommerce sends an unsigned "webhook_id=<id>" ping; acknowledge it, do nothing.
  if (!topic && /^webhook_id=\d+$/.test(raw.toString('utf8').trim())) {
    return res.status(200).json({ success: true, ping: true });
  }

  if (!(await verifyWooSignature(raw, req.headers['x-wc-webhook-signature']))) throw ApiError.unauthorized('Invalid webhook signature.');
  if (!(await isTrustedSource(req.headers['x-wc-webhook-source']))) throw ApiError.forbidden('Webhook source does not match the configured store URL.');

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed JSON body.');
  }

  const [resource, event] = topic.split('.');

  // Product changes made in WordPress (price, sale, publish) flow back to the linked course.
  if (resource === 'product') {
    let product;
    if (event === 'deleted') product = await markProductDeleted(payload?.id);
    else if (['created', 'updated', 'restored'].includes(event)) product = await applyProductToCourse(payload);
    else product = { action: 'ignored' };
    return res.status(200).json({ success: true, result: product });
  }
  if (resource !== 'order') return res.status(200).json({ success: true, ignored: true, reason: `topic ${topic || 'missing'} is not handled` });

  let result;
  if (event === 'deleted') result = await syncDeletedOrder(payload?.id);
  else if (['created', 'updated', 'restored'].includes(event)) result = await syncOrder(payload, { trigger: `webhook:${event}` });
  else return res.status(200).json({ success: true, ignored: true, reason: `topic ${topic} is not handled` });

  // Only ids / statuses are returned (WooCommerce stores delivery responses in its logs).
  return res.status(200).json({ success: true, result });
};

export default { razorpayWebhook, woocommerceWebhook, atvSiteWebhook };
