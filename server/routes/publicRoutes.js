import express from 'express';
import {
  getHomepage,
  getContentBlock,
  getCategories,
  listCourses,
  getCourseDetails,
  getCourseReviews,
  listTutors,
  getTutorProfile,
  listPages,
  getPage,
  getSiteSettings,
  verifyCertificate
} from '../controllers/publicController.js';
import { optionalAuth } from '../middlewares/auth.js';
import { validateIdParams } from '../middlewares/validate.js';

// Public website - no login required (optionalAuth adds viewer info when logged in).
const router = express.Router();
router.use(optionalAuth);

router.get('/home', getHomepage);
router.get('/contents/:sectionKey', getContentBlock);
router.get('/settings', getSiteSettings);

router.get('/categories', getCategories);
router.get('/courses', listCourses);
router.get('/courses/:identifier', getCourseDetails);
router.get('/courses/:courseId/reviews', validateIdParams, getCourseReviews);

router.get('/tutors', listTutors);
router.get('/tutors/:tutorId', validateIdParams, getTutorProfile);

router.get('/pages', listPages);
router.get('/pages/:slug', getPage);

router.get('/certificates/verify/:certificateNumber', verifyCertificate);

export default router;
