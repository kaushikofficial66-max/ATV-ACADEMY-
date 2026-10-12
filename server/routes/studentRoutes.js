import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadProject } from '../middlewares/upload.js';
import { validate, validateIdParams } from '../middlewares/validate.js';
import { v } from './validators.js';
import { getDashboard } from '../controllers/student/dashboardController.js';
import * as learning from '../controllers/student/learningController.js';
import * as quiz from '../controllers/student/quizController.js';
import * as project from '../controllers/student/projectController.js';
import * as live from '../controllers/student/liveClassController.js';
import * as certificate from '../controllers/student/certificateController.js';
import * as commerce from '../controllers/student/commerceController.js';
import * as review from '../controllers/student/reviewController.js';

// Student panel. Learning endpoints also accept tutors/admins (course preview);
// commerce endpoints are student-only.
const router = express.Router();
router.use(authenticate);

const studentOnly = authorize('student');

// Dashboard
router.get('/dashboard', studentOnly, getDashboard);

// My courses & course learning
router.get('/courses', learning.getMyCourses);
router.get('/continue-learning', learning.continueLearning);
router.get('/courses/:courseId/learn', validateIdParams, learning.getCoursePlayer);
router.get('/courses/:courseId/progress', validateIdParams, learning.getCourseProgress);
router.get('/courses/:courseId/resources', validateIdParams, learning.getCourseResources);
router.get('/lectures/:lectureId', validateIdParams, learning.getLecture);
router.post('/lectures/:lectureId/progress', validateIdParams, validate(v.progress), learning.updateLectureProgress);
router.post('/lectures/:lectureId/complete', validateIdParams, learning.completeLecture);
// 90% completion rule: call when the student presses play (each counted play adds the progress increment)
router.post('/lectures/:lectureId/play', validateIdParams, learning.playLectureVideo);
router.post('/videos/:videoId/play', validateIdParams, learning.playVideo);
router.get('/resources/:resourceId/download', validateIdParams, learning.downloadResource);
router.get('/videos/:videoId', validateIdParams, learning.getVideo);

// Quizzes
router.get('/courses/:courseId/quizzes', validateIdParams, quiz.listCourseQuizzes);
router.get('/quiz-results', quiz.listAllResults);
router.get('/quizzes/:quizId', validateIdParams, quiz.getQuiz);
router.get('/quizzes/:quizId/attempts', validateIdParams, quiz.listMyAttempts);
router.post('/quizzes/:quizId/start', validateIdParams, quiz.startAttempt);
router.post('/quizzes/:quizId/submit', validateIdParams, validate(v.quizSubmit), quiz.submitQuizDirect);
router.post('/quiz-attempts/:attemptId/submit', validateIdParams, validate(v.quizSubmit), quiz.submitAttempt);
router.get('/quiz-attempts/:attemptId', validateIdParams, quiz.getAttemptResult);

// Final project
router.get('/courses/:courseId/project', validateIdParams, project.getCourseProject);
router.post('/projects/:projectId/submit', validateIdParams, uploadProject.single('project_file'), project.submitProject);
router.get('/project-submissions', project.listMySubmissions);
router.get('/project-submissions/:submissionId/download', validateIdParams, project.downloadMySubmission);
router.delete('/project-submissions/:submissionId', validateIdParams, project.withdrawSubmission);

// Live classes
router.get('/live-classes', live.listMyLiveClasses);
router.get('/live-classes/:classId', validateIdParams, live.getLiveClass);
router.post('/live-classes/:classId/join', validateIdParams, live.joinLiveClass);
router.post('/live-classes/:classId/leave', validateIdParams, live.leaveLiveClass);

// Certificates
router.get('/certificates', certificate.listMyCertificates);
router.get('/courses/:courseId/certificate', validateIdParams, certificate.getCourseCertificateStatus);
router.get('/certificates/:certificateId/download', validateIdParams, certificate.downloadCertificate);

// Wishlist
router.get('/wishlist', studentOnly, commerce.getWishlist);
router.post('/wishlist', studentOnly, validate(v.courseIdBody), commerce.addToWishlist);
router.delete('/wishlist/:courseId', validateIdParams, studentOnly, commerce.removeFromWishlist);
router.post('/wishlist/:courseId/move-to-cart', validateIdParams, studentOnly, commerce.moveWishlistToCart);

// Cart & checkout
router.get('/cart', studentOnly, commerce.getCart);
router.post('/cart', studentOnly, validate(v.courseIdBody), commerce.addToCart);
router.delete('/cart', studentOnly, commerce.clearCart);
router.delete('/cart/:courseId', validateIdParams, studentOnly, commerce.removeFromCart);
router.post('/cart/:courseId/move-to-wishlist', validateIdParams, studentOnly, commerce.moveCartToWishlist);
router.post('/cart/apply-coupon', studentOnly, validate(v.coupon), commerce.applyCoupon);
router.post('/checkout', studentOnly, validate(v.checkout), commerce.checkout);
router.post('/payments/verify', studentOnly, validate(v.paymentVerify), commerce.verifyPayment);
router.post('/payments/failed', studentOnly, commerce.reportPaymentFailure);

// Orders
router.get('/orders', studentOnly, commerce.listMyOrders);
router.get('/orders/:orderId', studentOnly, validateIdParams, commerce.getMyOrder);
router.post('/orders/:orderId/retry-payment', studentOnly, validateIdParams, commerce.retryPayment);
router.post('/orders/:orderId/cancel', studentOnly, validateIdParams, commerce.cancelOrder);
// Store (WooCommerce) purchase status, polled after returning from the store's thank-you page
router.get('/purchases/woocommerce/:wcOrderId', studentOnly, validateIdParams, commerce.getStorePurchaseStatus);

// Reviews
router.get('/reviews', studentOnly, review.listMyReviews);
router.get('/courses/:courseId/review', validateIdParams, studentOnly, review.getMyCourseReview);
router.post('/courses/:courseId/review', validateIdParams, studentOnly, validate(v.review), review.upsertReview);
router.put('/courses/:courseId/review', validateIdParams, studentOnly, validate(v.review), review.upsertReview);
router.delete('/courses/:courseId/review', validateIdParams, studentOnly, review.deleteMyReview);

export default router;
