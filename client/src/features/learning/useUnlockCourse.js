'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { post, getErrorMessage } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';
import { loadRazorpay, openRazorpay } from '@/lib/razorpay';

/**
 * Buys the plan upgrade that opens a locked course (the student pays the price difference):
 *   1. POST /student/locked-courses/:id/unlock  -> order + Razorpay order
 *   2. Razorpay Checkout window
 *   3. POST /student/payments/verify            -> the server checks the signature, then enrols the student
 * Resolves true when the course is unlocked, false when the student closed the window or something failed
 * (the reason is shown as a toast).
 */
export function useUnlockCourse() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const unlock = async (courseId, planId = null) => {
    if (busy) return false;
    setBusy(true);
    let razorpayOrderId = null;
    try {
      const created = await post(EP.student.unlockCourse(courseId), planId ? { plan_id: planId } : {});
      const pay = created.data.payment;
      razorpayOrderId = pay.razorpay_order_id;
      await loadRazorpay();
      const response = await openRazorpay(
        {
          key: pay.key_id,
          order_id: pay.razorpay_order_id,
          amount: pay.amount,
          currency: pay.currency,
          name: pay.name || 'ATV Academy',
          description: pay.description,
          prefill: pay.prefill,
          theme: { color: '#5b21b6' }
        },
        { onFailed: (error) => post(EP.student.paymentFailed, { razorpay_order_id: razorpayOrderId, error }).catch(() => {}) }
      );
      const verified = await post(EP.student.verifyPayment, {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature
      });
      toast.success(verified.message || 'Payment successful! Your new courses are unlocked.');
      // Everything that lists courses must show the new enrolment and drop the lock.
      await queryClient.invalidateQueries({ queryKey: ['student'] });
      return true;
    } catch (error) {
      if (error?.dismissed) {
        toast.info('Payment cancelled. You can try again any time.');
      } else {
        toast.error(getErrorMessage(error, 'The payment could not be completed. If money was deducted it will be refunded automatically.'));
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { unlock, busy };
}
