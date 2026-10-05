import fs from 'fs';
import path from 'path';
import { QueryTypes } from 'sequelize';
import { sequelize, ReportExport } from '../models/index.js';
import { UPLOAD_ROOT } from '../middlewares/upload.js';
import { toCsv } from '../utils/csv.js';
import { startOfDay, endOfDay, toMoney } from '../utils/helpers.js';
import ApiError from '../utils/ApiError.js';
import { persistGeneratedFile } from './storageDriver.js';

export const REPORT_TYPES = ['student', 'tutor', 'course', 'sales'];

const dateClause = (filters, column, params) => {
  let sql = '';
  if (filters.from) {
    sql += ` AND ${column} >= :from`;
    params.from = startOfDay(filters.from);
  }
  if (filters.to) {
    sql += ` AND ${column} <= :to`;
    params.to = endOfDay(filters.to);
  }
  return sql;
};

const studentReport = async (filters) => {
  const params = {};
  let where = "r.name = 'student'";
  where += dateClause(filters, 'u.created_at', params);
  if (filters.status) {
    where += ' AND u.status = :status';
    params.status = filters.status;
  }
  if (filters.course_id) {
    where += ' AND EXISTS (SELECT 1 FROM enrollments ex WHERE ex.user_id = u.id AND ex.course_id = :course_id)';
    params.course_id = filters.course_id;
  }
  const rows = await sequelize.query(
    `SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name, u.email, u.phone, u.status,
            u.email_verified_at, u.created_at AS registered_at, u.last_login_at,
            (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.status <> 'cancelled') AS enrollments,
            (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.status = 'completed') AS completed_courses,
            (SELECT ROUND(AVG(e.completion_percentage), 2) FROM enrollments e WHERE e.user_id = u.id AND e.status <> 'cancelled') AS avg_completion,
            (SELECT COUNT(*) FROM certificates c WHERE c.user_id = u.id AND c.status IN ('approved','issued')) AS certificates,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS total_spent
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE ${where}
      ORDER BY u.created_at DESC`,
    { replacements: params, type: QueryTypes.SELECT }
  );
  return {
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'registered_at', label: 'Registered' },
      { key: 'last_login_at', label: 'Last Login' },
      { key: 'enrollments', label: 'Enrollments' },
      { key: 'completed_courses', label: 'Completed Courses' },
      { key: 'avg_completion', label: 'Avg Completion %' },
      { key: 'certificates', label: 'Certificates' },
      { key: 'total_spent', label: 'Total Spent' }
    ],
    rows,
    summary: {
      total_students: rows.length,
      active_students: rows.filter((r) => r.status === 'active').length,
      total_enrollments: rows.reduce((s, r) => s + Number(r.enrollments), 0),
      total_revenue: toMoney(rows.reduce((s, r) => s + Number(r.total_spent), 0))
    }
  };
};

const tutorReport = async (filters) => {
  const params = {};
  let where = "r.name = 'tutor'";
  where += dateClause(filters, 'u.created_at', params);
  if (filters.status) {
    where += ' AND u.status = :status';
    params.status = filters.status;
  }
  const rows = await sequelize.query(
    `SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name, u.email, u.phone, u.status, u.created_at AS registered_at,
            (SELECT COUNT(*) FROM course_tutors ct WHERE ct.tutor_id = u.id) AS courses,
            (SELECT COUNT(*) FROM course_tutors ct JOIN courses c ON c.id = ct.course_id WHERE ct.tutor_id = u.id AND c.status = 'published') AS published_courses,
            (SELECT COUNT(DISTINCT e.user_id) FROM course_tutors ct JOIN enrollments e ON e.course_id = ct.course_id
              WHERE ct.tutor_id = u.id AND e.status IN ('active','completed')) AS students,
            (SELECT COALESCE(SUM(oi.final_amount), 0) FROM course_tutors ct JOIN order_items oi ON oi.course_id = ct.course_id
              JOIN orders o ON o.id = oi.order_id WHERE ct.tutor_id = u.id AND o.status = 'paid') AS course_revenue,
            (SELECT ROUND(AVG(rv.rating), 2) FROM course_tutors ct JOIN reviews rv ON rv.course_id = ct.course_id
              WHERE ct.tutor_id = u.id AND rv.status = 'approved') AS avg_rating,
            (SELECT COUNT(*) FROM live_classes lc WHERE lc.tutor_id = u.id) AS live_classes
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE ${where}
      ORDER BY u.created_at DESC`,
    { replacements: params, type: QueryTypes.SELECT }
  );
  return {
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'registered_at', label: 'Registered' },
      { key: 'courses', label: 'Courses' },
      { key: 'published_courses', label: 'Published Courses' },
      { key: 'students', label: 'Students' },
      { key: 'course_revenue', label: 'Course Revenue' },
      { key: 'avg_rating', label: 'Avg Rating' },
      { key: 'live_classes', label: 'Live Classes' }
    ],
    rows,
    summary: {
      total_tutors: rows.length,
      active_tutors: rows.filter((r) => r.status === 'active').length,
      pending_tutors: rows.filter((r) => r.status === 'pending').length
    }
  };
};

