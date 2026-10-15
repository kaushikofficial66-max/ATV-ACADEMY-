import { Op } from 'sequelize';
import { sequelize, StorePlan, StorePlanCourse, StorePlanUpgrade, Course } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import {
  isWooCommerceEnabled,
  isApiConfigured,
  findProductBySku,
  createProduct,
  updateProduct,
  trashProduct,
  getProductsByIds
} from './woocommerceService.js';
import { productEditUrl, absoluteImageUrl } from './woocommerceProductService.js';

/**
 * Store plans: ONE WooCommerce product that unlocks SEVERAL courses.
 *
 *   plan "Pro"  --- WooCommerce product #302  (what the buyer pays for, sold on the website)
 *      |-- course Premiere Pro   (revenue share 12)
 *      '-- course Photoshop      (revenue share  5)
 *
 * An order for product #302 enrols the buyer in both courses (services/woocommerceSyncService.js) and the
 * plan price is split 12 : 5 between them, so course revenue and tutor earnings stay correct.
 * The ordinary 1 product -> 1 course link (courses.woocommerce_product_id) is unchanged and keeps working.
 */

const LOG = '[Store plans]';
const SKU_PREFIX = 'ATV-PLAN-';
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const skuForPlan = (plan) => `${SKU_PREFIX}${String(plan.slug).toUpperCase()}`.slice(0, 100);

const storeReady = async () => (await isWooCommerceEnabled()) && (await isApiConfigured());

/**
 * Splits `amount` between weights so the parts add up EXACTLY to the amount (to the paisa).
 * The last non-zero share takes the rounding remainder. Equal split when every weight is 0.
 */
export const allocateAmounts = (amount, weights) => {
  const n = weights.length;
  if (!n) return [];
  const cents = Math.round(money(amount) * 100);
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const total = w.reduce((a, b) => a + b, 0);
  const parts = w.map((x) => Math.floor((cents * (total > 0 ? x / total : 1 / n)) + 1e-9));
  let remainder = cents - parts.reduce((a, b) => a + b, 0);
  let i = total > 0 ? w.map((x, idx) => (x > 0 ? idx : -1)).filter((idx) => idx >= 0).pop() : n - 1;
  while (remainder !== 0 && n > 0) {
    parts[i] += remainder > 0 ? 1 : -1;
    remainder += remainder > 0 ? -1 : 1;
  }
  return parts.map((c) => c / 100);
};

const PLAN_INCLUDE = [
  {
    model: StorePlanCourse,
    as: 'planCourses',
    include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'thumbnail_url', 'status'] }]
  }
];
const PLAN_ORDER = [['sort_order', 'ASC'], ['id', 'ASC'], [{ model: StorePlanCourse, as: 'planCourses' }, 'sort_order', 'ASC']];

const shapePlan = (plan) => {
  const links = (plan.planCourses || []).filter((l) => l.course);
  const totalWeight = links.reduce((s, l) => s + Number(l.revenue_weight || 0), 0);
  return {
    ...plan.toJSON(),
    planCourses: undefined,
    courses: links.map((l) => ({
      course_id: l.course_id,
      title: l.course.title,
      thumbnail_url: l.course.thumbnail_url,
      course_status: l.course.status,
      revenue_weight: Number(l.revenue_weight),
      share_percent: totalWeight > 0 ? Math.round((Number(l.revenue_weight) / totalWeight) * 1000) / 10 : Math.round((1000 / links.length)) / 10
    }))
  };
};

/** Live details of the linked store products (name, status, price, edit link). Never throws. */
const attachStoreInfo = async (shaped) => {
  const ids = shaped.map((p) => p.woocommerce_product_id).filter(Boolean);
  if (!ids.length || !(await storeReady())) return shaped;
  try {
    const products = await getProductsByIds(ids);
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    for (const plan of shaped) {
      const p = byId.get(Number(plan.woocommerce_product_id));
      plan.store_product = p
        ? { id: p.id, name: p.name, status: p.status, price: p.price, edit_url: await productEditUrl(p.id) }
        : { id: plan.woocommerce_product_id, missing: true };
    }
  } catch (error) {
    console.warn(`${LOG} could not read store products: ${error.message}`);
  }
  return shaped;
};

