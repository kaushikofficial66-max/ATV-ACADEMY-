/**
 * Razorpay Checkout in the browser.
 *
 *   await loadRazorpay();
 *   const response = await openRazorpay({ key, order_id, amount, ... });   // { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 *
 * The server verifies the signature (POST /student/payments/verify) before anything is unlocked.
 */
const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay needs a browser.'));
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        loading = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * Opens the payment window. Resolves with Razorpay's success response; rejects with an Error that has
 * `dismissed: true` when the student simply closed the window. `onFailed(error)` is called when a payment
 * attempt fails (the student can still retry inside the window).
 */
export function openRazorpay(options, { onFailed } = {}) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      ...options,
      handler: (response) => resolve(response),
      modal: {
        ...(options.modal || {}),
        ondismiss: () => reject(Object.assign(new Error('Payment window closed.'), { dismissed: true }))
      }
    });
    rzp.on('payment.failed', (event) => onFailed?.(event?.error || {}));
    rzp.open();
  });
}
