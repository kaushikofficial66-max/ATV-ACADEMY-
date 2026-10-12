import crypto from 'crypto';
import axios from 'axios';
import { getGroupSettings, getSetting } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

/**
 * WooCommerce (antarikshtv.com) API client and webhook verification.
 * WooCommerce is the commerce source of truth; this module only reads from it.
 * Credentials come from Admin > Settings > Woocommerce (or WOOCOMMERCE_* env)
 * and are never logged.
 */

const API_PREFIX = '/wp-json/wc/v3';

export const WC_ORDER_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'checkout-draft', 'trash'];

const trimSlash = (url) => String(url || '').trim().replace(/\/+$/, '');

export const getStoreUrl = async () => trimSlash(await getSetting('woocommerce_url'));

export const isWooCommerceEnabled = async () => Boolean(await getSetting('woocommerce_enabled'));

export const isApiConfigured = async () => {
  const cfg = await getGroupSettings('woocommerce');
  return Boolean(cfg.woocommerce_url && cfg.woocommerce_consumer_key && cfg.woocommerce_consumer_secret);
};

/** WooCommerce statuses that grant course access (default: processing, completed). */
export const getPaidStatuses = async () =>
  String(await getSetting('woocommerce_paid_statuses'))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Store link that puts the course's product in the WooCommerce cart, or null when unmapped. */
export const buildBuyUrl = async (productId) => {
  const store = await getStoreUrl();
  if (!productId || !store) return null;
  const template = (await getSetting('woocommerce_buy_url_template')) || '{store_url}/checkout/?add-to-cart={product_id}';
  return template.replace('{store_url}', store).replace('{product_id}', encodeURIComponent(String(productId)));
};

/** "My account" order page on the store, shown next to mirrored orders. */
export const buildOrderUrl = async (wcOrderId) => {
  const store = await getStoreUrl();
  return store && wcOrderId ? `${store}/my-account/view-order/${encodeURIComponent(String(wcOrderId))}/` : null;
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Verifies X-WC-Webhook-Signature: base64(HMAC-SHA256(raw body, webhook secret)).
 * Returns false when no secret is configured, so an unconfigured install never
 * accepts unsigned requests.
 */
export const verifyWebhookSignature = async (rawBody, signature) => {
  const secret = await getSetting('woocommerce_webhook_secret');
  if (!secret || !signature || !rawBody || !rawBody.length) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqual(expected, signature);
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * X-WC-Webhook-Source must be the configured store (defence in depth: stops a
 * staging store that shares the secret from enrolling students in production).
 * Passes when either side is unknown.
 */
export const isTrustedSource = async (sourceHeader) => {
  const store = await getStoreUrl();
  if (!store || !sourceHeader) return true;
  return hostOf(store) === hostOf(sourceHeader);
};

/**
 * Calls the WooCommerce REST API (v3). Keys go in a Basic auth header; some
 * Apache / CGI hosts strip that header, so a 401 is retried once with the keys
 * as query parameters (WooCommerce's documented fallback, HTTPS only).
 * Errors become ApiError 404 / 502 with WooCommerce's error code in `wcCode`.
 */
const wcRequest = async (method, path, { params = {}, data } = {}) => {
  const cfg = await getGroupSettings('woocommerce');
  const store = trimSlash(cfg.woocommerce_url);
  if (!store || !cfg.woocommerce_consumer_key || !cfg.woocommerce_consumer_secret) {
    throw new ApiError(503, 'WooCommerce REST API is not configured. Add the store URL and API keys in Admin > Settings > Woocommerce.');
  }
  // The keys travel with every request, so only allow HTTPS (or a local dev store).
  if (!store.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(store)) {
    throw new ApiError(503, 'WooCommerce store URL must use https:// for REST API access.');
  }
  const base = { method, url: `${store}${API_PREFIX}${path}`, data, headers: { Accept: 'application/json' }, timeout: 20000 };
  const keys = { consumer_key: cfg.woocommerce_consumer_key, consumer_secret: cfg.woocommerce_consumer_secret };
  try {
    let response;
    try {
      response = await axios.request({ ...base, params, auth: { username: keys.consumer_key, password: keys.consumer_secret } });
    } catch (error) {
      if (error.response?.status !== 401 || !store.startsWith('https://')) throw error;
      response = await axios.request({ ...base, params: { ...params, ...keys } });
    }
    return { data: response.data, headers: response.headers || {} };
  } catch (error) {
    const wcCode = error.response?.data?.code || null;
    // WordPress answers rest_no_route when the WooCommerce REST API is not there at all.
    if (error.response?.status === 404 && wcCode === 'rest_no_route') {
      throw Object.assign(new ApiError(502, `WooCommerce is not installed or not active at ${store} (no /wp-json/wc/v3 API). Check the store URL in Admin > Settings > Woocommerce.`), { wcCode });
    }
    if (error.response?.status === 404) throw Object.assign(ApiError.notFound(`WooCommerce resource not found: ${path}`), { wcCode });
    const msg = error.response?.data?.message || error.code || error.message;
    throw Object.assign(new ApiError(502, `WooCommerce API error: ${msg}`), { wcCode });
  }
};

export const getOrder = async (orderId) => (await wcRequest('get', `/orders/${encodeURIComponent(orderId)}`)).data;

/** Refunds of an order incl. refunded line items (negative quantities). */
export const getOrderRefunds = async (orderId) =>
  (await wcRequest('get', `/orders/${encodeURIComponent(orderId)}/refunds`, { params: { per_page: 100 } })).data;

/** One page of orders modified after `modifiedAfter` (oldest first), plus the total page count. */
export const listOrders = async ({ modifiedAfter, page = 1, perPage = 50 } = {}) => {
  const { data, headers } = await wcRequest('get', '/orders', {
    params: {
      ...(modifiedAfter && { modified_after: new Date(modifiedAfter).toISOString().slice(0, 19), dates_are_gmt: true }),
      orderby: 'modified',
      order: 'asc',
      page,
      per_page: perPage
    }
  });
  return { orders: data, totalPages: Number(headers['x-wp-totalpages'] || 1) };
};

// --- Products (write access needed only for createProduct / updateProduct / trashProduct) ---

/** Products by id (max 100 per call). Trashed / deleted products are not returned. */
export const getProductsByIds = async (ids) =>
  ids.length ? (await wcRequest('get', '/products', { params: { include: ids.join(','), per_page: 100, status: 'any' } })).data : [];

export const findProductBySku = async (sku) => (await wcRequest('get', '/products', { params: { sku, status: 'any' } })).data[0] || null;

export const createProduct = async (product) => (await wcRequest('post', '/products', { data: product })).data;

export const updateProduct = async (productId, changes) => (await wcRequest('put', `/products/${encodeURIComponent(productId)}`, { data: changes })).data;

/** Moves a product to the WordPress trash (restorable there). */
export const trashProduct = async (productId) => (await wcRequest('delete', `/products/${encodeURIComponent(productId)}`)).data;

/** Checks the API keys by reading one order. */
export const testConnection = async () => {
  await wcRequest('get', '/orders', { params: { per_page: 1 } });
  return { ok: true, store_url: await getStoreUrl() };
};

export default {
  WC_ORDER_STATUSES,
  getStoreUrl,
  isWooCommerceEnabled,
  isApiConfigured,
  getPaidStatuses,
  buildBuyUrl,
  buildOrderUrl,
  verifyWebhookSignature,
  isTrustedSource,
  getOrder,
  getOrderRefunds,
  listOrders,
  getProductsByIds,
  findProductBySku,
  createProduct,
  updateProduct,
  trashProduct,
  testConnection
};