/**
 * The plans a student can upgrade FROM to reach `plan`: the smaller plans whose courses are all inside it.
 * (Essential -> Pro -> Complete: Essential's courses are inside Pro, Pro's inside Complete.)
 */
export const smallerPlans = (plan, all) => {
  const inside = new Set((plan.courses || []).map((c) => Number(c.course_id)));
  return all.filter((p) => p.id !== plan.id && (p.courses || []).length > 0 && p.courses.length < inside.size && p.courses.every((c) => inside.has(Number(c.course_id))));
};

const pairKey = (fromId, toId) => `${fromId}>${toId}`;

/** Upgrade price from one plan to another: the admin's override if set, else the price difference. */
export const upgradePrice = (from, to, overrides) => {
  const set = overrides.get(pairKey(from.id, to.id));
  return set !== undefined ? money(set) : money(Math.max(0, Number(to.price) - Number(from.price)));
};

export const loadUpgradeOverrides = async () => new Map((await StorePlanUpgrade.findAll()).map((u) => [pairKey(u.from_plan_id, u.to_plan_id), Number(u.price)]));

const attachUpgrades = async (shaped) => {
  const overrides = await loadUpgradeOverrides();
  for (const plan of shaped) {
    plan.upgrades = smallerPlans(plan, shaped).map((from) => {
      const override = overrides.get(pairKey(from.id, plan.id));
      return {
        from_plan_id: from.id,
        from_name: from.name,
        from_price: money(from.price),
        auto_price: money(Math.max(0, Number(plan.price) - Number(from.price))),
        price: override === undefined ? null : money(override),
        effective_price: upgradePrice(from, plan, overrides)
      };
    });
  }
  return shaped;
};

export const listPlans = async ({ withStore = true } = {}) => {
  const plans = await StorePlan.findAll({ include: PLAN_INCLUDE, order: PLAN_ORDER });
  const shaped = await attachUpgrades(plans.map(shapePlan));
  return withStore ? attachStoreInfo(shaped) : shaped;
};

export const getPlan = async (id) => {
  const plan = await StorePlan.findByPk(id, { include: PLAN_INCLUDE, order: PLAN_ORDER });
  if (!plan) throw ApiError.notFound('Store plan not found.');
  return plan;
};

/** Cleans the courses list of a request: [{ course_id, revenue_weight }] or [course_id, ...]. */
const parseCourses = async (input) => {
  const rows = (Array.isArray(input) ? input : []).map((c, index) => ({
    course_id: Number(typeof c === 'object' ? c.course_id : c),
    revenue_weight: typeof c === 'object' && c.revenue_weight !== undefined && c.revenue_weight !== '' ? Number(c.revenue_weight) : 1,
    sort_order: index
  }));
  const seen = new Set();
  const unique = rows.filter((r) => Number.isInteger(r.course_id) && r.course_id > 0 && !seen.has(r.course_id) && seen.add(r.course_id));
  if (!unique.length) throw ApiError.badRequest('Pick at least one course for this plan.');
  if (unique.some((r) => !(r.revenue_weight >= 0) || r.revenue_weight > 100000)) throw ApiError.badRequest('Revenue shares must be numbers of 0 or more.');
  const found = await Course.findAll({ where: { id: { [Op.in]: unique.map((r) => r.course_id) } }, attributes: ['id'] });
  const foundIds = new Set(found.map((c) => c.id));
  const missing = unique.filter((r) => !foundIds.has(r.course_id));
  if (missing.length) throw ApiError.badRequest(`Course(s) not found: ${missing.map((m) => m.course_id).join(', ')}.`);
  return unique;
};

