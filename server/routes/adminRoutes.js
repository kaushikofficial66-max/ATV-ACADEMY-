import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadImage } from '../middlewares/upload.js';
import { validate, validateIdParams } from '../middlewares/validate.js';
import { v } from './validators.js';
import * as users from '../controllers/admin/adminUserController.js';
import * as courses from '../controllers/admin/adminCourseController.js';
import * as commerce from '../controllers/admin/adminCommerceController.js';
import * as content from '../controllers/admin/adminContentController.js';
import { revokeCertificate, generateCertificate } from '../controllers/shared/certificateManageController.js';
import { buildManagementRouter } from './managementRoutes.js';

const router = express.Router();
router.use(authenticate, authorize('admin'));
const id = validateIdParams;

// Dashboard
router.get('/dashboard', users.getDashboard);

// Users (shared actions)
router.post('/users', validate(v.createUser), users.createUser);
router.put('/users/:userId', id, users.updateUser);
router.patch('/users/:userId/status', id, validate(v.userStatus), users.updateUserStatus);
router.post('/users/:userId/send-password-reset', id, users.sendUserPasswordReset);
router.post('/users/:userId/impersonate', id, users.impersonateUser);

// Student management
router.get('/students', users.listStudents);
router.get('/students/:studentId', id, users.getStudentDetails);
router.patch('/students/:studentId/status', id, validate(v.userStatus), (req, res) => {
  req.params.userId = req.params.studentId;
  return users.updateUserStatus(req, res);
});
router.post('/students/:studentId/enrollments', id, validate(v.courseIdBody), users.enrollStudent);

// Tutor management
router.get('/tutors', users.listTutors);
router.get('/tutors/:tutorId', id, users.getTutorDetails);
router.patch('/tutors/:tutorId/approval', id, validate(v.tutorApproval), users.reviewTutorApplication);
router.patch('/tutors/:tutorId/status', id, validate(v.userStatus), (req, res) => {
  req.params.userId = req.params.tutorId;
  return users.updateUserStatus(req, res);
});
router.get('/tutors/:tutorId/earnings', id, commerce.getTutorEarningsForAdmin);

// Course management (list / approval / tutors); builder + videos via management router below
router.get('/courses', courses.listCourses);
router.get('/course-options', commerce.listCourseOptions);
router.patch('/courses/:courseId/approval', id, validate(v.courseApproval), courses.reviewCourse);
router.put('/courses/:courseId/tutors', id, courses.setCourseTutors);

// Category management
router.get('/categories', courses.listCategories);
router.post('/categories', uploadImage.single('image'), validate(v.category), courses.createCategory);
router.put('/categories/:categoryId', id, uploadImage.single('image'), validate(v.categoryUpdate), courses.updateCategory);
router.delete('/categories/:categoryId', id, courses.deleteCategory);

// Enrollment management & student progress
router.get('/enrollments', courses.listEnrollments);
router.get('/enrollments/:enrollmentId', id, courses.getEnrollment);
router.patch('/enrollments/:enrollmentId', id, validate(v.enrollmentUpdate), courses.updateEnrollment);
router.post('/enrollments/:enrollmentId/recalculate', id, courses.recalculateEnrollment);

// Orders & payments
router.get('/orders', commerce.listOrders);
router.get('/orders/:orderId', id, commerce.getOrder);
router.patch('/orders/:orderId/status', id, validate(v.orderStatus), commerce.updateOrderStatus);
router.post('/orders/:orderId/refund', id, commerce.refundOrder);
router.get('/payments', commerce.listPayments);
router.get('/payments/:paymentId', id, commerce.getPayment);

// Coupons
router.get('/coupons', commerce.listCoupons);
router.post('/coupons', validate(v.couponCreate), commerce.createCoupon);
router.get('/coupons/:couponId', id, commerce.getCoupon);
router.put('/coupons/:couponId', id, validate(v.couponUpdate), commerce.updateCoupon);
router.patch('/coupons/:couponId/status', id, validate(v.couponStatus), commerce.updateCouponStatus);
router.delete('/coupons/:couponId', id, commerce.deleteCoupon);

// Tutor payouts
router.get('/payouts', commerce.listPayouts);
router.post('/payouts', validate(v.payout), commerce.createPayout);
router.patch('/payouts/:payoutId', id, validate(v.payoutUpdate), commerce.updatePayout);

// Certificates (admin-only actions; list/approve via management router)
router.post('/certificates/generate', certificateBody, generateCertificate);
router.post('/certificates/:certificateId/revoke', id, revokeCertificate);

// Community moderation
router.get('/community/posts', content.listCommunityPosts);
router.get('/community/posts/:postId', id, content.getCommunityPost);
router.patch('/community/posts/:postId/status', id, validate(v.postStatus), content.moderatePost);
router.delete('/community/posts/:postId', id, content.purgePost);
router.get('/community/comments', content.listCommunityComments);
router.patch('/community/comments/:commentId/status', id, validate(v.commentStatus), content.moderateComment);

// Review moderation
router.get('/reviews', content.listReviews);
router.patch('/reviews/bulk-moderate', validate(v.reviewModeration), content.bulkModerateReviews);
router.patch('/reviews/:reviewId/moderate', id, validate(v.reviewModeration), content.moderateReview);
router.delete('/reviews/:reviewId', id, content.deleteReview);

// Communication (email / WhatsApp)
router.post('/communications', validate(v.communication), content.createCommunication);
router.get('/communications', content.listCommunications);
router.get('/communications/:communicationId', id, content.getCommunication);
router.post('/communications/:communicationId/resend', id, content.resendCommunication);

// Notifications
router.post('/notifications', validate(v.adminNotification), content.sendNotification);
router.get('/notifications', content.listNotifications);

// Reports
router.get('/reports/:type', validate(v.reportType), content.getReport);
router.post('/reports/:type/export', content.createReportExport);
router.get('/report-exports', content.listReportExports);
router.get('/report-exports/:exportId/download', id, content.downloadReportExport);

// Website / CMS
router.get('/cms/pages', content.listPages);
router.post('/cms/pages', validate(v.page), content.createPage);
router.get('/cms/pages/:pageId', id, content.getPage);
router.put('/cms/pages/:pageId', id, validate(v.pageUpdate), content.updatePage);
router.delete('/cms/pages/:pageId', id, content.deletePage);
router.get('/cms/contents', content.listContents);
router.get('/cms/contents/:sectionKey', content.getContent);
router.put('/cms/contents/:sectionKey', uploadImage.single('image'), validate(v.contentStatus), content.upsertContent);
router.delete('/cms/contents/:sectionKey', content.deleteContent);

// Settings
router.get('/settings', content.getSettings);
router.put('/settings/:group', content.saveSettings);
router.post('/settings/email/test', content.testEmailSettings);
router.post('/settings/whatsapp/test', content.testWhatsAppSettings);
router.post('/settings/zoom/test', content.testZoomSettings);
router.post('/settings/storage/test', content.testStorageSettings);

// Course builder, recorded videos, quizzes, projects, certificates, live classes (any course)
router.use(buildManagementRouter());

function certificateBody(req, res, next) {
  if (!/^\d+$/.test(String(req.body?.enrollment_id || ''))) {
    return res.status(422).json({ success: false, message: 'enrollment_id is required.' });
  }
  return next();
}

export default router;
