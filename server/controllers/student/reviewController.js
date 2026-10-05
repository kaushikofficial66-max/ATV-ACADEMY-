import { Op } from 'sequelize';
import { Review, Course, Enrollment } from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getSetting } from '../../services/settingsService.js';
import { getTutorIdsForCourse } from '../../services/courseService.js';
import { notifyUsers } from '../../services/notificationService.js';

/** GET /student/reviews - review history. */
export const listMyReviews = async (req, res) => {
  const reviews = await Review.findAll({
    where: { user_id: req.user.id },
    include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] }],
    order: [['updated_at', 'DESC']]
  });
  return successResponse(res, { data: { reviews } });
};

/** GET /student/courses/:courseId/review - the student's review for one course (if any). */
export const getMyCourseReview = async (req, res) => {
  const review = await Review.findOne({ where: { user_id: req.user.id, course_id: req.params.courseId } });
  return successResponse(res, { data: { review } });
};

/**
 * POST /student/courses/:courseId/review { rating (1-5), review }
 * Creates or updates the student's review. Enrolled students only; edits go
 * back to moderation unless auto-approval is enabled.
 */
export const upsertReview = async (req, res) => {
  const courseId = req.params.courseId;
  const enrollment = await Enrollment.findOne({
    where: { user_id: req.user.id, course_id: courseId, status: { [Op.in]: ['active', 'completed', 'expired'] } }
  });
  if (!enrollment) throw ApiError.forbidden('You can only review courses you are enrolled in.');

  const autoApprove = await getSetting('auto_approve_reviews');
  const status = autoApprove ? 'approved' : 'pending';
  const payload = { rating: Number(req.body.rating), review: req.body.review ? String(req.body.review).trim() : null, status, moderated_by: null, moderated_at: null };

  let review = await Review.findOne({ where: { user_id: req.user.id, course_id: courseId } });
  const created = !review;
  if (review) await review.update(payload);
  else review = await Review.create({ ...payload, course_id: courseId, user_id: req.user.id, enrollment_id: enrollment.id });

  if (created) {
    const course = await Course.findByPk(courseId, { attributes: ['title'] });
    await notifyUsers(await getTutorIdsForCourse(courseId), {
      title: 'New course review',
      message: `${req.user.first_name} rated "${course.title}" ${payload.rating}/5.`,
      type: 'course_review',
      reference_type: 'review',
      reference_id: review.id
    });
  }

  return successResponse(res, {
    statusCode: created ? 201 : 200,
    message: status === 'pending' ? 'Thanks! Your review will be visible after moderation.' : 'Thanks for your review!',
    data: { review }
  });
};

/** DELETE /student/courses/:courseId/review */
export const deleteMyReview = async (req, res) => {
  const removed = await Review.destroy({ where: { user_id: req.user.id, course_id: req.params.courseId } });
  if (!removed) throw ApiError.notFound('Review not found.');
  return successResponse(res, { message: 'Review deleted.' });
};

export default { listMyReviews, getMyCourseReview, upsertReview, deleteMyReview };
