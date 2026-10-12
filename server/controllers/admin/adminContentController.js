import { Op, fn, col } from 'sequelize';
import {
  CommunityPost,
  CommunityComment,
  CommunityLike,
  Review,
  Course,
  User,
  Communication,
  Notification,
  ReportExport,
  CmsPage,
  CmsContent
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, dateRange } from '../../utils/pagination.js';
import { pick, uniqueSlug } from '../../utils/helpers.js';
import { notifyUser, notifyUsers, getUserIdsByRole, getActiveUserIds, getCourseStudentIds } from '../../services/notificationService.js';
import { sendCommunication } from '../../services/communicationService.js';
import { buildReport, exportReport } from '../../services/reportService.js';
import { sendStoredFile, recordFile } from '../../services/storageService.js';
import { publicUrlFor } from '../../middlewares/upload.js';
import { getAdminSettings, updateSettings, SETTING_GROUPS, invalidateSettingsCache, getSetting } from '../../services/settingsService.js';
import { testConnection as testWooCommerceConnection } from '../../services/woocommerceService.js';
import { sendMail } from '../../services/mailService.js';
import { sendWhatsAppMessage } from '../../services/whatsappService.js';
import { isZoomConfigured, getMeetingStartUrl } from '../../services/zoomService.js';
import { toCsv } from '../../utils/csv.js';
import { getStorageDriver } from '../../services/storageDriver.js';
import { isVimeoConfigured, testVimeoConnection } from '../../services/vimeoService.js';
import { isR2Configured, testR2Connection } from '../../services/r2Service.js';

const AUTHOR = { model: User, as: 'author', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'] };

// ==========================================================================
// Community moderation
// ==========================================================================

/** GET /admin/community/posts?status=&course_id=&user_id=&search= */
export const listCommunityPosts = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.course_id) where.course_id = req.query.course_id;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.search) where.content = { [Op.like]: `%${req.query.search}%` };
  const { count, rows } = await CommunityPost.findAndCountAll({
    where,
    attributes: {
      include: [
        [CommunityPost.sequelize.literal('(SELECT COUNT(*) FROM community_likes l WHERE l.post_id = `CommunityPost`.`id`)'), 'like_count'],
        [CommunityPost.sequelize.literal('(SELECT COUNT(*) FROM community_comments c WHERE c.post_id = `CommunityPost`.`id`)'), 'comment_count']
      ]
    },
    include: [AUTHOR, { model: Course, as: 'course', attributes: ['id', 'title'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  const statusCounts = await CommunityPost.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true });
  return successResponse(res, {
    data: { posts: rows, status_counts: Object.fromEntries(statusCounts.map((s) => [s.status, Number(s.count)])) },
    meta: meta(count)
  });
};

/** GET /admin/community/posts/:postId - post with all comments (any status). */
export const getCommunityPost = async (req, res) => {
  const post = await CommunityPost.findByPk(req.params.postId, { include: [AUTHOR, { model: Course, as: 'course', attributes: ['id', 'title'] }] });
  if (!post) throw ApiError.notFound('Post not found.');
  const [comments, likes] = await Promise.all([
    CommunityComment.findAll({ where: { post_id: post.id }, include: [AUTHOR], order: [['created_at', 'ASC']] }),
    CommunityLike.count({ where: { post_id: post.id } })
  ]);
  return successResponse(res, { data: { post, comments, like_count: likes } });
};

/** PATCH /admin/community/posts/:postId/status { status: published|hidden|deleted|pending, reason } */
export const moderatePost = async (req, res) => {
  const post = await CommunityPost.findByPk(req.params.postId);
  if (!post) throw ApiError.notFound('Post not found.');
  const previous = post.status;
  await post.update({ status: req.body.status });
  if (previous !== req.body.status) {
    const text = {
      published: previous === 'pending' ? 'Your community post has been approved.' : 'Your community post has been restored.',
      hidden: 'Your community post has been hidden by a moderator.',
      deleted: 'Your community post was removed by a moderator.',
      pending: 'Your community post is under review.'
    }[req.body.status];
    await notifyUser(post.user_id, {
      title: 'Community post update',
      message: `${text}${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
      type: 'community_moderation',
      reference_type: 'community_post',
      reference_id: post.id
    });
  }
  return successResponse(res, { message: `Post ${req.body.status}.`, data: { post } });
};

/** GET /admin/community/comments?status=&post_id=&user_id=&search= */
export const listCommunityComments = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.post_id) where.post_id = req.query.post_id;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.search) where.content = { [Op.like]: `%${req.query.search}%` };
  const { count, rows } = await CommunityComment.findAndCountAll({
    where,
    include: [AUTHOR, { model: CommunityPost, as: 'post', attributes: ['id', 'content', 'status'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { comments: rows }, meta: meta(count) });
};

/** PATCH /admin/community/comments/:commentId/status { status: visible|hidden|deleted } */
export const moderateComment = async (req, res) => {
  const comment = await CommunityComment.findByPk(req.params.commentId);
  if (!comment) throw ApiError.notFound('Comment not found.');
  await comment.update({ status: req.body.status });
  if (req.body.status !== 'visible') {
    await notifyUser(comment.user_id, {
      title: 'Community comment update',
      message: `Your comment was ${req.body.status} by a moderator.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
      type: 'community_moderation',
      reference_type: 'community_post',
      reference_id: comment.post_id
    });
  }
  return successResponse(res, { message: `Comment ${req.body.status}.`, data: { comment } });
};

/** DELETE /admin/community/posts/:postId - permanent removal (cascades comments & likes). */
export const purgePost = async (req, res) => {
  const post = await CommunityPost.findByPk(req.params.postId);
  if (!post) throw ApiError.notFound('Post not found.');
  await post.destroy();
  return successResponse(res, { message: 'Post permanently deleted.' });
};

// ==========================================================================
// Review moderation
// ==========================================================================

/** GET /admin/reviews?status=&course_id=&rating=&search= */
export const listReviews = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.course_id) where.course_id = req.query.course_id;
  if (req.query.rating) where.rating = req.query.rating;
  if (req.query.search) where.review = { [Op.like]: `%${req.query.search}%` };
  const [{ count, rows }, statusCounts] = await Promise.all([
    Review.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_image'] },
        { model: Course, as: 'course', attributes: ['id', 'title', 'slug'] },
        { model: User, as: 'moderator', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    }),
    Review.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true })
  ]);
  return successResponse(res, {
    data: { reviews: rows, status_counts: Object.fromEntries(statusCounts.map((s) => [s.status, Number(s.count)])) },
    meta: meta(count)
  });
};

