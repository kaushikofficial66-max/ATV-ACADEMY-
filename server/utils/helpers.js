import crypto from 'crypto';

export const slugify = (text = '') =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 250);

/**
 * Builds a slug that is unique for `Model.slug`, appending -2, -3, ... if needed.
 */
export const uniqueSlug = async (Model, text, excludeId = null) => {
  const base = slugify(text) || 'item';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await Model.findOne({ where: { slug: candidate }, attributes: ['id'] });
    if (!existing || (excludeId && Number(existing.id) === Number(excludeId))) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
};

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/** One-way hash for tokens stored in the DB (reset / verification links). */
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

export const toBool = (value) => value === true || value === 'true' || value === 1 || value === '1';

/** Picks only the listed keys that are present (not undefined) in `source`. */
export const pick = (source = {}, keys = []) =>
  keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

export const fullName = (user) => (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '');

export const generateOrderNumber = () =>
  `ATV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

export const generateCertificateNumber = () =>
  `ATV-CERT-${new Date().getFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

/** Accepts a JSON string or array; returns an array (used for multipart form fields). */
export const parseJsonArray = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
};

export const startOfDay = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const endOfDay = (d) => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
};
