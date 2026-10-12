import cron from 'node-cron';
import { Op } from 'sequelize';
import { LiveClass, Course, Enrollment, Coupon, Order, Payment } from '../models/index.js';
import { notifyUsers, getCourseStudentIds } from './notificationService.js';
import { markAbsentees } from './liveClassService.js';
import { syncProcessingVideos } from './videoService.js';
import { getStorageDriver } from './storageDriver.js';
import { isVimeoConfigured } from './vimeoService.js';
import { isR2Configured } from './r2Service.js';
import { reconcileRecentOrders } from './woocommerceSyncService.js';
import { syncCoursesFromStore } from './woocommerceProductService.js';

const REMINDER_MINUTES = 30;
const AUTO_COMPLETE_AFTER_MINUTES = 30;
const STALE_ORDER_HOURS = 48;

const safely = (name, fn) => async () => {
  try {
    await fn();
  } catch (error) {
    console.error(`[Scheduler:${name}]`, error.message);
  }
};

/** Notifies students ~30 minutes before a live class starts (1-minute window, runs every minute). */
const sendLiveClassReminders = async () => {
  const from = new Date(Date.now() + REMINDER_MINUTES * 60 * 1000);
  const to = new Date(from.getTime() + 60 * 1000);
  const classes = await LiveClass.findAll({
    where: { status: 'scheduled', scheduled_start: { [Op.gte]: from, [Op.lt]: to } },
    include: [{ model: Course, as: 'course', attributes: ['title'] }]
  });
  for (const lc of classes) {
    await notifyUsers(await getCourseStudentIds(lc.course_id), {
      title: 'Live class starts soon',
      message: `"${lc.title}" (${lc.course?.title}) starts in ${REMINDER_MINUTES} minutes. Join from your Live Classes page.`,
      type: 'live_class_reminder',
      reference_type: 'live_class',
      reference_id: lc.id
    });
  }
};

/** Marks classes completed (and records absentees) once they have ended. */
const completeEndedClasses = async () => {
  const classes = await LiveClass.findAll({
    where: {
      status: { [Op.in]: ['scheduled', 'live'] },
      scheduled_end: { [Op.lt]: new Date(Date.now() - AUTO_COMPLETE_AFTER_MINUTES * 60 * 1000) }
    }
  });
  for (const lc of classes) {
    await lc.update({ status: 'completed' });
    await markAbsentees(lc);
  }
};

const expireEnrollments = async () => {
  await Enrollment.update({ status: 'expired' }, { where: { status: 'active', expires_at: { [Op.ne]: null, [Op.lt]: new Date() } } });
};

const expireCoupons = async () => {
  await Coupon.update({ status: 'expired' }, { where: { status: 'active', expires_at: { [Op.lt]: new Date() } } });
};

/**
 * Pending LMS-checkout orders never paid are cancelled after 48h so reports stay clean.
 * WooCommerce mirrors are left alone: their status always follows the store.
 */
const cancelStaleOrders = async () => {
  const cutoff = new Date(Date.now() - STALE_ORDER_HOURS * 60 * 60 * 1000);
  const stale = await Order.findAll({ where: { status: 'pending', source: 'lms', created_at: { [Op.lt]: cutoff } }, attributes: ['id'] });
  if (!stale.length) return;
  const ids = stale.map((o) => o.id);
  await Order.update({ status: 'cancelled' }, { where: { id: { [Op.in]: ids } } });
  await Payment.update({ status: 'failed' }, { where: { order_id: { [Op.in]: ids }, status: { [Op.in]: ['created', 'pending'] } } });
};

/** Production should store media on Vimeo / Cloudflare R2, not on the API server's disk. */
const warnIfLocalStorageInProduction = async () => {
  if (process.env.NODE_ENV !== 'production') return;
  const driver = await getStorageDriver();
  const [vimeo, r2] = await Promise.all([isVimeoConfigured(), isR2Configured()]);
  if (driver === 'local' || !vimeo || !r2) {
    console.warn(
      `[Storage]: driver=${driver}, Vimeo ${vimeo ? 'configured' : 'NOT configured'}, ` +
        `R2 ${r2 ? 'configured' : 'NOT configured'} - uploads will fall back to this server's disk.`
    );
  }
};

export const startScheduler = () => {
  if (process.env.DISABLE_SCHEDULER === 'true') return;
  cron.schedule('* * * * *', safely('live-class-reminders', sendLiveClassReminders));
  cron.schedule('*/10 * * * *', safely('complete-live-classes', completeEndedClasses));
  cron.schedule('15 * * * *', safely('expire-enrollments', expireEnrollments));
  cron.schedule('20 * * * *', safely('expire-coupons', expireCoupons));
  cron.schedule('30 3 * * *', safely('cancel-stale-orders', cancelStaleOrders));
  // Picks up Vimeo transcoding results (Vimeo videos start as "processing").
  cron.schedule('*/5 * * * *', safely('sync-vimeo-videos', syncProcessingVideos));
  // Re-syncs WooCommerce orders modified since the last run (missed / failed webhooks).
  cron.schedule('*/10 * * * *', safely('woocommerce-reconcile', reconcileRecentOrders));
  // Course price / publish status from linked store products (backs up the product webhook).
  cron.schedule('40 * * * *', safely('woocommerce-product-sync', syncCoursesFromStore));
  safely('storage-check', warnIfLocalStorageInProduction)();
  console.log('[Scheduler]: background jobs started');
};

export default { startScheduler };