const courseReport = async (filters) => {
  const params = {};
  let where = '1=1';
  where += dateClause(filters, 'c.created_at', params);
  if (filters.status) {
    where += ' AND c.status = :status';
    params.status = filters.status;
  }
  if (filters.category_id) {
    where += ' AND c.category_id = :category_id';
    params.category_id = filters.category_id;
  }
  if (filters.tutor_id) {
    where += ' AND EXISTS (SELECT 1 FROM course_tutors ctx WHERE ctx.course_id = c.id AND ctx.tutor_id = :tutor_id)';
    params.tutor_id = filters.tutor_id;
  }
  const rows = await sequelize.query(
    `SELECT c.id, c.title, cat.name AS category, c.status, c.price, c.discount_price, c.level, c.created_at, c.published_at,
            (SELECT GROUP_CONCAT(CONCAT_WS(' ', t.first_name, t.last_name) SEPARATOR ', ')
               FROM course_tutors ct JOIN users t ON t.id = ct.tutor_id WHERE ct.course_id = c.id) AS tutors,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status IN ('active','completed')) AS students,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'completed') AS completions,
            (SELECT ROUND(AVG(e.completion_percentage), 2) FROM enrollments e WHERE e.course_id = c.id AND e.status IN ('active','completed')) AS avg_completion,
            (SELECT COALESCE(SUM(oi.final_amount), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.course_id = c.id AND o.status = 'paid') AS revenue,
            (SELECT ROUND(AVG(rv.rating), 2) FROM reviews rv WHERE rv.course_id = c.id AND rv.status = 'approved') AS avg_rating,
            (SELECT COUNT(*) FROM reviews rv WHERE rv.course_id = c.id AND rv.status = 'approved') AS reviews,
            (SELECT COUNT(*) FROM certificates ce WHERE ce.course_id = c.id AND ce.status IN ('approved','issued')) AS certificates
       FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE ${where}
      ORDER BY revenue DESC, c.created_at DESC`,
    { replacements: params, type: QueryTypes.SELECT }
  );
  return {
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      { key: 'tutors', label: 'Tutors' },
      { key: 'status', label: 'Status' },
      { key: 'price', label: 'Price' },
      { key: 'discount_price', label: 'Discount Price' },
      { key: 'students', label: 'Students' },
      { key: 'completions', label: 'Completions' },
      { key: 'avg_completion', label: 'Avg Completion %' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'avg_rating', label: 'Avg Rating' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'certificates', label: 'Certificates' },
      { key: 'created_at', label: 'Created' }
    ],
    rows,
    summary: {
      total_courses: rows.length,
      published_courses: rows.filter((r) => r.status === 'published').length,
      total_students: rows.reduce((s, r) => s + Number(r.students), 0),
      total_revenue: toMoney(rows.reduce((s, r) => s + Number(r.revenue), 0))
    }
  };
};

