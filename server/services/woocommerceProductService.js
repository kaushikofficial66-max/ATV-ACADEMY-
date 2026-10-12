import { Op } from 'sequelize';
import { Course } from '../models/index.js';
import { getSetting } from './settingsService.js';
import { effectivePrice } from './courseService.js';
import { notifyAdmins } from './notificationService.js';
import {
  isWooCommerceEnabled,
  isApiConfigured,
  getStoreUrl,
  getProductsByIds,
  findProductBySku,
  createProduct,
  updateProduct,
  trashProduct
} from './woocommerceService.js';

/**
 * Course <-> WooCommerce product sync.
 *
 *   LMS -> store (once):  a paid course creates a DRAFT product (title, price,
 *                         sale price, descriptions, image, virtual) and links it.
 *   store -> LMS (always): price, sale price, publish status and product URL are
 *                         read back (product webhook, hourly job, "Sync" button).
 *   LMS lifecycle:        archiving a course sets its product to draft; deleting
 *                         a course trashes the product the LMS created.
 *
 * After linking, WooCommerce owns the product: the LMS never overwrites its
 * content or price, and the course's price fields follow the store.
 */

const LOG = '[WooCommerce Products]';
const skuFor = (courseId) => `atv-course-${courseId}`;
const clip = (value, max) => String(value || '').slice(0, max);

/** Store writes are possible: integration on, REST keys present. */
const storeReady = async () => (await isWooCommerceEnabled()) && (await isApiConfigured());

/** True when the store, not the LMS, sets this course's price. */
export const isPriceManagedByStore = async (course) => Boolean(course.woocommerce_product_id) && (await isWooCommerceEnabled());

const absoluteImageUrl = async (url) => {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  const apiUrl = String((await getSetting('api_url')) || '').replace(/\/+$/, '');
  // WooCommerce downloads the image itself, so it must be publicly reachable over HTTPS.
  return apiUrl.startsWith('https://') && url.startsWith('/') ? `${apiUrl}${url}` : null;
};

/** Course fields mirrored from a WooCommerce product (REST v3 shape). */
const productToCourseFields = (product) => {
  const regular = Number(product.regular_price || product.price);
  const sale = product.on_sale && product.sale_price !== '' ? Number(product.sale_price) : null;
  const fields = {
    woocommerce_product_status: clip(product.status, 20) || null,
    woocommerce_product_url: clip(product.permalink, 500) || null,
    woocommerce_synced_at: new Date(),
    woocommerce_sync_error: null
  };
  if (product.regular_price === '' && product.price === '') {
    fields.woocommerce_sync_error = 'The store product has no price.';
  } else if (Number.isFinite(regular)) {
    fields.price = regular;
    fields.discount_price = Number.isFinite(sale) && sale < regular ? sale : null;
  }
  if (product.status === 'trash') fields.woocommerce_sync_error = 'The store product is in the trash.';
  return fields;
};

const recordError = async (course, message) => {
  await course.update({ woocommerce_sync_error: clip(message, 255) });
  console.error(`${LOG} course=${course.id} product=${course.woocommerce_product_id || '-'} ${message}`);
};

/**
 * Creates (or re-links) the store product for a course and links it. Paid
 * courses only unless `force`. Never throws for store problems: the error is
 * stored on the course (woocommerce_sync_error) and returned.
 */
export const ensureProductForCourse = async (course, { force = false } = {}) => {
  if (course.woocommerce_product_id) return { action: 'already_linked', product_id: course.woocommerce_product_id };
  if (!(await storeReady())) return { action: 'skipped', reason: 'store_not_configured' };
  if (!force && !(await getSetting('woocommerce_auto_create_products'))) return { action: 'skipped', reason: 'auto_create_disabled' };
  if (!force && effectivePrice(course) <= 0) return { action: 'skipped', reason: 'free_course' };

  const sku = skuFor(course.id);
  try {
    // The SKU makes retries safe: a product created by an earlier, timed-out attempt is re-linked.
    let product = await findProductBySku(sku);
    let created = false;
    if (!product) {
      const price = Number(course.price) || 0;
      const sale = course.discount_price !== null && Number(course.discount_price) < price ? Number(course.discount_price) : null;
      const image = await absoluteImageUrl(course.thumbnail_url);
      const payload = {
        name: course.title,
        type: 'simple',
        status: 'draft',
        virtual: true,
        sku,
        regular_price: price.toFixed(2),
        sale_price: sale !== null ? sale.toFixed(2) : '',
        short_description: course.short_description || '',
        description: course.description || course.short_description || '',
        ...(image && { images: [{ src: image }] }),
        meta_data: [{ key: '_atv_lms_course_id', value: String(course.id) }]
      };
      try {
        product = await createProduct(payload);
      } catch (error) {
        if (payload.images && /image/i.test(`${error.wcCode} ${error.message}`)) {
          // The store could not download the thumbnail - create without it.
          delete payload.images;
          product = await createProduct(payload);
        } else if (/sku/i.test(`${error.wcCode} ${error.message}`)) {
          product = await findProductBySku(sku);
          if (!product) throw error;
        } else {
          throw error;
        }
      }
      created = true;
    }

    const taken = await Course.findOne({ where: { woocommerce_product_id: product.id, id: { [Op.ne]: course.id } }, attributes: ['id', 'title'] });
    if (taken) {
      const message = `Store product ${product.id} is already linked to "${taken.title}".`;
      await recordError(course, message);
      return { action: 'error', error: message };
    }

    await course.update({ woocommerce_product_id: product.id, ...productToCourseFields(product) });
    console.log(`${LOG} course=${course.id} product=${product.id} ${created ? 'created (draft)' : 're-linked by SKU'}`);
    if (created) {
      await notifyAdmins({
        title: 'Store product created',
        message: `A draft WooCommerce product (#${product.id}) was created for "${course.title}". Add the full description and images in WordPress, then publish it to start selling.`,
        type: 'admin_woocommerce_product',
        reference_type: 'course',
        reference_id: course.id
      });
    }
    return { action: created ? 'created' : 'linked', product_id: product.id };
  } catch (error) {
    await recordError(course, `Could not create the store product: ${error.message}`);
    return { action: 'error', error: error.message };
  }
};