/** body.upgrade_prices = { <fromPlanId>: price | '' }  ('' / null removes the override, so the price difference applies). */
const saveUpgradePrices = async (toPlanId, input) => {
  if (!input || typeof input !== 'object') return;
  for (const [fromId, raw] of Object.entries(input)) {
    const from = Number(fromId);
    if (!Number.isInteger(from) || from === toPlanId) continue;
    if (raw === '' || raw === null || raw === undefined) {
      await StorePlanUpgrade.destroy({ where: { from_plan_id: from, to_plan_id: toPlanId } });
      continue;
    }
    const price = Number(raw);
    if (!(price >= 0) || price > 10000000) throw ApiError.badRequest('Upgrade prices must be numbers of 0 or more.');
    const row = await StorePlanUpgrade.findOne({ where: { from_plan_id: from, to_plan_id: toPlanId } });
    if (row) await row.update({ price: money(price) });
    else if (await StorePlan.findByPk(from, { attributes: ['id'] })) await StorePlanUpgrade.create({ from_plan_id: from, to_plan_id: toPlanId, price: money(price) });
  }
};

/**
 * Creates (id = null) or updates a plan with its course list in one transaction.
 * body: { name, slug?, description?, price, status?, sort_order?, woocommerce_product_id?, courses: [{course_id, revenue_weight}] }
 */
export const savePlan = async (body, id = null) => {
  const name = String(body.name || '').trim();
  if (!name) throw ApiError.badRequest('Plan name is required.');
  if (name.length > 120) throw ApiError.badRequest('Plan name is too long (120 characters max).');
  const slug = slugify(body.slug || name);
  if (!slug) throw ApiError.badRequest('Plan slug is required (letters and numbers).');
  const price = Number(body.price);
  if (!(price >= 0) || price > 10000000) throw ApiError.badRequest('Price must be a number of 0 or more.');
  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const courses = await parseCourses(body.courses);

  const clash = await StorePlan.findOne({ where: { slug, ...(id && { id: { [Op.ne]: id } }) }, attributes: ['id'] });
  if (clash) throw ApiError.conflict(`Another plan already uses the slug "${slug}".`);

  const existing = id ? await StorePlan.findByPk(id) : null;
  if (id && !existing) throw ApiError.notFound('Store plan not found.');

  let productId = existing ? existing.woocommerce_product_id : null;
  if (body.woocommerce_product_id !== undefined) {
    const raw = body.woocommerce_product_id;
    productId = raw === null || raw === '' ? null : Number(raw);
    if (productId !== null && !(Number.isInteger(productId) && productId > 0)) throw ApiError.badRequest('Store product id must be a whole number.');
  }
  if (productId) {
    const usedByPlan = await StorePlan.findOne({ where: { woocommerce_product_id: productId, ...(id && { id: { [Op.ne]: id } }) }, attributes: ['id', 'name'] });
    if (usedByPlan) throw ApiError.conflict(`Store product #${productId} is already used by the plan "${usedByPlan.name}".`);
    const usedByCourse = await Course.findOne({ where: { woocommerce_product_id: productId }, attributes: ['id', 'title'] });
    if (usedByCourse) throw ApiError.conflict(`Store product #${productId} is the product of the course "${usedByCourse.title}". A plan needs its own product.`);
  }

  const fields = {
    name,
    slug,
    description: body.description ? String(body.description).slice(0, 500) : null,
    price: money(price),
    status,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : existing ? existing.sort_order : 0,
    woocommerce_product_id: productId
  };

  const saved = await sequelize.transaction(async (transaction) => {
    const plan = existing ? await existing.update(fields, { transaction }) : await StorePlan.create(fields, { transaction });
    await StorePlanCourse.destroy({ where: { plan_id: plan.id }, transaction });
    await StorePlanCourse.bulkCreate(courses.map((c) => ({ ...c, plan_id: plan.id })), { transaction });
    return plan;
  });

  await saveUpgradePrices(saved.id, body.upgrade_prices);

  // Keep the store in step with the plan (price / description), best effort.
  if (saved.woocommerce_product_id && (await storeReady())) await pushPlanToStore(saved.id);
  return getPlan(saved.id);
};

