import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { API_ORIGIN } from '@/lib/config';

/** Merge Tailwind class names, resolving conflicts (`cn('p-2', cond && 'p-4')`). */
export const cn = (...inputs) => twMerge(clsx(inputs));

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** API money values arrive as strings ("499.00") or numbers. */
export const formatPrice = (value) => {
  const n = Number(value || 0);
  return n === 0 ? 'Free' : inr.format(n);
};

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value || 0));

export const formatDate = (value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  value ? new Date(value).toLocaleDateString('en-IN', opts) : '-';

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export const formatDuration = (seconds) => {
  const s = Math.round(Number(seconds || 0));
  if (!s) return '-';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const fullName = (user) => (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '');

export const initials = (user) => fullName(user).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';

/**
 * Absolute URL for an asset returned by the API: public R2 / Vimeo URLs are
 * kept, local paths like "/uploads/images/x.png" get the API origin.
 */
export const assetUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
};

/** Human label for snake_case statuses ("pending_approval" -> "Pending approval"). */
export const humanize = (value) => (value ? String(value).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
