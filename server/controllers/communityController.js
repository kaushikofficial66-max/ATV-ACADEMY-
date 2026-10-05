import { Op, literal } from 'sequelize';
import {
  CommunityPost,
  CommunityComment,
  CommunityLike,
  User,
  Course,
  Enrollment,
  Notification,
  Role
} from '../models/index.js';
import { successResponse } from '../utils/apiResponse.js';
import ApiError from '../utils/ApiError.js';
import { getPagination } from '../utils/pagination.js';
import { PUBLIC_USER_ATTRS } from '../utils/serializers.js';
import { isAdmin, hasCommunityAccess, canManageCourse, getTutorCourseIds } from '../services/accessService.js';
import { getSetting } from '../services/settingsService.js';
import { recordFile, removeStoredFile } from '../services/storageService.js';
import { publicUrlFor } from '../middlewares/upload.js';
import { notifyUser } from '../services/notificationService.js';

const AUTHOR_INCLUDE = {
  model: User,
  as: 'author',
  attributes: PUBLIC_USER_ATTRS,
  include: [{ model: Role, as: 'role', attributes: ['name'] }]
};

/** Middleware: lifetime community access (any purchase) for students; staff always. */
export const requireCommunityAccess = async (req, res, next) => {
  if (!(await hasCommunityAccess(req.user))) {
    throw ApiError.forbidden('Purchase any course to unlock lifetime community access.');
  }
  next();
};

/** Course ids whose discussions the user may read/post in. null = all (admin). */
const discussableCourseIds = async (user) => {
  if (isAdmin(user)) return null;
  const enrolled = await Enrollment.findAll({
    where: { user_id: user.id, status: { [Op.ne]: 'cancelled' } },
    attributes: ['course_id']
  });
  const tutored = await getTutorCourseIds(user.id);
  return [...new Set([...enrolled.map((e) => e.course_id), ...tutored])];
};

const assertCourseDiscussionAccess = async (user, courseId) => {
  if (await canManageCourse(user, courseId)) return;
  const enrollment = await Enrollment.findOne({ where: { user_id: user.id, course_id: courseId, status: { [Op.ne]: 'cancelled' } }, attributes: ['id'] });
  if (!enrollment) throw ApiError.forbidden('Course discussions are only available to students enrolled in that course.');
};

const postStats = (userId) => [
  [literal('(SELECT COUNT(*) FROM community_likes l WHERE l.post_id = `CommunityPost`.`id`)'), 'like_count'],
  [literal("(SELECT COUNT(*) FROM community_comments c WHERE c.post_id = `CommunityPost`.`id` AND c.status = 'visible')"), 'comment_count'],
  [literal(`(SELECT COUNT(*) FROM community_likes l WHERE l.post_id = \`CommunityPost\`.\`id\` AND l.user_id = ${Number(userId)})`), 'liked_by_me']
];

const shapePost = (post, user) => {
  const data = post.toJSON();
  data.like_count = Number(data.like_count || 0);
  data.comment_count = Number(data.comment_count || 0);
  data.liked_by_me = Number(data.liked_by_me || 0) > 0;
  data.can_edit = post.user_id === user.id;
  data.can_delete = post.user_id === user.id || isAdmin(user);
  return data;
};

/** Loads a visible post the user may see (published, or own pending). */
const findVisiblePost = async (user, postId) => {
  const post = await CommunityPost.findByPk(postId);
  if (!post || post.status === 'deleted') throw ApiError.notFound('Post not found.');
  if (post.status !== 'published' && post.user_id !== user.id && !isAdmin(user)) throw ApiError.notFound('Post not found.');
  if (post.course_id) await assertCourseDiscussionAccess(user, post.course_id);
  return post;
};

/**
 * GET /community/feed?course_id=&author_id=&search=&scope=general|courses|mine
 * General feed shows community-wide posts plus discussions of the user's courses.
 */
