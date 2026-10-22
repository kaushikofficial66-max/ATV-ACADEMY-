import { Setting } from '../models/index.js';

/**
 * Known settings, grouped as in Admin > Settings. Each value resolves as:
 * DB row (admin-managed) -> environment variable -> default.
 * `secret` values are never returned unmasked by the API; `public` values are
 * exposed to the website via GET /public/settings.
 */
export const SETTING_DEFINITIONS = {
  // General
  site_name: { group: 'general', default: 'ATV Academy', public: true },
  site_tagline: { group: 'general', default: 'Learn. Build. Grow.', public: true },
  site_logo_url: { group: 'general', default: '', public: true },
  support_email: { group: 'general', default: '', public: true },
  support_phone: { group: 'general', default: '', public: true },
  currency: { group: 'general', default: 'INR', public: true },
  timezone: { group: 'general', default: 'Asia/Kolkata', public: true },
  frontend_url: { group: 'general', env: 'FRONTEND_URL', default: 'http://localhost:3000' },
  // Public URL of this API (used in emailed links). Empty = the host of the incoming request.
  api_url: { group: 'general', env: 'API_URL', default: '' },
  // Optional frontend page to land on after clicking the email verification link
  // (receives ?status=verified|already_verified|expired|invalid). Empty = the API shows its own page.
  email_verification_redirect_url: { group: 'general', env: 'EMAIL_VERIFICATION_REDIRECT_URL', default: '' },
  require_email_verification: { group: 'general', default: 'false', type: 'boolean' },
  auto_approve_tutors: { group: 'general', default: 'false', type: 'boolean' },
  tutor_revenue_share_percent: { group: 'general', default: '70', type: 'number' },
  // A lecture is ticked as watched once this % of its video is watched (curriculum checkmarks / resume).
  lecture_completion_threshold: { group: 'general', default: '90', type: 'number' },
  // 90% completion rule: each recorded-video play / live-class join adds this much progress...
  progress_increment_percent: { group: 'general', default: '10', type: 'number' },
  // ...up to this cap (the project unlocks here; only project approval takes the course to 100%).
  progress_auto_cap_percent: { group: 'general', default: '90', type: 'number' },
  // Repeated plays/joins of the same video or class within this window count once (0 = every click counts).
  progress_activity_cooldown_minutes: { group: 'general', default: '10', type: 'number' },
  live_class_join_window_minutes: { group: 'general', default: '15', type: 'number' },
  community_moderation: { group: 'general', default: 'false', type: 'boolean' },
  auto_approve_reviews: { group: 'general', default: 'false', type: 'boolean' },

  // Payment
  payment_gateway: { group: 'payment', default: 'razorpay', public: true },
  razorpay_key_id: { group: 'payment', env: 'RAZORPAY_KEY_ID', default: '', public: true },
  razorpay_key_secret: { group: 'payment', env: 'RAZORPAY_KEY_SECRET', default: '', secret: true },
  razorpay_webhook_secret: { group: 'payment', env: 'RAZORPAY_WEBHOOK_SECRET', default: '', secret: true },
  tax_percent: { group: 'payment', default: '0', type: 'number', public: true },

  // WooCommerce (antarikshtv.com) - the commerce source of truth. When enabled, paid
  // courses are bought on the store; its order webhook enrolls students here.
  woocommerce_enabled: { group: 'woocommerce', env: 'WOOCOMMERCE_ENABLED', default: 'false', type: 'boolean', public: true },
  woocommerce_url: { group: 'woocommerce', env: 'WOOCOMMERCE_URL', default: '', public: true },
  // REST API keys (WooCommerce > Settings > Advanced > REST API). Permission "Read/Write" to
  // create draft products for new courses; "Read" is enough for order reconciliation,
  // partial refunds, "Resync" and price sync. Order webhooks work without them.
  woocommerce_consumer_key: { group: 'woocommerce', env: 'WOOCOMMERCE_CONSUMER_KEY', default: '', secret: true },
  woocommerce_consumer_secret: { group: 'woocommerce', env: 'WOOCOMMERCE_CONSUMER_SECRET', default: '', secret: true },
  // Secret entered on each WooCommerce webhook (signs X-WC-Webhook-Signature).
  woocommerce_webhook_secret: { group: 'woocommerce', env: 'WOOCOMMERCE_WEBHOOK_SECRET', default: '', secret: true },
  // Shared secret for POST /webhooks/atv-site (paid orders pushed by the antarikshtv.com checkout).
  atv_site_webhook_secret: { group: 'woocommerce', env: 'ATV_SITE_WEBHOOK_SECRET', default: '', secret: true },
  // Order statuses that grant course access (comma-separated).
  woocommerce_paid_statuses: { group: 'woocommerce', env: 'WOOCOMMERCE_PAID_STATUSES', default: 'processing,completed' },
  // Where "Buy" sends students. Placeholders: {store_url}, {product_id}.
  woocommerce_buy_url_template: { group: 'woocommerce', default: '{store_url}/checkout/?add-to-cart={product_id}' },
  // Periodically pulls recently modified orders via the REST API (catches missed webhooks).
  woocommerce_reconcile_enabled: { group: 'woocommerce', default: 'true', type: 'boolean' },
  // Creating a paid course creates a draft WooCommerce product (needs Read/Write keys).
  woocommerce_auto_create_products: { group: 'woocommerce', env: 'WOOCOMMERCE_AUTO_CREATE_PRODUCTS', default: 'true', type: 'boolean' },

  // Email
  mail_host: { group: 'email', env: 'MAIL_HOST', default: '' },
  mail_port: { group: 'email', env: 'MAIL_PORT', default: '587', type: 'number' },
  mail_secure: { group: 'email', env: 'MAIL_SECURE', default: 'false', type: 'boolean' },
  mail_user: { group: 'email', env: 'MAIL_USER', default: '' },
  mail_password: { group: 'email', env: 'MAIL_PASSWORD', default: '', secret: true },
  mail_from_name: { group: 'email', env: 'MAIL_FROM_NAME', default: 'ATV Academy' },
  mail_from_address: { group: 'email', env: 'MAIL_FROM_ADDRESS', default: '' },

  // GST invoice emailed to the buyer after a successful payment. Course prices are GST-inclusive: the invoice
  // splits the paid amount into taxable value + CGST/SGST (buyer in the seller's state) or IGST (other states).
  invoice_enabled: { group: 'invoice', default: 'true', type: 'boolean' },
  invoice_company_name: { group: 'invoice', default: 'Antariksh TV' },
  invoice_company_address: { group: 'invoice', default: 'Flat No. 201/202, Shyam Kunj, Devnagar, Baradwari, Sakchi, Jamshedpur, Jharkhand 831001' },
  invoice_gstin: { group: 'invoice', default: '' },
  // GST state code of the seller (20 = Jharkhand, 27 = Maharashtra, 07 = Delhi ...).
  invoice_state_code: { group: 'invoice', default: '20' },
  invoice_gst_rate: { group: 'invoice', default: '18', type: 'number' },
  // 999293 = commercial training and coaching services.
  invoice_sac_code: { group: 'invoice', default: '999293' },
  invoice_number_prefix: { group: 'invoice', default: 'ATV' },
  // Logo printed in the invoice header (PNG or JPG, public URL). Empty = the site logo (General), then the company name as text.
  invoice_show_logo: { group: 'invoice', default: 'true', type: 'boolean' },
  invoice_logo_url: { group: 'invoice', default: 'https://antarikshtv.com/wp-content/uploads/2026/06/Logo.png' },
  // Header band colour behind the logo. The default suits the white ATV logo; use #FFFFFF with a dark logo.
  invoice_header_color: { group: 'invoice', default: '#5b21b6' },

  // WhatsApp (Meta WhatsApp Cloud API)
  whatsapp_enabled: { group: 'whatsapp', default: 'true', type: 'boolean' },
  whatsapp_api_version: { group: 'whatsapp', env: 'WHATSAPP_API_VERSION', default: 'v21.0' },
  whatsapp_phone_number_id: { group: 'whatsapp', env: 'WHATSAPP_PHONE_NUMBER_ID', default: '' },
  whatsapp_access_token: { group: 'whatsapp', env: 'WHATSAPP_ACCESS_TOKEN', default: '', secret: true },
  whatsapp_default_country_code: { group: 'whatsapp', default: '91' },

  // Zoom (Server-to-Server OAuth app)
  zoom_enabled: { group: 'zoom', default: 'true', type: 'boolean' },
  zoom_account_id: { group: 'zoom', env: 'ZOOM_ACCOUNT_ID', default: '' },
  zoom_client_id: { group: 'zoom', env: 'ZOOM_CLIENT_ID', default: '' },
  zoom_client_secret: { group: 'zoom', env: 'ZOOM_CLIENT_SECRET', default: '', secret: true },
  zoom_host_user: { group: 'zoom', env: 'ZOOM_HOST_USER', default: 'me' },
  // New meetings are set to record to the Zoom cloud automatically; the server then copies the recording to Vimeo.
  zoom_auto_record: { group: 'zoom', env: 'ZOOM_AUTO_RECORD', default: 'true', type: 'boolean' },
  // After a successful Vimeo upload, move the recording to Zoom's trash (frees Zoom cloud storage; recoverable for 30 days).
  zoom_trash_after_upload: { group: 'zoom', env: 'ZOOM_TRASH_AFTER_UPLOAD', default: 'false', type: 'boolean' },

  // Storage: Vimeo for recorded videos, Cloudflare R2 for files (documents, images, projects, reports).
  // storage_driver: auto = use Vimeo / R2 when configured, otherwise this server's disk;
  //                 cloud = require Vimeo / R2 (uploads fail with 503 if not configured);
  //                 local = always store on this server's disk (development).
  storage_driver: { group: 'storage', env: 'STORAGE_DRIVER', default: 'auto' },

  // Vimeo (recorded videos)
  vimeo_access_token: { group: 'storage', env: 'VIMEO_ACCESS_TOKEN', default: '', secret: true },
  vimeo_folder_id: { group: 'storage', env: 'VIMEO_FOLDER_ID', default: '' },
  // Folder for live class recordings; empty = use vimeo_folder_id.
  vimeo_recordings_folder_id: { group: 'storage', env: 'VIMEO_RECORDINGS_FOLDER_ID', default: '' },
  // disable = hidden on vimeo.com, embed-only (recommended) | unlisted | nobody | anybody
  vimeo_privacy_view: { group: 'storage', env: 'VIMEO_PRIVACY_VIEW', default: 'disable' },
  // Comma-separated domains allowed to embed the player, e.g. "atvacademy.com,localhost"
  vimeo_embed_domains: { group: 'storage', env: 'VIMEO_EMBED_DOMAINS', default: '' },
  // Also return time-limited HLS/MP4 links for a custom player (needs a Vimeo plan with file access)
  vimeo_use_direct_links: { group: 'storage', env: 'VIMEO_USE_DIRECT_LINKS', default: 'false', type: 'boolean' },

  // Cloudflare R2 (files)
  cloudflare_account_id: { group: 'storage', env: 'CLOUDFLARE_ACCOUNT_ID', default: '' },
  cloudflare_r2_access_key_id: { group: 'storage', env: 'CLOUDFLARE_R2_ACCESS_KEY_ID', default: '' },
  cloudflare_r2_secret_access_key: { group: 'storage', env: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', default: '', secret: true },
  cloudflare_r2_bucket: { group: 'storage', env: 'CLOUDFLARE_R2_BUCKET', default: '' },
  cloudflare_r2_public_url: { group: 'storage', env: 'CLOUDFLARE_R2_PUBLIC_URL', default: '' }
};

export const SETTING_GROUPS = ['general', 'payment', 'woocommerce', 'invoice', 'email', 'whatsapp', 'zoom', 'storage'];

const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cacheLoadedAt = 0;

const loadRows = async () => {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await Setting.findAll();
  cache = new Map(rows.map((r) => [r.setting_key, r]));
  cacheLoadedAt = Date.now();
  return cache;
};

export const invalidateSettingsCache = () => {
  cache = null;
};

const cast = (value, type) => {
  if (value === null || value === undefined) return value;
  if (type === 'boolean') return value === true || value === 'true' || value === '1' || value === 1;
  if (type === 'number') return Number(value);
  return value;
};

/** Resolve a single setting (DB -> env -> default), typed. */
export const getSetting = async (key, fallback = undefined) => {
  const def = SETTING_DEFINITIONS[key] || {};
  const rows = await loadRows();
  const row = rows.get(key);
  let value;
  if (row && row.setting_value !== null && row.setting_value !== '') value = row.setting_value;
  else if (def.env && process.env[def.env]) value = process.env[def.env];
  else value = def.default !== undefined ? def.default : fallback;
  return cast(value, def.type);
};

/** Resolve many settings at once: getSettings(['mail_host', 'mail_port']) */
export const getSettings = async (keys) => {
  const out = {};
  for (const key of keys) out[key] = await getSetting(key);
  return out;
};

export const getGroupSettings = async (group) => {
  const keys = Object.keys(SETTING_DEFINITIONS).filter((k) => SETTING_DEFINITIONS[k].group === group);
  return getSettings(keys);
};

const mask = (value) => {
  if (!value) return '';
  const str = String(value);
  return str.length <= 4 ? '****' : `${'*'.repeat(Math.min(12, str.length - 4))}${str.slice(-4)}`;
};

/** Admin view: every known + custom setting for a group, secrets masked. */
export const getAdminSettings = async (group = null) => {
  const rows = await loadRows();
  const result = {};
  const keys = new Set(Object.keys(SETTING_DEFINITIONS));
  rows.forEach((_, key) => keys.add(key));

  for (const key of keys) {
    const def = SETTING_DEFINITIONS[key];
    const row = rows.get(key);
    const settingGroup = def ? def.group : row.setting_group;
    if (group && settingGroup !== group) continue;
    const value = def ? await getSetting(key) : row.setting_value;
    if (!result[settingGroup]) result[settingGroup] = {};
    result[settingGroup][key] = {
      value: def && def.secret ? mask(value) : value,
      is_secret: Boolean(def && def.secret),
      is_configured: value !== '' && value !== null && value !== undefined,
      is_public: row ? Boolean(row.is_public) : Boolean(def && def.public),
      source: row && row.setting_value !== null && row.setting_value !== '' ? 'database' : def && def.env && process.env[def.env] ? 'env' : 'default'
    };
  }
  return result;
};

/**
 * Upsert settings. Masked secret values (containing only '*' + last 4 chars) are
 * ignored so that re-saving a form does not overwrite real secrets.
 */
export const updateSettings = async (values, userId, group = null) => {
  const updated = [];
  for (const [key, rawValue] of Object.entries(values || {})) {
    const def = SETTING_DEFINITIONS[key];
    if (def && group && def.group !== group) continue;
    if (def && def.secret && typeof rawValue === 'string' && /^\*+.{0,4}$/.test(rawValue)) continue;

    const value = rawValue === null || rawValue === undefined ? null : typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue);
    const settingGroup = def ? def.group : group || 'general';
    const [row, created] = await Setting.findOrCreate({
      where: { setting_key: key },
      defaults: {
        setting_key: key,
        setting_value: value,
        setting_group: settingGroup,
        is_public: Boolean(def && def.public),
        updated_by: userId
      }
    });
    if (!created) await row.update({ setting_value: value, updated_by: userId });
    updated.push(key);
  }
  invalidateSettingsCache();
  return updated;
};

/** Settings safe for the public website. */
export const getPublicSettings = async () => {
  const rows = await loadRows();
  const out = {};
  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    if (def.public && !def.secret) out[key] = await getSetting(key);
  }
  rows.forEach((row, key) => {
    if (row.is_public && !SETTING_DEFINITIONS[key]) out[key] = row.setting_value;
  });
  return out;
};

export default {
  getSetting,
  getSettings,
  getGroupSettings,
  getAdminSettings,
  updateSettings,
  getPublicSettings,
  invalidateSettingsCache
};
