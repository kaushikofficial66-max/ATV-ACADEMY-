import { Enrollment, CourseProgress, Course, Wishlist, CartItem, Cart } from '../models/index.js';
import { getCountableLectureIds } from './progressService.js';
import { notifyUser } from './notificationService.js';

/**
 * Enrolls a user in a course. Idempotent: an existing active/completed
 * enrollment is returned unchanged; a cancelled/expired one is reactivated.
 */
export const enrollUser = async (userId, courseId, { orderId = null, expiresAt = null, transaction = null, notify = true } = {}) => {
  let enrollment = await Enrollment.findOne({ where: { user_id: userId, course_id: courseId }, transaction });
  let created = false;

  if (enrollment) {
    if (['active', 'completed'].includes(enrollment.status)) return { enrollment, created: false };
    await enrollment.update(
      { status: 'active', order_id: orderId || enrollment.order_id, enrolled_at: new Date(), expires_at: expiresAt },
      { transaction }
    );
  } else {
    enrollment = await Enrollment.create(
      { user_id: userId, course_id: courseId, order_id: orderId, enrolled_at: new Date(), expires_at: expiresAt, status: 'active' },
      { transaction }
    );
    created = true;
  }

  const totalLectures = (await getCountableLectureIds(courseId)).length;
  await CourseProgress.findOrCreate({
    where: { enrollment_id: enrollment.id },
    defaults: { enrollment_id: enrollment.id, total_lectures: totalLectures },
    transaction
  });

  // Purchased courses no longer belong in the wishlist or active cart.
  await Wishlist.destroy({ where: { user_id: userId, course_id: courseId }, transaction });
  const cart = await Cart.findOne({ where: { user_id: userId, status: 'active' }, transaction });
  if (cart) await CartItem.destroy({ where: { cart_id: cart.id, course_id: courseId }, transaction });

  if (notify) {
    const run = async () => {
      const course = await Course.findByPk(courseId, { attributes: ['title'] });
      await notifyUser(userId, {
        title: 'Enrollment confirmed',
        message: `You are now enrolled in "${course?.title}". Start learning anytime - you also have lifetime community access.`,
        type: 'enrollment',
        reference_type: 'course',
        reference_id: courseId
      });
    };
    if (transaction) transaction.afterCommit(run);
    else await run();
  }

  return { enrollment, created };
};

export default { enrollUser };