export const getFeed = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { [Op.or]: [{ status: 'published' }, { status: 'pending', user_id: req.user.id }] };
  const and = [];

  if (req.query.course_id) {
    await assertCourseDiscussionAccess(req.user, req.query.course_id);
    and.push({ course_id: req.query.course_id });
  } else {
    const allowed = await discussableCourseIds(req.user);
    if (req.query.scope === 'general') and.push({ course_id: null });
    else if (req.query.scope === 'courses') and.push(allowed === null ? { course_id: { [Op.ne]: null } } : { course_id: { [Op.in]: allowed } });
    else if (allowed !== null) and.push({ [Op.or]: [{ course_id: null }, { course_id: { [Op.in]: allowed } }] });
  }
  if (req.query.scope === 'mine') and.push({ user_id: req.user.id });
  if (req.query.author_id) and.push({ user_id: req.query.author_id });
  if (req.query.search) and.push({ content: { [Op.like]: `%${req.query.search}%` } });
  if (and.length) where[Op.and] = and;

  const { count, rows } = await CommunityPost.findAndCountAll({
    where,
    attributes: { include: postStats(req.user.id) },
    include: [AUTHOR_INCLUDE, { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  // Latest 3 visible comments per post for a compact feed.
  const posts = rows.map((p) => shapePost(p, req.user));
  if (posts.length) {
    const comments = await CommunityComment.findAll({
      where: { post_id: { [Op.in]: posts.map((p) => p.id) }, status: 'visible', parent_comment_id: null },
      include: [AUTHOR_INCLUDE],
      order: [['created_at', 'DESC']]
    });
    posts.forEach((p) => {
      p.recent_comments = comments.filter((c) => c.post_id === p.id).slice(0, 3).reverse();
    });
  }

  return successResponse(res, { data: { posts }, meta: meta(count) });
};

/** GET /community/courses - courses with discussion boards available to the user. */
export const getDiscussionCourses = async (req, res) => {
  const ids = await discussableCourseIds(req.user);
  const courses = await Course.findAll({
    where: ids === null ? { status: { [Op.in]: ['published', 'archived'] } } : { id: { [Op.in]: ids } },
    attributes: [
      'id',
      'title',
      'slug',
      'thumbnail_url',
      [literal("(SELECT COUNT(*) FROM community_posts p WHERE p.course_id = `Course`.`id` AND p.status = 'published')"), 'post_count']
    ],
    order: [['title', 'ASC']]
  });
  return successResponse(res, { data: { courses } });
};

/** POST /community/posts (multipart: content, course_id?, attachment image?) */
export const createPost = async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) throw ApiError.badRequest('Post content cannot be empty.');
  if (req.body.course_id) await assertCourseDiscussionAccess(req.user, req.body.course_id);

  const moderated = (await getSetting('community_moderation')) && !isAdmin(req.user);
  const post = await CommunityPost.create({
    user_id: req.user.id,
    course_id: req.body.course_id || null,
    content,
    attachment_url: req.file ? publicUrlFor(req.file) : null,
    status: moderated ? 'pending' : 'published'
  });
  if (req.file) await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'community_post', entityId: post.id });

  const full = await CommunityPost.findByPk(post.id, {
    attributes: { include: postStats(req.user.id) },
    include: [AUTHOR_INCLUDE, { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }]
  });
  return successResponse(res, {
    statusCode: 201,
    message: moderated ? 'Post submitted and awaiting moderation.' : 'Post published.',
    data: { post: shapePost(full, req.user) }
  });
};