const salesReport = async (filters) => {
  const params = {};
  let where = '1=1';
  where += dateClause(filters, 'o.created_at', params);
  if (filters.status) {
    where += ' AND o.status = :status';
    params.status = filters.status;
  }
  if (filters.course_id) {
    where += ' AND EXISTS (SELECT 1 FROM order_items oix WHERE oix.order_id = o.id AND oix.course_id = :course_id)';
    params.course_id = filters.course_id;
  }
  const rows = await sequelize.query(
    `SELECT o.id, o.order_number, o.created_at, o.status, CONCAT_WS(' ', u.first_name, u.last_name) AS customer, u.email,
            (SELECT GROUP_CONCAT(oi.course_title SEPARATOR ' | ') FROM order_items oi WHERE oi.order_id = o.id) AS courses,
            o.subtotal, o.discount_amount, o.tax_amount, o.total_amount, o.currency, cp.code AS coupon_code,
            (SELECT p.payment_method FROM payments p WHERE p.order_id = o.id AND p.status = 'success' ORDER BY p.id DESC LIMIT 1) AS payment_method,
            (SELECT p.gateway_payment_id FROM payments p WHERE p.order_id = o.id AND p.status = 'success' ORDER BY p.id DESC LIMIT 1) AS transaction_id,
            (SELECT p.paid_at FROM payments p WHERE p.order_id = o.id AND p.status = 'success' ORDER BY p.id DESC LIMIT 1) AS paid_at
       FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN coupons cp ON cp.id = o.coupon_id
      WHERE ${where}
      ORDER BY o.created_at DESC`,
    { replacements: params, type: QueryTypes.SELECT }
  );
  const paid = rows.filter((r) => r.status === 'paid');
  const daily = {};
  paid.forEach((r) => {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    daily[day] = toMoney((daily[day] || 0) + Number(r.total_amount));
  });
  return {
    columns: [
      { key: 'order_number', label: 'Order #' },
      { key: 'created_at', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'courses', label: 'Courses' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discount_amount', label: 'Discount' },
      { key: 'coupon_code', label: 'Coupon' },
      { key: 'tax_amount', label: 'Tax' },
      { key: 'total_amount', label: 'Total' },
      { key: 'currency', label: 'Currency' },
      { key: 'status', label: 'Status' },
      { key: 'payment_method', label: 'Payment Method' },
      { key: 'transaction_id', label: 'Transaction ID' },
      { key: 'paid_at', label: 'Paid At' }
    ],
    rows,
    summary: {
      total_orders: rows.length,
      paid_orders: paid.length,
      gross_revenue: toMoney(paid.reduce((s, r) => s + Number(r.subtotal), 0)),
      total_discounts: toMoney(paid.reduce((s, r) => s + Number(r.discount_amount), 0)),
      total_tax: toMoney(paid.reduce((s, r) => s + Number(r.tax_amount), 0)),
      net_revenue: toMoney(paid.reduce((s, r) => s + Number(r.total_amount), 0)),
      refunded_orders: rows.filter((r) => r.status === 'refunded').length,
      daily_revenue: Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenue]) => ({ date, revenue }))
    }
  };
};

const BUILDERS = { student: studentReport, tutor: tutorReport, course: courseReport, sales: salesReport };

export const buildReport = async (type, filters = {}) => {
  if (!BUILDERS[type]) throw ApiError.badRequest(`Unknown report type. Use one of: ${REPORT_TYPES.join(', ')}.`);
  return BUILDERS[type](filters);
};

/** Generates a CSV export, stores it privately and records it in report_exports. */
export const exportReport = async (type, filters, userId) => {
  if (!BUILDERS[type]) throw ApiError.badRequest(`Unknown report type. Use one of: ${REPORT_TYPES.join(', ')}.`);
  const record = await ReportExport.create({ generated_by: userId, report_type: type, filters, status: 'processing' });
  try {
    const { columns, rows } = await buildReport(type, filters);
    const fileName = `${type}-report-${record.id}-${Date.now()}.csv`;
    const absPath = path.join(UPLOAD_ROOT, 'reports', fileName);
    await fs.promises.writeFile(absPath, `﻿${toCsv(columns, rows)}`, 'utf8');
    const storedKey = await persistGeneratedFile(absPath, 'reports', fileName, 'text/csv');
    await record.update({ status: 'completed', file_url: storedKey, completed_at: new Date() });
  } catch (error) {
    await record.update({ status: 'failed', completed_at: new Date() });
    throw error;
  }
  return record;
};

export default { buildReport, exportReport, REPORT_TYPES };
