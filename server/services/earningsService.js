import { Op, fn, col, literal } from 'sequelize';
import { OrderItem, Order, Course, CourseTutor, TutorPayout } from '../models/index.js';
import { getSetting } from './settingsService.js';
import { toMoney } from '../utils/helpers.js';
import { dateRange } from '../utils/pagination.js';

/**
 * Tutor earnings model:
 *   course revenue  = SUM(order_items.final_amount) for paid orders
 *   tutor share     = revenue x tutor_revenue_share_percent (setting, default 70%)
 *   split equally between all tutors assigned to the course
 *   balance         = total earned - payouts with status "paid"
 */
export const getTutorEarnings = async (tutorId, query = {}) => {
  const sharePercent = Number(await getSetting('tutor_revenue_share_percent')) || 0;

  const assignments = await CourseTutor.findAll({
    where: { tutor_id: tutorId },
    include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url'] }]
  });
  const courseIds = assignments.map((a) => a.course_id);
  if (!courseIds.length) {
    return { share_percent: sharePercent, total_revenue: 0, total_earnings: 0, total_paid_out: 0, pending_payouts: 0, balance: 0, courses: [], monthly: [] };
  }

  const tutorCounts = await CourseTutor.findAll({
    attributes: ['course_id', [fn('COUNT', col('id')), 'count']],
    where: { course_id: { [Op.in]: courseIds } },
    group: ['course_id'],
    raw: true
  });
  const tutorsPerCourse = Object.fromEntries(tutorCounts.map((r) => [r.course_id, Number(r.count)]));

  const orderWhere = { status: 'paid', ...dateRange(query, 'created_at') };
  const perCourse = await OrderItem.findAll({
    attributes: ['course_id', [fn('SUM', col('final_amount')), 'revenue'], [fn('COUNT', col('OrderItem.id')), 'sales']],
    where: { course_id: { [Op.in]: courseIds } },
    include: [{ model: Order, as: 'order', attributes: [], where: orderWhere }],
    group: ['course_id'],
    raw: true
  });
  const revenueByCourse = Object.fromEntries(perCourse.map((r) => [r.course_id, { revenue: Number(r.revenue), sales: Number(r.sales) }]));

  const courses = assignments.map((a) => {
    const revenue = revenueByCourse[a.course_id]?.revenue || 0;
    const earnings = toMoney((revenue * sharePercent) / 100 / (tutorsPerCourse[a.course_id] || 1));
    return {
      course: a.course,
      is_primary: a.is_primary,
      sales: revenueByCourse[a.course_id]?.sales || 0,
      revenue: toMoney(revenue),
      co_tutors: (tutorsPerCourse[a.course_id] || 1) - 1,
      earnings
    };
  });

  const monthlyRows = await OrderItem.findAll({
    attributes: [
      'course_id',
      [fn('DATE_FORMAT', col('order.created_at'), '%Y-%m'), 'month'],
      [fn('SUM', col('final_amount')), 'revenue']
    ],
    where: { course_id: { [Op.in]: courseIds } },
    include: [{ model: Order, as: 'order', attributes: [], where: orderWhere }],
    group: ['course_id', literal('month')],
    raw: true
  });
  const monthlyMap = {};
  monthlyRows.forEach((r) => {
    const share = (Number(r.revenue) * sharePercent) / 100 / (tutorsPerCourse[r.course_id] || 1);
    monthlyMap[r.month] = toMoney((monthlyMap[r.month] || 0) + share);
  });
  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, earnings]) => ({ month, earnings }));

  const payouts = await TutorPayout.findAll({
    attributes: ['status', [fn('SUM', col('amount')), 'total']],
    where: { tutor_id: tutorId },
    group: ['status'],
    raw: true
  });
  const paid = toMoney(payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.total), 0));
  const pending = toMoney(payouts.filter((p) => ['pending', 'processing'].includes(p.status)).reduce((s, p) => s + Number(p.total), 0));

  const totalRevenue = toMoney(courses.reduce((s, c) => s + c.revenue, 0));
  const totalEarnings = toMoney(courses.reduce((s, c) => s + c.earnings, 0));

  return {
    share_percent: sharePercent,
    total_revenue: totalRevenue,
    total_earnings: totalEarnings,
    total_paid_out: paid,
    pending_payouts: pending,
    balance: toMoney(totalEarnings - paid - pending),
    courses: courses.sort((a, b) => b.earnings - a.earnings),
    monthly
  };
};

export default { getTutorEarnings };