/** GET /community/posts/:postId - post with threaded comments. */
export const getPost = async (req, res) => {
  await findVisiblePost(req.user, req.params.postId);
  const post = await CommunityPost.findByPk(req.params.postId, {
    attributes: { include: postStats(req.user.id) },
    include: [AUTHOR_INCLUDE, { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }]
  });
  const comments = await CommunityComment.findAll({
    where: { post_id: post.id, status: 'visible' },
    include: [AUTHOR_INCLUDE],
    order: [['created_at', 'ASC']]
  });
  const byParent = {};
  comments.forEach((c) => {
    const key = c.parent_comment_id || 'root';
    (byParent[key] = byParent[key] || []).push(c.toJSON());
  });
  const attach = (list) =>
    (list || []).map((c) => ({ ...c, can_edit: c.user_id === req.user.id, can_delete: c.user_id === req.user.id || isAdmin(req.user), replies: attach(byParent[c.id]) }));

  return successResponse(res, { data: { post: shapePost(post, req.user), comments: attach(byParent.root) } });
};

/** PUT /community/posts/:postId { content } - author only. */
export const updatePost = async (req, res) => {
  const post = await CommunityPost.findByPk(req.params.postId);
  if (!post || post.status === 'deleted') throw ApiError.notFound('Post not found.');
  if (post.user_id !== req.user.id) throw ApiError.forbidden('You can only edit your own posts.');
  const content = String(req.body.content || '').trim();
  if (!content) throw ApiError.badRequest('Post content cannot be empty.');
  const updates = { content };
  if (req.file) {
    if (post.attachment_url) await removeStoredFile(post.attachment_url);
    updates.attachment_url = publicUrlFor(req.file);
    await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'community_post', entityId: post.id });
  } else if (req.body.remove_attachment === 'true' || req.body.remove_attachment === true) {
    if (post.attachment_url) await removeStoredFile(post.attachment_url);
    updates.attachment_url = null;
  }
  await post.update(updates);
  return successResponse(res, { message: 'Post updated.', data: { post } });
};