const planDescription = (plan, courseTitles) =>
  `${plan.description ? `${plan.description}\n\n` : ''}Includes: ${courseTitles.join(', ')}.`.slice(0, 5000);

/**
 * Product picture for a plan: the thumbnail of its biggest course (highest revenue share) that has one.
 * The store downloads it itself, so it only works when the portal's api_url is a public https address.
 */
const planImageUrl = async (plan) => {
  const links = [...(plan.planCourses || [])].filter((l) => l.course?.thumbnail_url).sort((a, b) => Number(b.revenue_weight) - Number(a.revenue_weight));
  return links.length ? absoluteImageUrl(links[0].course.thumbnail_url) : null;
};

/** Sends the plan's current price and description to its linked store product. Records a problem on the plan, never throws. */
export const pushPlanToStore = async (planId) => {
  const plan = await getPlan(planId);
  if (!plan.woocommerce_product_id) return { action: 'not_linked' };
  try {
    const titles = plan.planCourses.map((l) => l.course?.title).filter(Boolean);
    const changes = {
      regular_price: money(plan.price).toFixed(2),
      short_description: plan.description || '',
      description: planDescription(plan, titles)
    };
    // Give the product a picture only when it has none, so a picture chosen in WordPress is never replaced.
    const image = await planImageUrl(plan);
    if (image) {
      const [current] = await getProductsByIds([plan.woocommerce_product_id]);
      if (current && !(current.images || []).length) changes.images = [{ src: image }];
    }
    let product;
    try {
      product = await updateProduct(plan.woocommerce_product_id, changes);
    } catch (error) {
      if (!changes.images || !/image/i.test(`${error.wcCode} ${error.message}`)) throw error;
      delete changes.images; // the store could not download the picture: still send the price and text
      product = await updateProduct(plan.woocommerce_product_id, changes);
    }
    await plan.update({ woocommerce_product_status: product.status || plan.woocommerce_product_status, woocommerce_sync_error: null });
    return { action: 'updated' };
  } catch (error) {
    const message = `Could not update the store product: ${String(error.message).slice(0, 400)}`;
    await plan.update({ woocommerce_sync_error: message });
    console.warn(`${LOG} plan=${plan.id} ${message}`);
    return { action: 'error', error: message };
  }
};

/**
 * Makes sure the plan has a PUBLISHED, buyable WooCommerce product, and links it.
 * Looks the product up by SKU first (ATV-PLAN-<SLUG>), so a product the website plugin or an earlier
 * attempt already created is reused instead of duplicated.
 */
