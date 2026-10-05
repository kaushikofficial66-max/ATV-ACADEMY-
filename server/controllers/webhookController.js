import { Payment } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { verifyWebhookSignature } from '../services/paymentService.js';
import { fulfillOrder, markPaymentFailed, applyOrderRefund } from '../services/orderService.js';

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

export default { razorpayWebhook };