/** Applies a WooCommerce product (webhook payload or API response) to its linked course. */
export const applyProductToCourse = async (product) => {
  const id = Number(product?.id);
  if (!Number.isSafeInteger(id) || id < 1) return { action: 'ignored' };
  const course = await Course.findOne({ where: { woocommerce_product_id: id } });
  if (!course) return { action: 'ignored', reason: 'not_linked' };
  await course.update(productToCourseFields(product));
  console.log(`${LOG} course=${course.id} product=${id} synced status=${product.status} price=${product.regular_price || product.price}`);
  return { action: 'synced', course_id: course.id };
};

/** product.deleted webhook: keep the link (history), flag the course so admins see it. */
export const markProductDeleted = async (productId) => {
  const course = await Course.findOne({ where: { woocommerce_product_id: Number(productId) || 0 } });
  if (!course) return { action: 'ignored', reason: 'not_linked' };
  await course.update({ woocommerce_product_status: 'trash', woocommerce_sync_error: 'The store product was deleted or trashed.', woocommerce_synced_at: new Date() });
  console.warn(`${LOG} course=${course.id} product=${productId} deleted on the store`);
  return { action: 'flagged', course_id: course.id };
};

/** Reads every linked product (or only `courseIds`) from the store and updates the courses. */
export const syncCoursesFromStore = async ({ courseIds = null } = {}) => {
  if (!(await storeReady())) return { skipped: true };
  const courses = await Course.findAll({
    where: { woocommerce_product_id: { [Op.ne]: null }, ...(courseIds && { id: { [Op.in]: courseIds } }) }
  });
  const counts = { checked: courses.length, synced: 0, missing: 0, failed: 0 };
  for (let i = 0; i < courses.length; i += 100) {
    const batch = courses.slice(i, i + 100);
    let products;
    try {
      products = await getProductsByIds(batch.map((c) => c.woocommerce_product_id));
    } catch (error) {
      counts.failed += batch.length;
      console.error(`${LOG} price sync failed: ${error.message}`);
      continue;
    }
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    for (const course of batch) {
      const product = byId.get(Number(course.woocommerce_product_id));
      if (product) {
        await course.update(productToCourseFields(product));
        counts.synced += 1;
      } else {
        await course.update({ woocommerce_product_status: 'missing', woocommerce_sync_error: 'Product not found on the store (deleted or trashed).', woocommerce_synced_at: new Date() });
        counts.missing += 1;
      }
    }
  }
  if (counts.missing || counts.failed) console.warn(`${LOG} sync ${JSON.stringify(counts)}`);
  return counts;
};

/** Archived course: stop selling it (product -> draft). Publishing again is done in WordPress. */
export const onCourseArchived = async (course) => {
  if (!course.woocommerce_product_id || !(await storeReady())) return { action: 'skipped' };
  try {
    const product = await updateProduct(course.woocommerce_product_id, { status: 'draft' });
    await course.update(productToCourseFields(product));
    return { action: 'unpublished' };
  } catch (error) {
    await recordError(course, `Course archived but the store product could not be unpublished: ${error.message}`);
    return { action: 'error', error: error.message };
  }
};

/**
 * Deleted course (only possible without enrollments or sales): trash the store
 * product if the LMS created it (SKU match). Products linked by hand are left alone.
 */
export const onCourseDeleted = async ({ id, woocommerce_product_id: productId, title }) => {
  if (!productId || !(await storeReady())) return { action: 'skipped' };
  try {
    const [product] = await getProductsByIds([productId]);
    if (!product || product.sku !== skuFor(id)) return { action: 'kept' };
    await trashProduct(productId);
    console.log(`${LOG} course=${id} deleted -> product=${productId} moved to trash`);
    return { action: 'trashed' };
  } catch (error) {
    console.error(`${LOG} course=${id} deleted but product=${productId} could not be trashed: ${error.message}`);
    await notifyAdmins({
      title: 'Store product needs attention',
      message: `Course "${title}" was deleted, but its WooCommerce product #${productId} could not be moved to the trash. Remove it in WordPress so it is not sold.`,
      type: 'admin_woocommerce_product',
      reference_type: 'course',
      reference_id: id
    });
    return { action: 'error', error: error.message };
  }
};

/** WordPress admin link for a product (shown in the LMS course form). */
export const productEditUrl = async (productId) => {
  const store = await getStoreUrl();
  return store && productId ? `${store}/wp-admin/post.php?post=${encodeURIComponent(String(productId))}&action=edit` : null;
};

export default {
  isPriceManagedByStore,
  ensureProductForCourse,
  applyProductToCourse,
  markProductDeleted,
  syncCoursesFromStore,
  onCourseArchived,
  onCourseDeleted,
  productEditUrl
};