export const ensureProductForPlan = async (planId) => {
  const plan = await getPlan(planId);
  if (plan.woocommerce_product_id) return { action: 'already_linked', product_id: plan.woocommerce_product_id };
  if (!(await storeReady())) return { action: 'skipped', reason: 'store_not_configured' };

  const sku = skuForPlan(plan);
  try {
    let product = await findProductBySku(sku);
    let created = false;
    const titles = plan.planCourses.map((l) => l.course?.title).filter(Boolean);
    if (!product) {
      const image = await planImageUrl(plan);
      const payload = {
        name: `ATV Academy ${plan.name} Plan`,
        type: 'simple',
        status: 'publish',
        virtual: true,
        sold_individually: true,
        catalog_visibility: 'hidden',
        sku,
        regular_price: money(plan.price).toFixed(2),
        short_description: plan.description || '',
        description: planDescription(plan, titles),
        ...(image && { images: [{ src: image }] }),
        meta_data: [{ key: '_atv_lms_plan_id', value: String(plan.id) }]
      };
      try {
        product = await createProduct(payload);
      } catch (error) {
        if (!payload.images || !/image/i.test(`${error.wcCode} ${error.message}`)) throw error;
        delete payload.images; // the store could not download the picture: create the product without it
        product = await createProduct(payload);
      }
      created = true;
    }
    const taken = await StorePlan.findOne({ where: { woocommerce_product_id: product.id, id: { [Op.ne]: plan.id } }, attributes: ['name'] });
    const takenByCourse = await Course.findOne({ where: { woocommerce_product_id: product.id }, attributes: ['title'] });
    if (taken || takenByCourse) {
      const message = `Store product #${product.id} (SKU ${sku}) is already linked to ${taken ? `the plan "${taken.name}"` : `the course "${takenByCourse.title}"`}.`;
      await plan.update({ woocommerce_sync_error: message });
      return { action: 'error', error: message };
    }
    await plan.update({ woocommerce_product_id: product.id, woocommerce_product_status: product.status || null, woocommerce_sync_error: null });
    console.log(`${LOG} plan=${plan.id} ${created ? 'created' : 'linked'} store product=${product.id} sku=${sku}`);
    return { action: created ? 'created' : 'linked', product_id: product.id, status: product.status };
  } catch (error) {
    const message = String(error.message).slice(0, 400);
    await plan.update({ woocommerce_sync_error: `Store product could not be created: ${message}` });
    console.warn(`${LOG} plan=${plan.id} ensure product failed: ${message}`);
    return { action: 'error', error: message };
  }
};

/** Deletes the plan. A product that was created for it (SKU ATV-PLAN-...) is moved to the store's trash. */
export const deletePlan = async (planId) => {
  const plan = await getPlan(planId);
  let trashed = false;
  if (plan.woocommerce_product_id && (await storeReady())) {
    try {
      const [product] = await getProductsByIds([plan.woocommerce_product_id]);
      if (product && String(product.sku || '').startsWith(SKU_PREFIX)) {
        await trashProduct(plan.woocommerce_product_id);
        trashed = true;
      }
    } catch (error) {
      console.warn(`${LOG} plan=${plan.id} could not trash store product ${plan.woocommerce_product_id}: ${error.message}`);
    }
  }
  await plan.destroy();
  return { trashed };
};

/** Active plans that can be bought (have a store product): what the website needs to link its Enroll buttons. */
export const publicPlans = async () => {
  const plans = await StorePlan.findAll({
    where: { status: 'active', woocommerce_product_id: { [Op.ne]: null } },
    include: PLAN_INCLUDE,
    order: PLAN_ORDER
  });
  return plans.map((p) => {
    const s = shapePlan(p);
    return {
      slug: s.slug,
      name: s.name,
      description: s.description,
      price: Number(s.price),
      woocommerce_product_id: s.woocommerce_product_id,
      courses: s.courses.map((c) => c.title)
    };
  });
};

/**
 * For the order sync: store products that are PLANS.
 * @returns Map<productId, { plan, entries: [{ course, weight }] }> (entries only for existing courses)
 */
export const plansByProductIds = async (productIds) => {
  const ids = [...new Set((productIds || []).map(Number).filter((n) => n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const plans = await StorePlan.findAll({ where: { woocommerce_product_id: { [Op.in]: ids } }, include: PLAN_INCLUDE, order: PLAN_ORDER });
  for (const plan of plans) {
    const entries = (plan.planCourses || []).filter((l) => l.course).map((l) => ({ course: l.course, weight: Number(l.revenue_weight) }));
    map.set(Number(plan.woocommerce_product_id), { plan, entries });
  }
  return map;
};

export default {
  slugify,
  skuForPlan,
  allocateAmounts,
  listPlans,
  getPlan,
  savePlan,
  pushPlanToStore,
  ensureProductForPlan,
  deletePlan,
  publicPlans,
  plansByProductIds
};