/** DELETE /community/posts/:postId - author or admin (soft delete). */
export const deletePost = async (req, res) => {
  const post = await CommunityPost.findByPk(req.params.postId);
  if (!post || post.status === 'deleted') throw ApiError.notFound('Post not found.');
  if (post.user_id !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden('You can only delete your own posts.');
  await post.update({ status: 'deleted' });
  return successResponse(res, { message: 'Post deleted.' });
};

/** GET /community/posts/:postId/comments (paginated, top-level with replies count) */
export const listComments = async (req, res) => {
  const post = await findVisiblePost(req.user, req.params.postId);
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { post_id: post.id, status: 'visible', parent_comment_id: req.query.parent_comment_id || null };
  const { count, rows } = await CommunityComment.findAndCountAll({
    where,
    attributes: { include: [[literal("(SELECT COUNT(*) FROM community_comments r WHERE r.parent_comment_id = `CommunityComment`.`id` AND r.status = 'visible')"), 'reply_count']] },
    include: [AUTHOR_INCLUDE],
    order: [['created_at', 'ASC']],
    limit,
    offset
  });
  return successResponse(res, { data: { comments: rows }, meta: meta(count) });
};

/** POST /community/posts/:postId/comments { content, parent_comment_id? } */
export const addComment = async (req, res) => {
  const post = await findVisiblePost(req.user, req.params.postId);
  if (post.status !== 'published') throw ApiError.badRequest('You cannot comment on a post awaiting moderation.');
  const content = String(req.body.content || '').trim();
  if (!content) throw ApiError.badRequest('Comment cannot be empty.');

  let parent = null;
  if (req.body.parent_comment_id) {
    parent = await CommunityComment.findOne({ where: { id: req.body.parent_comment_id, post_id: post.id, status: 'visible' } });
    if (!parent) throw ApiError.badRequest('The comment you are replying to does not exist.');
  }

  const comment = await CommunityComment.create({
    post_id: post.id,
    user_id: req.user.id,
    parent_comment_id: parent ? parent.id : null,
    content,
    status: 'visible'
  });

  const name = `${req.user.first_name} ${req.user.last_name || ''}`.trim();
  if (post.user_id !== req.user.id) {
    await notifyUser(post.user_id, {
      title: 'New comment on your post',
      message: `${name} commented: "${content.slice(0, 120)}"`,
      type: 'community_comment',
      reference_type: 'community_post',
      reference_id: post.id
    });
  }
  if (parent && parent.user_id !== req.user.id && parent.user_id !== post.user_id) {
    await notifyUser(parent.user_id, {
      title: 'New reply to your comment',
      message: `${name} replied: "${content.slice(0, 120)}"`,
      type: 'community_reply',
      reference_type: 'community_post',
      reference_id: post.id
    });
  }

  const full = await CommunityComment.findByPk(comment.id, { include: [AUTHOR_INCLUDE] });
  return successResponse(res, { statusCode: 201, message: 'Comment added.', data: { comment: full } });
};

/** PUT /community/comments/:commentId { content } - author only. */
export const updateComment = async (req, res) => {
  const comment = await CommunityComment.findByPk(req.params.commentId);
  if (!comment || comment.status === 'deleted') throw ApiError.notFound('Comment not found.');
  if (comment.user_id !== req.user.id) throw ApiError.forbidden('You can only edit your own comments.');
  const content = String(req.body.content || '').trim();
  if (!content) throw ApiError.badRequest('Comment cannot be empty.');
  await comment.update({ content });
  return successResponse(res, { message: 'Comment updated.', data: { comment } });
};

/** DELETE /community/comments/:commentId - author or admin. */
export const deleteComment = async (req, res) => {
  const comment = await CommunityComment.findByPk(req.params.commentId);
  if (!comment || comment.status === 'deleted') throw ApiError.notFound('Comment not found.');
  if (comment.user_id !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden('You can only delete your own comments.');
  await comment.update({ status: 'deleted' });
  return successResponse(res, { message: 'Comment deleted.' });
};

/** POST /community/posts/:postId/like - toggles like. */
export const toggleLike = async (req, res) => {
  const post = await findVisiblePost(req.user, req.params.postId);
  const existing = await CommunityLike.findOne({ where: { post_id: post.id, user_id: req.user.id } });
  let liked;
  if (existing) {
    await existing.destroy();
    liked = false;
  } else {
    await CommunityLike.create({ post_id: post.id, user_id: req.user.id });
    liked = true;
    if (post.user_id !== req.user.id) {
      await notifyUser(post.user_id, {
        title: 'Someone liked your post',
        message: `${req.user.first_name} liked your post.`,
        type: 'community_like',
        reference_type: 'community_post',
        reference_id: post.id
      });
    }
  }
  const likeCount = await CommunityLike.count({ where: { post_id: post.id } });
  return successResponse(res, { message: liked ? 'Post liked.' : 'Like removed.', data: { liked, like_count: likeCount } });
};

/** GET /community/posts/:postId/likes - who liked a post. */
export const listLikes = async (req, res) => {
  const post = await findVisiblePost(req.user, req.params.postId);
  const likes = await CommunityLike.findAll({
    where: { post_id: post.id },
    include: [{ model: User, as: 'user', attributes: PUBLIC_USER_ATTRS }],
    order: [['created_at', 'DESC']],
    limit: 200
  });
  return successResponse(res, { data: { likes } });
};

/** GET /community/notifications - community-related notifications. */
export const getCommunityNotifications = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const { count, rows } = await Notification.findAndCountAll({
    where: { user_id: req.user.id, type: { [Op.like]: 'community_%' } },
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  const unread = await Notification.count({ where: { user_id: req.user.id, type: { [Op.like]: 'community_%' }, is_read: false } });
  return successResponse(res, { data: { notifications: rows, unread_count: unread }, meta: meta(count) });
};

export default {
  requireCommunityAccess,
  getFeed,
  getDiscussionCourses,
  createPost,
  getPost,
  updatePost,
  deletePost,
  listComments,
  addComment,
  updateComment,
  deleteComment,
  toggleLike,
  listLikes,
  getCommunityNotifications
};
