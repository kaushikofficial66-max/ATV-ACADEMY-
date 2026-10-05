import { Op } from 'sequelize';
import { startOfDay, endOfDay } from './helpers.js';

const MAX_LIMIT = 100;

/**
 * Reads ?page=&limit= and returns Sequelize limit/offset plus a meta builder.
 */
export const getPagination = (query = {}, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return {
    page,
    limit,
    offset,
    meta: (total) => ({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  };
};

/**
 * Builds a created_at style range filter from ?from=&to= (YYYY-MM-DD).
 */
export const dateRange = (query = {}, field = 'created_at') => {
  const range = {};
  if (query.from) range[Op.gte] = startOfDay(query.from);
  if (query.to) range[Op.lte] = endOfDay(query.to);
  return Object.getOwnPropertySymbols(range).length ? { [field]: range } : {};
};

/** Only allow sorting by whitelisted columns: ?sort=created_at&order=asc */
export const getSort = (query = {}, allowed = ['created_at'], fallback = ['created_at', 'DESC']) => {
  const field = allowed.includes(query.sort) ? query.sort : fallback[0];
  const direction = String(query.order || '').toUpperCase() === 'ASC' ? 'ASC' : fallback[1];
  return [[field, direction]];
};

export default { getPagination, dateRange, getSort };
