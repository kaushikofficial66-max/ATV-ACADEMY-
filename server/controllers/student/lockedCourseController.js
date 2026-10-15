import { successResponse } from '../../utils/apiResponse.js';
import { getLockedCourses, getLockedCourseOutline, startUnlockPayment } from '../../services/courseUnlockService.js';

/**
 * Locked courses (courses of the store plans the student has not bought).
 * Only students who bought a plan see anything here; everyone else gets an empty list.
 */

/** GET /student/locked-courses */
export const listLockedCourses = async (req, res) => {
  return successResponse(res, { data: await getLockedCourses(req.user) });
};

/** GET /student/locked-courses/:courseId - outline (module / lecture titles only) + how to buy it */
export const getLockedCourse = async (req, res) => {
  return successResponse(res, { data: await getLockedCourseOutline(req.user, req.params.courseId) });
};

/**
 * POST /student/locked-courses/:courseId/unlock
 * body { plan_id? }: the plan upgrade to buy (default: the cheapest one that opens this course).
 * Creates the upgrade order (price difference) and the Razorpay order.
 * Answer: { order, payment: { key_id, razorpay_order_id, amount, currency, prefill, ... } } - open Razorpay Checkout with
 * `payment`, then call POST /student/payments/verify with the handler result.
 */
export const unlockCourse = async (req, res) => {
  const result = await startUnlockPayment(req.user, req.params.courseId, req.body?.plan_id || null);
  return successResponse(res, {
    statusCode: 201,
    message: 'Order created. Complete the payment to unlock the course.',
    data: result
  });
};
