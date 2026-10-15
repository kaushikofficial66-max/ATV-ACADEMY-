import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { isWooCommerceEnabled, isApiConfigured } from '../../services/woocommerceService.js';
import { listPlans, savePlan, ensureProductForPlan, deletePlan, getPlan, pushPlanToStore } from '../../services/storePlanService.js';

/**
 * Store plans (Admin > Store plans): ONE WooCommerce product that unlocks SEVERAL courses.
 * See services/storePlanService.js for how an order for a plan enrols the buyer.
 */

const storeReady = async () => (await isWooCommerceEnabled()) && (await isApiConfigured());

const productMessage = (result) => {
  switch (result?.action) {
    case 'created':
      return ' The product was created and published in your WooCommerce store.';
    case 'linked':
      return ' It was linked to the existing store product with the same SKU.';
    case 'skipped':
      return ' (WooCommerce is not connected, so no store product was created. Add the REST API keys in Admin > Settings > Woocommerce.)';
    case 'error':
      return ` The store product could not be created: ${result.error}`;
    default:
      return '';
  }
};

/** GET /admin/store-plans */
export const listStorePlans = async (req, res) => {
  const plans = await listPlans();
  return successResponse(res, { data: { plans, store_ready: await storeReady() } });
};

/** POST /admin/store-plans { name, slug?, description?, price, status?, courses: [{course_id, revenue_weight}], create_store_product?, woocommerce_product_id? } */
export const createStorePlan = async (req, res) => {
  const plan = await savePlan(req.body);
  let result = null;
  if (req.body.create_store_product) result = await ensureProductForPlan(plan.id);
  return successResponse(res, {
    statusCode: 201,
    message: `Plan created.${productMessage(result)}`,
    data: { plan: (await listPlans()).find((p) => p.id === plan.id), store_product: result }
  });
};

/** PUT /admin/store-plans/:planId (same body; the course list is replaced) */
export const updateStorePlan = async (req, res) => {
  const plan = await savePlan(req.body, Number(req.params.planId));
  let result = null;
  if (req.body.create_store_product && !plan.woocommerce_product_id) result = await ensureProductForPlan(plan.id);
  return successResponse(res, {
    message: `Plan saved.${productMessage(result)}`,
    data: { plan: (await listPlans()).find((p) => p.id === plan.id), store_product: result }
  });
};

/** POST /admin/store-plans/:planId/store-product - create (or link by SKU) the plan's store product now; or re-send price / description. */
export const createPlanStoreProduct = async (req, res) => {
  const plan = await getPlan(req.params.planId);
  if (!(await storeReady())) throw ApiError.badRequest('Enable WooCommerce and add REST API keys (Read/Write) in Admin > Settings > Woocommerce first.');
  let result;
  if (plan.woocommerce_product_id) {
    result = await pushPlanToStore(plan.id);
    if (result.action === 'error') throw new ApiError(502, result.error);
    return successResponse(res, { message: 'The store product now has this plan\'s price and description.', data: { store_product: result } });
  }
  result = await ensureProductForPlan(plan.id);
  if (result.action === 'error') throw new ApiError(502, `Could not create the store product: ${result.error}`);
  return successResponse(res, {
    statusCode: result.action === 'created' ? 201 : 200,
    message: result.action === 'created' ? 'Product created and published in your store.' : 'Linked to the existing store product.',
    data: { plan: (await listPlans()).find((p) => p.id === plan.id), store_product: result }
  });
};

/** DELETE /admin/store-plans/:planId */
export const deleteStorePlan = async (req, res) => {
  const result = await deletePlan(req.params.planId);
  return successResponse(res, { message: result.trashed ? 'Plan deleted and its store product moved to the trash.' : 'Plan deleted.', data: result });
};