/** PATCH /admin/reviews/:reviewId/moderate { status: approved|rejected|pending, reason } */
export const moderateReview = async (req, res) => {
  const review = await Review.findByPk(req.params.reviewId, { include: [{ model: Course, as: 'course', attributes: ['title'] }] });
  if (!review) throw ApiError.notFound('Review not found.');
  await review.update({ status: req.body.status, moderated_by: req.user.id, moderated_at: new Date() });
  if (req.body.status !== 'pending') {
    await notifyUser(review.user_id, {
      title: `Review ${req.body.status}`,
      message: `Your review of "${review.course.title}" was ${req.body.status}.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
      type: 'review_moderation',
      reference_type: 'review',
      reference_id: review.id
    });
  }
  return successResponse(res, { message: `Review ${req.body.status}.`, data: { review } });
};

/** PATCH /admin/reviews/bulk-moderate { ids: [], status } */
export const bulkModerateReviews = async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw ApiError.badRequest('ids is required.');
  const [updated] = await Review.update({ status: req.body.status, moderated_by: req.user.id, moderated_at: new Date() }, { where: { id: { [Op.in]: ids } } });
  return successResponse(res, { message: `${updated} review(s) ${req.body.status}.` });
};

/** DELETE /admin/reviews/:reviewId */
export const deleteReview = async (req, res) => {
  const removed = await Review.destroy({ where: { id: req.params.reviewId } });
  if (!removed) throw ApiError.notFound('Review not found.');
  return successResponse(res, { message: 'Review deleted.' });
};

// ==========================================================================
// Communication (email / WhatsApp)
// ==========================================================================

/**
 * POST /admin/communications
 * { channel: email|whatsapp, recipient_type: student|tutor|all_students|all_tutors|all_users,
 *   recipient_id (for single), subject (email), message }
 * Placeholders {{first_name}}, {{last_name}}, {{email}} are personalised.
 */
export const createCommunication = async (req, res) => {
  const result = await sendCommunication({
    senderId: req.user.id,
    recipientType: req.body.recipient_type,
    recipientId: req.body.recipient_id,
    channel: req.body.channel,
    subject: req.body.subject || null,
    message: req.body.message
  });
  const { communication } = result;
  return successResponse(res, {
    statusCode: result.queued ? 202 : communication.status === 'sent' ? 201 : 502,
    message: result.queued
      ? `Sending to ${result.recipients} recipients in the background. Check Communication History for the result.`
      : communication.status === 'sent'
        ? 'Message sent.'
        : `Message could not be delivered: ${communication.error_message}`,
    data: result
  });
};

/** GET /admin/communications?channel=&status=&recipient_type=&recipient_id=&search= */
export const listCommunications = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  for (const key of ['channel', 'status', 'recipient_type', 'recipient_id']) if (req.query[key]) where[key] = req.query[key];
  if (req.query.search) where[Op.or] = [{ subject: { [Op.like]: `%${req.query.search}%` } }, { message: { [Op.like]: `%${req.query.search}%` } }];
  const { count, rows } = await Communication.findAndCountAll({
    where,
    include: [
      { model: User, as: 'sender', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'recipient', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { communications: rows }, meta: meta(count) });
};

/** GET /admin/communications/:communicationId */
export const getCommunication = async (req, res) => {
  const communication = await Communication.findByPk(req.params.communicationId, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'recipient', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] }
    ]
  });
  if (!communication) throw ApiError.notFound('Communication not found.');
  return successResponse(res, { data: { communication } });
};

/** POST /admin/communications/:communicationId/resend - resend a failed message. */
export const resendCommunication = async (req, res) => {
  const original = await Communication.findByPk(req.params.communicationId);
  if (!original) throw ApiError.notFound('Communication not found.');
  const result = await sendCommunication({
    senderId: req.user.id,
    recipientType: original.recipient_type,
    recipientId: original.recipient_id,
    channel: original.channel,
    subject: original.subject,
    message: original.message
  });
  return successResponse(res, { statusCode: 202, message: 'Message re-sent.', data: result });
};

// ==========================================================================
// Notifications (in-app)
// ==========================================================================

/**
 * POST /admin/notifications
 * { audience: user|all_students|all_tutors|all_users|course_students, user_id, course_id, title, message }
 */
export const sendNotification = async (req, res) => {
  const { audience, title, message } = req.body;
  let userIds = [];
  if (audience === 'user') {
    if (!req.body.user_id || !(await User.findByPk(req.body.user_id))) throw ApiError.badRequest('A valid user_id is required.');
    userIds = [Number(req.body.user_id)];
  } else if (audience === 'all_students') userIds = await getUserIdsByRole('student');
  else if (audience === 'all_tutors') userIds = await getUserIdsByRole('tutor');
  else if (audience === 'all_users') userIds = await getActiveUserIds();
  else if (audience === 'course_students') {
    if (!req.body.course_id) throw ApiError.badRequest('course_id is required.');
    userIds = await getCourseStudentIds(req.body.course_id);
  }
  if (!userIds.length) throw ApiError.badRequest('No recipients match this audience.');

  const sent = await notifyUsers(userIds, {
    title,
    message,
    type: 'admin_announcement',
    reference_type: audience === 'course_students' ? 'course' : null,
    reference_id: audience === 'course_students' ? req.body.course_id : null
  });
  return successResponse(res, { statusCode: 201, message: `Notification sent to ${sent} user(s).`, data: { recipients: sent } });
};

/**
 * GET /admin/notifications?type=&user_id=&is_read=&search=
 * Notification history. `group=true` collapses broadcasts into one row each.
 */
export const listNotifications = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = { ...dateRange(req.query) };
  if (req.query.type) where.type = req.query.type;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.is_read !== undefined) where.is_read = req.query.is_read === 'true';
  if (req.query.search) where[Op.or] = [{ title: { [Op.like]: `%${req.query.search}%` } }, { message: { [Op.like]: `%${req.query.search}%` } }];

  if (req.query.group === 'true') {
    const rows = await Notification.findAll({
      attributes: [
        'title',
        'message',
        'type',
        [fn('MIN', col('created_at')), 'sent_at'],
        [fn('COUNT', col('id')), 'recipients'],
        [fn('SUM', Notification.sequelize.literal('CASE WHEN is_read = 1 THEN 1 ELSE 0 END')), 'read_count']
      ],
      where: { type: 'admin_announcement', ...where },
      group: ['title', 'message', 'type', fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:%i')],
      order: [[fn('MIN', col('created_at')), 'DESC']],
      limit,
      offset,
      raw: true
    });
    return successResponse(res, { data: { broadcasts: rows } });
  }

  const { count, rows } = await Notification.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { notifications: rows }, meta: meta(count) });
};

// ==========================================================================
// Reports
// ==========================================================================

/** GET /admin/reports/:type?from=&to=&status=&course_id=&category_id=&tutor_id=&format=json|csv */
export const getReport = async (req, res) => {
  const filters = pick(req.query, ['from', 'to', 'status', 'course_id', 'category_id', 'tutor_id']);
  const report = await buildReport(req.params.type, filters);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-report-${Date.now()}.csv"`);
    return res.send(`﻿${toCsv(report.columns, report.rows)}`);
  }
  const { limit, offset, meta } = getPagination(req.query, 50);
  return successResponse(res, {
    data: { type: req.params.type, filters, summary: report.summary, columns: report.columns, rows: report.rows.slice(offset, offset + limit) },
    meta: meta(report.rows.length)
  });
};

/** POST /admin/reports/:type/export { filters } - stores a CSV and logs it in report_exports. */
export const createReportExport = async (req, res) => {
  const filters = pick(req.body.filters || req.body || {}, ['from', 'to', 'status', 'course_id', 'category_id', 'tutor_id']);
  const record = await exportReport(req.params.type, filters, req.user.id);
  return successResponse(res, {
    statusCode: 201,
    message: 'Report exported.',
    data: { export: record, download_url: `/api/v1/admin/report-exports/${record.id}/download` }
  });
};

/** GET /admin/report-exports */
export const listReportExports = async (req, res) => {
  const { limit, offset, meta } = getPagination(req.query, 20);
  const where = {};
  if (req.query.report_type) where.report_type = req.query.report_type;
  const { count, rows } = await ReportExport.findAndCountAll({
    where,
    include: [{ model: User, as: 'generator', attributes: ['id', 'first_name', 'last_name'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  return successResponse(res, { data: { exports: rows }, meta: meta(count) });
};

/** GET /admin/report-exports/:exportId/download */
export const downloadReportExport = async (req, res) => {
  const record = await ReportExport.findByPk(req.params.exportId);
  if (!record || record.status !== 'completed' || !record.file_url) throw ApiError.notFound('Export not found.');
  return sendStoredFile(res, record.file_url, { downloadName: `${record.report_type}-report-${record.id}.csv` });
};

// ==========================================================================
// Website / CMS
// ==========================================================================

/** GET /admin/cms/pages?status=&search= */
export const listPages = async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.title = { [Op.like]: `%${req.query.search}%` };
  const pages = await CmsPage.findAll({
    where,
    include: [
      { model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'updater', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['updated_at', 'DESC']]
  });
  return successResponse(res, { data: { pages } });
};

/** POST /admin/cms/pages { title, slug?, content, meta_title, meta_description, status } */
export const createPage = async (req, res) => {
  const status = req.body.status || 'draft';
  const page = await CmsPage.create({
    ...pick(req.body, ['title', 'content', 'meta_title', 'meta_description']),
    slug: await uniqueSlug(CmsPage, req.body.slug || req.body.title),
    status,
    created_by: req.user.id,
    updated_by: req.user.id,
    published_at: status === 'published' ? new Date() : null
  });
  return successResponse(res, { statusCode: 201, message: 'Page created.', data: { page } });
};

/** GET /admin/cms/pages/:pageId */
export const getPage = async (req, res) => {
  const page = await CmsPage.findByPk(req.params.pageId);
  if (!page) throw ApiError.notFound('Page not found.');
  return successResponse(res, { data: { page } });
};

/** PUT /admin/cms/pages/:pageId */
export const updatePage = async (req, res) => {
  const page = await CmsPage.findByPk(req.params.pageId);
  if (!page) throw ApiError.notFound('Page not found.');
  const data = { ...pick(req.body, ['title', 'content', 'meta_title', 'meta_description', 'status']), updated_by: req.user.id };
  if (req.body.slug) data.slug = await uniqueSlug(CmsPage, req.body.slug, page.id);
  if (data.status === 'published' && !page.published_at) data.published_at = new Date();
  await page.update(data);
  return successResponse(res, { message: 'Page updated.', data: { page } });
};

/** DELETE /admin/cms/pages/:pageId */
export const deletePage = async (req, res) => {
  const removed = await CmsPage.destroy({ where: { id: req.params.pageId } });
  if (!removed) throw ApiError.notFound('Page not found.');
  return successResponse(res, { message: 'Page deleted.' });
};

/** GET /admin/cms/contents - all homepage / website content blocks. */
export const listContents = async (req, res) => {
  const contents = await CmsContent.findAll({
    include: [{ model: User, as: 'updater', attributes: ['id', 'first_name', 'last_name'] }],
    order: [['section_key', 'ASC']]
  });
  return successResponse(res, { data: { contents } });
};

/** GET /admin/cms/contents/:sectionKey */
export const getContent = async (req, res) => {
  const content = await CmsContent.findOne({ where: { section_key: req.params.sectionKey } });
  if (!content) throw ApiError.notFound('Content block not found.');
  return successResponse(res, { data: { content } });
};

/**
 * PUT /admin/cms/contents/:sectionKey - create or update a content block
 * (e.g. hero, about, features, faq, featured_courses { data: { course_ids } }, footer).
 * multipart: title, content, data (JSON string), status, image (file) or image_url.
 */
export const upsertContent = async (req, res) => {
  const key = String(req.params.sectionKey).toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 100);
  const payload = { ...pick(req.body, ['title', 'content', 'status']), updated_by: req.user.id };
  if (req.body.data !== undefined) {
    if (typeof req.body.data === 'string') {
      try {
        payload.data = req.body.data ? JSON.parse(req.body.data) : null;
      } catch {
        throw ApiError.badRequest('data must be valid JSON.');
      }
    } else payload.data = req.body.data;
  }
  if (req.file) payload.image_url = publicUrlFor(req.file);
  else if (req.body.image_url !== undefined) payload.image_url = req.body.image_url || null;

  let content = await CmsContent.findOne({ where: { section_key: key } });
  const created = !content;
  if (content) await content.update(payload);
  else content = await CmsContent.create({ section_key: key, status: 'active', ...payload });
  if (req.file) await recordFile(req.file, { uploadedBy: req.user.id, entityType: 'cms_content', entityId: content.id });

  return successResponse(res, { statusCode: created ? 201 : 200, message: 'Content saved.', data: { content } });
};

/** DELETE /admin/cms/contents/:sectionKey */
export const deleteContent = async (req, res) => {
  const removed = await CmsContent.destroy({ where: { section_key: req.params.sectionKey } });
  if (!removed) throw ApiError.notFound('Content block not found.');
  return successResponse(res, { message: 'Content block deleted.' });
};

// ==========================================================================
// Settings
// ==========================================================================

/** GET /admin/settings?group= - secrets are masked. */
export const getSettings = async (req, res) => {
  invalidateSettingsCache();
  const settings = await getAdminSettings(req.query.group || null);
  return successResponse(res, { data: { groups: SETTING_GROUPS, settings, zoom_configured: await isZoomConfigured() } });
};

/** PUT /admin/settings/:group { key: value, ... } (general|payment|email|whatsapp|zoom) */
export const saveSettings = async (req, res) => {
  const group = req.params.group;
  if (!SETTING_GROUPS.includes(group)) throw ApiError.badRequest(`Unknown settings group. Use one of: ${SETTING_GROUPS.join(', ')}.`);
  const values = req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body;
  const updated = await updateSettings(values, req.user.id, group);
  return successResponse(res, {
    message: `${updated.length} setting(s) saved.`,
    data: { updated, settings: await getAdminSettings(group) }
  });
};

/** POST /admin/settings/email/test { to } */
export const testEmailSettings = async (req, res) => {
  const result = await sendMail({
    to: req.body.to || req.user.email,
    subject: 'ATV Academy - test email',
    text: 'Your email settings are working.',
    html: '<p>Your email settings are working.</p>'
  });
  if (!result.sent) throw new ApiError(502, `Email test failed: ${result.error}`);
  return successResponse(res, { message: `Test email sent to ${req.body.to || req.user.email}.` });
};

/** POST /admin/settings/whatsapp/test { to } */
export const testWhatsAppSettings = async (req, res) => {
  const result = await sendWhatsAppMessage({ to: req.body.to || req.user.phone, message: 'ATV Academy: your WhatsApp settings are working.' });
  if (!result.sent) throw new ApiError(502, `WhatsApp test failed: ${result.error}`);
  return successResponse(res, { message: 'Test WhatsApp message sent.', data: { message_id: result.messageId } });
};

/** POST /admin/settings/zoom/test - verifies credentials by requesting an OAuth token. */
export const testZoomSettings = async (req, res) => {
  if (!(await isZoomConfigured())) throw ApiError.badRequest('Zoom credentials are incomplete.');
  try {
    await getMeetingStartUrl('0');
  } catch (error) {
    // A 404 for meeting "0" means authentication succeeded.
    if (!/does not exist|not found|3001/i.test(error.message)) throw new ApiError(502, error.message);
  }
  return successResponse(res, { message: 'Zoom credentials are valid.' });
};

/**
 * POST /admin/settings/storage/test - checks Vimeo (videos) and Cloudflare R2 (files).
 * Each service is reported separately so one misconfiguration is easy to spot.
 */
export const testStorageSettings = async (req, res) => {
  const result = { driver: await getStorageDriver(), vimeo: null, r2: null };
  try {
    result.vimeo = (await isVimeoConfigured()) ? { configured: true, ...(await testVimeoConnection()) } : { configured: false, ok: false };
  } catch (error) {
    result.vimeo = { configured: true, ok: false, error: error.message };
  }
  try {
    result.r2 = (await isR2Configured()) ? { configured: true, ...(await testR2Connection()) } : { configured: false, ok: false };
  } catch (error) {
    result.r2 = { configured: true, ok: false, error: error.message };
  }
  const failed = [result.vimeo, result.r2].some((x) => x.configured && !x.ok);
  return successResponse(res, {
    statusCode: failed ? 502 : 200,
    message: failed ? 'One or more storage services failed the connection test.' : 'Storage settings checked.',
    data: result
  });
};

/** POST /admin/settings/woocommerce/test - verifies the store URL + REST API keys (reads one order). */
export const testWooCommerceSettings = async (req, res) => {
  const result = await testWooCommerceConnection();
  const webhookSecret = Boolean(await getSetting('woocommerce_webhook_secret'));
  return successResponse(res, {
    message: webhookSecret ? 'WooCommerce REST API connection works.' : 'WooCommerce REST API connection works, but no webhook secret is set - webhooks will be rejected.',
    data: { ...result, webhook_secret_configured: webhookSecret }
  });
};

export default {
  testStorageSettings,
  testWooCommerceSettings,
  listCommunityPosts,
  getCommunityPost,
  moderatePost,
  listCommunityComments,
  moderateComment,
  purgePost,
  listReviews,
  moderateReview,
  bulkModerateReviews,
  deleteReview,
  createCommunication,
  listCommunications,
  getCommunication,
  resendCommunication,
  sendNotification,
  listNotifications,
  getReport,
  createReportExport,
  listReportExports,
  downloadReportExport,
  listPages,
  createPage,
  getPage,
  updatePage,
  deletePage,
  listContents,
  getContent,
  upsertContent,
  deleteContent,
  getSettings,
  saveSettings,
  testEmailSettings,
  testWhatsAppSettings,
  testZoomSettings
};
