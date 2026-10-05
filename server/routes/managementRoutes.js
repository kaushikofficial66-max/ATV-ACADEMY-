import express from 'express';
import { uploadImage, uploadVideo, uploadDocument } from '../middlewares/upload.js';
import { validate, validateIdParams } from '../middlewares/validate.js';
import { v } from './validators.js';
import * as course from '../controllers/shared/courseManageController.js';
import * as quiz from '../controllers/shared/quizManageController.js';
import * as project from '../controllers/shared/projectManageController.js';
import * as live from '../controllers/shared/liveClassManageController.js';
import * as certificate from '../controllers/shared/certificateManageController.js';

/**
 * Course builder, quizzes, projects, live classes and certificate approval.
 * Mounted under both /tutor and /admin. Ownership is enforced in the
 * controllers: tutors can only manage courses they are assigned to,
 * admins can manage every course.
 */
export const buildManagementRouter = () => {
  const router = express.Router();
  const id = validateIdParams;

  // Courses
  router.post('/courses', uploadImage.single('thumbnail'), validate(v.courseCreate), course.createCourse);
  router.get('/courses/:courseId', id, course.getCourseForManage);
  router.put('/courses/:courseId', id, uploadImage.single('thumbnail'), validate(v.courseUpdate), course.updateCourse);
  router.delete('/courses/:courseId', id, course.deleteCourse);
  router.post('/courses/:courseId/submit', id, course.submitCourseForReview);
  router.patch('/courses/:courseId/status', id, validate(v.courseStatus), course.changeCourseStatus);
  router.get('/courses/:courseId/stats', id, course.getCourseStats);

  // Curriculum: sections & lectures
  router.get('/courses/:courseId/curriculum', id, course.getCurriculum);
  router.post('/courses/:courseId/sections', id, validate(v.section), course.createSection);
  router.put('/courses/:courseId/sections/reorder', id, course.reorderSections);
  router.put('/sections/:sectionId', id, validate(v.sectionUpdate), course.updateSection);
  router.delete('/sections/:sectionId', id, course.deleteSection);
  router.post('/sections/:sectionId/lectures', id, validate(v.lecture), course.createLecture);
  router.put('/sections/:sectionId/lectures/reorder', id, course.reorderLectures);
  router.get('/lectures/:lectureId', id, course.getLectureForManage);
  router.put('/lectures/:lectureId', id, validate(v.lectureUpdate), course.updateLecture);
  router.delete('/lectures/:lectureId', id, course.deleteLecture);

  // Lecture resources
  router.get('/courses/:courseId/resources', id, course.listResources);
  router.post('/courses/:courseId/resources', id, uploadDocument.single('resource_file'), course.createResource);
  router.put('/resources/:resourceId', id, uploadDocument.single('resource_file'), course.updateResource);
  router.delete('/resources/:resourceId', id, course.deleteResource);
  router.get('/resources/:resourceId/download', id, course.downloadResource);

  // Recorded videos: upload, assignment, management
  router.get('/courses/:courseId/videos', id, course.listVideos);
  router.post('/courses/:courseId/videos', id, uploadVideo.single('video_file'), validate(v.video), course.uploadVideo);
  router.post('/courses/:courseId/videos/direct-upload', id, validate(v.videoDirectUpload), course.createVideoDirectUpload);
  router.get('/videos/:videoId', id, course.getVideoForManage);
  router.post('/videos/:videoId/sync', id, course.syncVideo);
  router.post('/videos/:videoId/direct-upload', id, validate(v.videoDirectUpload), course.createVideoReplaceUpload);
  router.put('/videos/:videoId', id, validate(v.video), course.updateVideo);
  router.put('/videos/:videoId/file', id, uploadVideo.single('video_file'), course.replaceVideoFile);
  router.delete('/videos/:videoId', id, course.deleteVideo);

  // Quizzes
  router.get('/courses/:courseId/quizzes', id, quiz.listCourseQuizzes);
  router.post('/courses/:courseId/quizzes', id, validate(v.quiz), quiz.createQuiz);
  router.get('/quizzes/:quizId', id, quiz.getQuizForManage);
  router.put('/quizzes/:quizId', id, validate(v.quizUpdate), quiz.updateQuiz);
  router.delete('/quizzes/:quizId', id, quiz.deleteQuiz);
  router.post('/quizzes/:quizId/questions', id, quiz.addQuestion);
  router.put('/quizzes/:quizId/questions/reorder', id, quiz.reorderQuestions);
  router.put('/questions/:questionId', id, quiz.updateQuestion);
  router.delete('/questions/:questionId', id, quiz.deleteQuestion);
  router.get('/quizzes/:quizId/results', id, quiz.getQuizResults);
  router.get('/quiz-attempts/:attemptId', id, quiz.getAttemptDetail);

  // Final projects & submissions
  router.get('/courses/:courseId/projects', id, project.listCourseProjects);
  router.post('/courses/:courseId/projects', id, validate(v.project), project.createProject);
  router.get('/projects/:projectId', id, project.getProject);
  router.put('/projects/:projectId', id, validate(v.projectUpdate), project.updateProject);
  router.delete('/projects/:projectId', id, project.deleteProject);
  router.get('/project-submissions', project.listSubmissions);
  router.get('/project-submissions/:submissionId', id, project.getSubmission);
  router.get('/project-submissions/:submissionId/download', id, project.downloadSubmission);
  router.put('/project-submissions/:submissionId/review', id, validate(v.submissionReview), project.reviewSubmission);

  // Certificates
  router.get('/certificates', certificate.listCertificates);
  router.get('/certificates/:certificateId/review', id, certificate.reviewCompletion);
  router.post('/certificates/:certificateId/approve', id, certificate.approveCertificate);
  router.get('/certificates/:certificateId/download', id, certificate.downloadCertificate);

  // Live classes (Zoom)
  router.get('/live-classes', live.listLiveClasses);
  router.post('/live-classes', validate(v.liveClass), live.createLiveClass);
  router.get('/live-classes/:classId', id, live.getLiveClass);
  router.put('/live-classes/:classId', id, validate(v.liveClassUpdate), live.updateLiveClass);
  router.patch('/live-classes/:classId/status', id, validate(v.liveClassStatus), live.updateLiveClassStatus);
  router.delete('/live-classes/:classId', id, live.deleteLiveClass);
  router.get('/live-classes/:classId/start', id, live.startLiveClass);
  router.get('/live-classes/:classId/attendance', id, live.getAttendance);

  return router;
};

export default buildManagementRouter;
