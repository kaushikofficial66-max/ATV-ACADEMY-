import crypto from 'crypto';
import Razorpay from 'razorpay';
import { getGroupSettings } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

let client = null;
let clientKey = '';

const getClient = async () => {
  const cfg = await getGroupSettings('payment');
  if (!cfg.razorpay_key_id || !cfg.razorpay_key_secret) {
    throw new ApiError(503, 'Online payments are not configured. Please contact support.');
  }
  const key = `${cfg.razorpay_key_id}|${cfg.razorpay_key_secret}`;
  if (!client || key !== clientKey) {
    client = new Razorpay({ key_id: cfg.razorpay_key_id, key_secret: cfg.razorpay_key_secret });
    clientKey = key;
  }
  return { client, cfg };
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** Creates a Razorpay order. Amount is in rupees; Razorpay expects paise. */
export const createGatewayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  const { client: rzp, cfg } = await getClient();
  try {
    const order = await rzp.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: String(receipt).slice(0, 40),
      notes
    });
    return { order, keyId: cfg.razorpay_key_id };
  } catch (error) {
    const msg = error?.error?.description || error.message;
    throw new ApiError(502, `Payment gateway error: ${msg}`);
  }
};

/** Verifies the checkout handler signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export const verifyPaymentSignature = async ({ orderId, paymentId, signature }) => {
  const cfg = await getGroupSettings('payment');
  if (!cfg.razorpay_key_secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', cfg.razorpay_key_secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
};

/** Verifies X-Razorpay-Signature on webhooks using the raw request body. */
export const verifyWebhookSignature = async (rawBody, signature) => {
  const cfg = await getGroupSettings('payment');
  if (!cfg.razorpay_webhook_secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', cfg.razorpay_webhook_secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
};

/** Best-effort lookup (used to record the payment method); never throws. */
export const fetchGatewayPayment = async (paymentId) => {
  try {
    const { client: rzp } = await getClient();
    return await rzp.payments.fetch(paymentId);
  } catch {
    return null;
  }
};

export const refundGatewayPayment = async (paymentId, amount = null) => {
  const { client: rzp } = await getClient();
  try {
    return await rzp.payments.refund(paymentId, amount ? { amount: Math.round(Number(amount) * 100) } : {});
  } catch (error) {
    const msg = error?.error?.description || error.message;
    throw new ApiError(502, `Refund failed: ${msg}`);
  }
};

export default {
  createGatewayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchGatewayPayment,
  refundGatewayPayment
};
