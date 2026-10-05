'use client';

import { post } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

const loadScript = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout. Check your connection.')));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });

/**
 * Opens Razorpay Checkout for the `payment` object returned by
 * POST /student/checkout (or retry-payment), then verifies the signature on
 * the server. Resolves with the verify response; rejects when the payment
 * fails or the modal is dismissed (err.dismissed = true).
 */
export async function payWithRazorpay(payment) {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: payment.key_id,
      order_id: payment.razorpay_order_id,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      prefill: payment.prefill,
      theme: { color: '#1d4ed8' },
      handler: (response) => post(EP.student.verifyPayment, response).then(resolve, reject),
      modal: {
        ondismiss: () => reject(Object.assign(new Error('Payment cancelled.'), { dismissed: true }))
      }
    });
    rzp.on('payment.failed', (res) => {
      post(EP.student.paymentFailed, { razorpay_order_id: payment.razorpay_order_id, error: res.error }).catch(() => {});
      reject(new Error(res.error?.description || 'Payment failed.'));
    });
    rzp.open();
  });
}
