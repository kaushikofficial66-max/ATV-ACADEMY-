import express from 'express';
import { authenticate, authorize, requireActiveAccount } from '../middlewares/auth.js';
import { validateIdParams } from '../middlewares/validate.js';
import { listMyCourses } from '../controllers/shared/courseManageController.js';
import * as tutor from '../controllers/tutor/tutorController.js';
import { buildManagementRouter } from './managementRoutes.js';

// Tutor / Instructor panel. Pending (unapproved) tutors are blocked here but
// can still log in and manage their profile via /account.
const router = express.Router();
router.use(authenticate, authorize('tutor'), requireActiveAccount);

router.get('/dashboard', tutor.getDashboard);
router.get('/courses', listMyCourses);

// Student management
router.get('/students', tutor.listStudents);
router.get('/students/:studentId', validateIdParams, tutor.getStudentDetails);
router.get('/enrollments/:enrollmentId/progress', validateIdParams, tutor.getEnrollmentProgress);

// Reviews & earnings
router.get('/reviews', tutor.listReviews);
router.get('/earnings', tutor.getEarnings);
router.get('/payouts', tutor.listPayouts);

// Course builder, videos, quizzes, projects, certificates, live classes
router.use(buildManagementRouter());

export default router;
