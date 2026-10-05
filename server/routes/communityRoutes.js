import express from 'express';
import * as community from '../controllers/communityController.js';
import { authenticate } from '../middlewares/auth.js';
import { uploadImage } from '../middlewares/upload.js';
import { validate, validateIdParams } from '../middlewares/validate.js';
import { v } from './validators.js';

// Lifetime community: available after purchasing any course (tutors/admins always).
const router = express.Router();
router.use(authenticate, community.requireCommunityAccess);
const id = validateIdParams;

router.get('/feed', community.getFeed);
router.get('/courses', community.getDiscussionCourses);
router.get('/notifications', community.getCommunityNotifications);

router.post('/posts', uploadImage.single('attachment'), validate(v.communityText), community.createPost);
router.get('/posts/:postId', id, community.getPost);
router.put('/posts/:postId', id, uploadImage.single('attachment'), validate(v.communityText), community.updatePost);
router.delete('/posts/:postId', id, community.deletePost);

router.get('/posts/:postId/comments', id, community.listComments);
router.post('/posts/:postId/comments', id, validate(v.communityText), community.addComment);
router.put('/comments/:commentId', id, validate(v.communityText), community.updateComment);
router.delete('/comments/:commentId', id, community.deleteComment);

router.post('/posts/:postId/like', id, community.toggleLike);
router.get('/posts/:postId/likes', id, community.listLikes);

export default router;
