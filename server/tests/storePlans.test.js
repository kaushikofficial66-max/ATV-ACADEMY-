/**
 * Store plans: ONE WooCommerce product unlocks SEVERAL courses (Essential / Pro / Complete).
 *
 *   DB_NAME=lms_db_test npm test
 *
 * Same safety rules as woocommerce.test.js: refuses to run unless DB_NAME ends with "_test" (the database
 * is recreated and seeded first); the WooCommerce REST API is stubbed in-process, webhooks are signed
 * like WooCommerce signs them.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'atv-test-uploads-'));
process.env.DISABLE_SCHEDULER = 'true';
process.env.STORAGE_DRIVER = 'local';
process.env.AUTH_RATE_LIMIT = '1000';
for (const key of [
  'MAIL_HOST', 'MAIL_USER', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'CLOUDFLARE_ACCOUNT_ID', 'VIMEO_ACCESS_TOKEN',
  'WOOCOMMERCE_ENABLED', 'WOOCOMMERCE_URL', 'WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_SECRET', 'WOOCOMMERCE_WEBHOOK_SECRET', 'WOOCOMMERCE_PAID_STATUSES'
]) {
  process.env[key] = '';
}
if (!/_test$/.test(process.env.DB_NAME || '')) {
  throw new Error('Refusing to run: set DB_NAME to a database ending in "_test" (it will be wiped).');
}

const ADMIN = { email: 'admin@test.local', password: 'Admin12345' };
const STORE = 'https://antarikshtv.com';
const SECRET = 'wc_webhook_secret_plans';

let request;
let app;
let models;
let axios;
let allocateAmounts;
const state = {};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64');

// ---- in-memory WooCommerce store (REST v3 subset) ----
const products = new Map();
let nextProductId = 700;
const storeCalls = [];
let realRequest;
const installStore = () => {
  realRequest = axios.request;
  axios.request = async (config) => {
    const { method, url, params = {}, data } = config;
    storeCalls.push({ method, url, params, data });
    const one = url.match(/\/products\/(\d+)$/);
    if (method === 'post' && url.endsWith('/products')) {
      if ([...products.values()].some((p) => p.sku === data.sku && p.status !== 'trash')) {
        throw Object.assign(new Error('Invalid or duplicated SKU.'), { response: { status: 400, data: { code: 'product_invalid_sku', message: 'Invalid or duplicated SKU.' } } });
      }
      const product = { ...data, id: nextProductId++, price: data.regular_price, permalink: `${STORE}/product/${data.sku}/` };
      products.set(product.id, product);
      return { data: product, headers: {} };
    }
    if (method === 'put' && one) {
      const product = { ...products.get(Number(one[1])), ...data };
      product.price = product.regular_price;
      products.set(product.id, product);
      return { data: product, headers: {} };
    }
    if (method === 'delete' && one) {
      const product = { ...products.get(Number(one[1])), status: 'trash' };
      products.set(product.id, product);
      return { data: product, headers: {} };
    }
    if (method === 'get' && url.endsWith('/products')) {
      let list = [...products.values()].filter((p) => p.status !== 'trash');
      if (params.sku) list = list.filter((p) => p.sku === params.sku);
      if (params.include) list = list.filter((p) => String(params.include).split(',').map(Number).includes(p.id));
      return { data: list, headers: {} };
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
};

before(async () => {
  const env = { ...process.env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password };
  execFileSync(process.execPath, ['scripts/migrate.js', '--fresh'], { cwd: ROOT, env, stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });
  ({ default: request } = await import('supertest'));
  ({ default: app } = await import('../index.js'));
  models = await import('../models/index.js');
  ({ default: axios } = await import('axios'));
  ({ allocateAmounts } = await import('../services/storePlanService.js'));
  installStore();
});

after(async () => {
  axios.request = realRequest;
  await models.sequelize.close();
});

const login = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.body.message);
  return res.body.data.token;
};

/** WooCommerce order webhook payload (only the fields the LMS reads). */
const wcOrder = (id, { status = 'processing', email, items, modified = '2026-10-14T10:00:00' }) => {
  const lineItems = items.map((it, i) => ({
    id: id * 10 + i,
    name: `Product ${it.product_id}`,
    product_id: it.product_id,
    variation_id: 0,
    quantity: 1,
    subtotal: it.subtotal,
    total: it.total || it.subtotal
  }));
  const total = lineItems.reduce((s, l) => s + Number(l.total), 0);
  const subtotal = lineItems.reduce((s, l) => s + Number(l.subtotal), 0);
  return {
    id, number: String(id), status, currency: 'INR', total: total.toFixed(2), discount_total: (subtotal - total).toFixed(2), total_tax: '0.00',
    customer_id: 0, billing: { first_name: 'Plan', last_name: 'Buyer', email, phone: '' }, payment_method: 'razorpay', payment_method_title: 'Razorpay',
    transaction_id: `pay_${id}`, date_created_gmt: '2026-10-14T09:59:00', date_paid_gmt: ['processing', 'completed'].includes(status) ? '2026-10-14T10:00:00' : null,
    date_modified_gmt: modified, line_items: lineItems, coupon_lines: [], refunds: []
  };
};
const hook = (topic, payload) => {
  const body = JSON.stringify(payload);
  return request(app).post('/api/v1/webhooks/woocommerce').set('Content-Type', 'application/json').set('X-WC-Webhook-Topic', topic).set('X-WC-Webhook-Source', `${STORE}/`).set('X-WC-Webhook-Signature', sign(body)).send(body);
};
const enrolled = async (email) => {
  const user = await models.User.findOne({ where: { email } });
  if (!user) return null;
  const rows = await models.Enrollment.findAll({ where: { user_id: user.id, status: 'active' } });
  return rows.map((r) => r.course_id).sort((a, b) => a - b);
};
const itemsOf = async (wcId) => {
  const order = await models.Order.findOne({ where: { woocommerce_order_id: wcId } });
  const items = await models.OrderItem.findAll({ where: { order_id: order.id }, order: [['course_id', 'ASC']] });
  return { order, items };
};
const sum = (rows, key) => Math.round(rows.reduce((s, r) => s + Number(r[key]), 0) * 100) / 100;

test('splitting a price: the parts always add up to the price exactly', async () => {
  assert.deepEqual(allocateAmounts(100, [1, 1, 1]), [33.33, 33.33, 33.34]);
  assert.deepEqual(allocateAmounts(14999, [12, 5]).map((x) => Math.round(x * 100)).reduce((a, b) => a + b, 0), 1499900);
  assert.equal(Math.round(allocateAmounts(29999, [12, 5, 19]).reduce((a, b) => a + b, 0) * 100), 2999900);
  assert.deepEqual(allocateAmounts(10, [0, 0]), [5, 5], 'all-zero weights split equally');
  assert.deepEqual(allocateAmounts(0, [3, 4]), [0, 0]);
  assert.deepEqual(allocateAmounts(7999, [1]), [7999]);
  for (const total of [1, 99.99, 7999, 14999.5, 29999.01]) {
    const parts = allocateAmounts(total, [12, 5, 19]);
    assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100), Math.round(total * 100), `parts of ${total} add up`);
    assert.ok(parts.every((p) => p >= 0));
  }
});

test('setup: courses, store connection and a course already linked to its own product', async () => {
  state.admin = await login(ADMIN.email, ADMIN.password);
  const cats = await request(app).get('/api/v1/public/categories');
  const categoryId = String(cats.body.data.categories[0].id);
  const createCourse = async (title, price, productId) => {
    const req = request(app).post('/api/v1/admin/courses').set(auth(state.admin)).field('title', title).field('category_id', categoryId).field('price', String(price)).field('status', 'published');
    if (productId) req.field('woocommerce_product_id', String(productId));
    const res = await req;
    assert.equal(res.status, 201, res.body.message);
    return res.body.data.course.id;
  };
  state.premiere = await createCourse('Premiere Pro A to Z', 0);
  state.photoshop = await createCourse('Photoshop for Creators', 0);
  state.aftereffects = await createCourse('After Effects + AI Tools', 0);
  state.python = await createCourse('Python Programming Mastery', 0, 49);

  const settings = await request(app)
    .put('/api/v1/admin/settings/woocommerce')
    .set(auth(state.admin))
    .send({ woocommerce_enabled: 'true', woocommerce_url: STORE, woocommerce_webhook_secret: SECRET, woocommerce_consumer_key: 'ck_test', woocommerce_consumer_secret: 'cs_test' });
  assert.equal(settings.status, 200, settings.body.message);
});

test('admin creates the three plans with their courses and the store products are created and published', async () => {
  const body = (extra) => ({ description: 'plan', create_store_product: true, ...extra });
  const essential = await request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send(body({ name: 'Essential', price: 7999, courses: [{ course_id: state.premiere, revenue_weight: 12 }] }));
  assert.equal(essential.status, 201, essential.body.message);
  assert.equal(essential.body.data.store_product.action, 'created');
  assert.match(essential.body.message, /created and published/);
  const pro = await request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send(body({ name: 'Pro', price: 14999, courses: [{ course_id: state.premiere, revenue_weight: 12 }, { course_id: state.photoshop, revenue_weight: 5 }] }));
  assert.equal(pro.status, 201, pro.body.message);
  const complete = await request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send(body({ name: 'Complete', price: 29999, courses: [{ course_id: state.premiere, revenue_weight: 12 }, { course_id: state.photoshop, revenue_weight: 5 }, { course_id: state.aftereffects, revenue_weight: 19 }] }));
  assert.equal(complete.status, 201, complete.body.message);

  state.plans = {};
  for (const [slug, res] of Object.entries({ essential, pro, complete })) {
    const plan = res.body.data.plan;
    assert.equal(plan.slug, slug, 'slug comes from the name');
    assert.ok(plan.woocommerce_product_id, `${slug} is linked to a store product`);
    state.plans[slug] = { id: plan.id, product: Number(plan.woocommerce_product_id) };
  }
  assert.equal(new Set(Object.values(state.plans).map((p) => p.product)).size, 3, 'each plan has its own product');

  const posted = storeCalls.filter((c) => c.method === 'post' && c.url.endsWith('/products')).map((c) => c.data);
  assert.equal(posted.length, 3);
  const proPost = posted.find((p) => p.sku === 'ATV-PLAN-PRO');
  assert.deepEqual(
    { status: proPost.status, virtual: proPost.virtual, single: proPost.sold_individually, visibility: proPost.catalog_visibility, price: proPost.regular_price, name: proPost.name },
    { status: 'publish', virtual: true, single: true, visibility: 'hidden', price: '14999.00', name: 'ATV Academy Pro Plan' }
  );
  assert.match(proPost.description, /Premiere Pro A to Z, Photoshop for Creators/, 'the product description lists the plan courses');

  const list = await request(app).get('/api/v1/admin/store-plans').set(auth(state.admin));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.store_ready, true);
  const proListed = list.body.data.plans.find((p) => p.slug === 'pro');
  assert.deepEqual(proListed.courses.map((c) => [c.title, c.share_percent]), [['Premiere Pro A to Z', 70.6], ['Photoshop for Creators', 29.4]]);
  assert.equal(proListed.store_product.status, 'publish');
});

test('validation: a plan needs courses, a unique slug and its own store product', async () => {
  const post = (payload) => request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send(payload);
  assert.equal((await post({ name: 'Empty', price: 100, courses: [] })).status, 400, 'no courses');
  assert.equal((await post({ name: '', price: 100, courses: [state.premiere] })).status, 400, 'no name');
  assert.equal((await post({ name: 'Neg', price: -5, courses: [state.premiere] })).status, 400, 'negative price');
  assert.equal((await post({ name: 'Ghost', price: 100, courses: [999999] })).status, 400, 'unknown course');
  assert.equal((await post({ name: 'Pro', price: 100, courses: [state.premiere] })).status, 409, 'duplicate slug');
  assert.equal((await post({ name: 'Taken', price: 100, courses: [state.premiere], woocommerce_product_id: state.plans.pro.product })).status, 409, "another plan's product");
  assert.equal((await post({ name: 'CourseProduct', price: 100, courses: [state.premiere], woocommerce_product_id: 49 })).status, 409, "a course's product");
  assert.equal((await post({ name: 'Weights', price: 100, courses: [{ course_id: state.premiere, revenue_weight: -1 }] })).status, 400, 'negative revenue share');

  const link = await request(app).put(`/api/v1/admin/courses/${state.python}`).set(auth(state.admin)).field('woocommerce_product_id', String(state.plans.pro.product));
  assert.equal(link.status, 409, "a course cannot be linked to a plan's product");
  assert.match(link.body.message, /store plan/i);
});

test('the website can read the plans and their store products (public, no login)', async () => {
  const res = await request(app).get('/api/v1/public/store-plans');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.plans.map((p) => p.slug), ['essential', 'pro', 'complete']);
  const pro = res.body.data.plans.find((p) => p.slug === 'pro');
  assert.equal(pro.woocommerce_product_id, state.plans.pro.product);
  assert.equal(pro.price, 14999);
  assert.deepEqual(pro.courses, ['Premiere Pro A to Z', 'Photoshop for Creators']);
  assert.equal(JSON.stringify(res.body).includes(SECRET), false);

  await request(app).put(`/api/v1/admin/store-plans/${state.plans.essential.id}`).set(auth(state.admin)).send({ name: 'Essential', price: 7999, status: 'inactive', courses: [{ course_id: state.premiere, revenue_weight: 12 }] });
  const hidden = await request(app).get('/api/v1/public/store-plans');
  assert.deepEqual(hidden.body.data.plans.map((p) => p.slug), ['pro', 'complete'], 'an inactive plan is not offered');
  await request(app).put(`/api/v1/admin/store-plans/${state.plans.essential.id}`).set(auth(state.admin)).send({ name: 'Essential', price: 7999, status: 'active', courses: [{ course_id: state.premiere, revenue_weight: 12 }] });
});

test('buying a plan enrols the buyer in exactly the plan courses and splits the price', async () => {
  const { premiere, photoshop, aftereffects } = state;

  // Essential -> Premiere Pro only
  let res = await hook('order.created', wcOrder(3001, { email: 'essential@buyer.test', items: [{ product_id: state.plans.essential.product, subtotal: '7999.00' }] }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.result.action, 'enrolled');
  assert.deepEqual(await enrolled('essential@buyer.test'), [premiere], 'Essential unlocks Premiere Pro only');
  let { order, items } = await itemsOf(3001);
  assert.equal(order.status, 'paid');
  assert.equal(order.sync_note, null, 'a plan is not reported as "not linked to a course"');
  assert.deepEqual(items.map((i) => [i.course_id, Number(i.final_amount)]), [[premiere, 7999]]);

  // Pro -> Premiere Pro + Photoshop, price split 12 : 5
  res = await hook('order.created', wcOrder(3002, { email: 'pro@buyer.test', items: [{ product_id: state.plans.pro.product, subtotal: '14999.00' }] }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await enrolled('pro@buyer.test'), [premiere, photoshop].sort((a, b) => a - b), 'Pro unlocks Premiere Pro + Photoshop');
  ({ order, items } = await itemsOf(3002));
  assert.equal(items.length, 2);
  assert.equal(sum(items, 'final_amount'), 14999, 'course revenue adds up to what the buyer paid');
  assert.equal(Number(order.total_amount), 14999);
  assert.deepEqual(items.map((i) => [i.course_id, Number(i.final_amount)]), [[premiere, 10587.52], [photoshop, 4411.48]].sort((a, b) => a[0] - b[0]));

  // Complete -> all three, split 12 : 5 : 19
  res = await hook('order.created', wcOrder(3003, { email: 'complete@buyer.test', items: [{ product_id: state.plans.complete.product, subtotal: '29999.00' }] }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await enrolled('complete@buyer.test'), [premiere, photoshop, aftereffects].sort((a, b) => a - b), 'Complete unlocks all three');
  ({ items } = await itemsOf(3003));
  assert.equal(items.length, 3);
  assert.equal(sum(items, 'final_amount'), 29999);
  const byCourse = Object.fromEntries(items.map((i) => [i.course_id, Number(i.final_amount)]));
  assert.ok(byCourse[aftereffects] > byCourse[premiere] && byCourse[premiere] > byCourse[photoshop], 'bigger modules earn a bigger share');
});

test('a discount is shared out too, and the same webhook twice changes nothing', async () => {
  const payload = wcOrder(3004, { email: 'discount@buyer.test', items: [{ product_id: state.plans.pro.product, subtotal: '14999.00', total: '12999.00' }] });
  assert.equal((await hook('order.created', payload)).status, 200);
  let { order, items } = await itemsOf(3004);
  assert.equal(sum(items, 'price'), 14999, 'list prices add up to the plan price');
  assert.equal(sum(items, 'final_amount'), 12999, 'paid amounts add up to what was charged');
  assert.equal(sum(items, 'discount_amount'), 2000);
  const enrolledBefore = await enrolled('discount@buyer.test');
  assert.equal((await hook('order.updated', payload)).status, 200);
  assert.equal((await hook('order.updated', payload)).status, 200);
  ({ items } = await itemsOf(3004));
  assert.equal(items.length, 2, 'no duplicate items');
  assert.deepEqual(await enrolled('discount@buyer.test'), enrolledBefore, 'no duplicate enrolments');
  assert.equal(await models.Order.count({ where: { woocommerce_order_id: 3004 } }), 1);
  assert.equal(order.status, 'paid');
});

test('an existing student keeps what they have; upgrades only add the missing courses', async () => {
  // essential@buyer.test already has Premiere Pro from the Essential order; they now buy Complete.
  const res = await hook('order.created', wcOrder(3005, { email: 'essential@buyer.test', items: [{ product_id: state.plans.complete.product, subtotal: '29999.00' }] }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await enrolled('essential@buyer.test'), [state.premiere, state.photoshop, state.aftereffects].sort((a, b) => a - b));
  const user = await models.User.findOne({ where: { email: 'essential@buyer.test' } });
  assert.equal(await models.Enrollment.count({ where: { user_id: user.id, course_id: state.premiere } }), 1, 'one enrolment per course');
});

test('mixed orders: a plan, a single course product and an unknown product', async () => {
  const res = await hook('order.created', wcOrder(3006, {
    email: 'mixed@buyer.test',
    items: [{ product_id: state.plans.essential.product, subtotal: '7999.00' }, { product_id: 49, subtotal: '11.00' }, { product_id: 424242, subtotal: '5.00' }]
  }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await enrolled('mixed@buyer.test'), [state.premiere, state.python].sort((a, b) => a - b));
  const { order, items } = await itemsOf(3006);
  assert.equal(items.length, 2);
  assert.match(order.sync_note, /424242/, 'only the unknown product is reported');
  assert.doesNotMatch(order.sync_note, new RegExp(String(state.plans.essential.product)));
});

test('unpaid orders grant nothing; a refund takes every plan course away', async () => {
  const pending = await hook('order.created', wcOrder(3007, { status: 'pending', email: 'pending@buyer.test', items: [{ product_id: state.plans.pro.product, subtotal: '14999.00' }] }));
  assert.equal(pending.body.result.reason, 'not_paid');
  assert.equal(await models.User.findOne({ where: { email: 'pending@buyer.test' } }), null, 'no account for an unpaid order');

  assert.equal((await hook('order.created', wcOrder(3008, { email: 'refund@buyer.test', items: [{ product_id: state.plans.complete.product, subtotal: '29999.00' }] }))).status, 200);
  assert.equal((await enrolled('refund@buyer.test')).length, 3);
  const refunded = await hook('order.updated', wcOrder(3008, { status: 'refunded', email: 'refund@buyer.test', modified: '2026-10-14T11:00:00', items: [{ product_id: state.plans.complete.product, subtotal: '29999.00' }] }));
  assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
  assert.deepEqual(await enrolled('refund@buyer.test'), [], 'every course of the refunded plan is revoked');
  assert.equal((await itemsOf(3008)).order.status, 'refunded');
});

test('ordinary course products keep working exactly as before', async () => {
  const res = await hook('order.created', wcOrder(3009, { email: 'python@buyer.test', items: [{ product_id: 49, subtotal: '11.00' }] }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await enrolled('python@buyer.test'), [state.python]);
  const { items } = await itemsOf(3009);
  assert.deepEqual(items.map((i) => Number(i.final_amount)), [11]);
});

test('editing a plan changes future orders and updates the store product; deleting trashes it', async () => {
  const proId = state.plans.pro.id;
  // Pro now also includes After Effects, and the price goes up.
  const edit = await request(app).put(`/api/v1/admin/store-plans/${proId}`).set(auth(state.admin)).send({
    name: 'Pro', price: 16999, description: 'updated', courses: [{ course_id: state.premiere, revenue_weight: 1 }, { course_id: state.photoshop, revenue_weight: 1 }, { course_id: state.aftereffects, revenue_weight: 2 }]
  });
  assert.equal(edit.status, 200, edit.body.message);
  assert.equal(edit.body.data.plan.courses.length, 3);
  const put = storeCalls.filter((c) => c.method === 'put').pop();
  assert.equal(put.url.endsWith(`/products/${state.plans.pro.product}`), true);
  assert.equal(put.data.regular_price, '16999.00', 'the store product follows the plan price');
  assert.equal(products.get(state.plans.pro.product).regular_price, '16999.00');

  assert.equal((await hook('order.created', wcOrder(3010, { email: 'edited@buyer.test', items: [{ product_id: state.plans.pro.product, subtotal: '16999.00' }] }))).status, 200);
  assert.equal((await enrolled('edited@buyer.test')).length, 3, 'the edited plan unlocks the new course list');
  const { items } = await itemsOf(3010);
  assert.deepEqual(items.map((i) => Number(i.final_amount)).sort((a, b) => a - b), [4249.75, 4249.75, 8499.5]);
  // an order placed BEFORE the edit keeps its own enrolments and amounts
  assert.equal((await enrolled('pro@buyer.test')).length, 2);

  const del = await request(app).delete(`/api/v1/admin/store-plans/${proId}`).set(auth(state.admin));
  assert.equal(del.status, 200, del.body.message);
  assert.equal(del.body.data.trashed, true);
  assert.equal(products.get(state.plans.pro.product).status, 'trash', 'the plan\'s store product is moved to the trash');
  assert.equal(await models.StorePlan.findByPk(proId), null);
  assert.equal((await itemsOf(3002)).items.length, 2, 'past order items stay after the plan is deleted');
});

test('without a store connection the plan is still saved, just not created in the store', async () => {
  await request(app).put('/api/v1/admin/settings/woocommerce').set(auth(state.admin)).send({ woocommerce_consumer_key: '', woocommerce_consumer_secret: '' });
  const res = await request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send({ name: 'Offline', price: 500, courses: [state.premiere], create_store_product: true });
  assert.equal(res.status, 201, res.body.message);
  assert.equal(res.body.data.store_product.action, 'skipped');
  assert.match(res.body.message, /not connected/i);
  assert.equal(res.body.data.plan.woocommerce_product_id, null);
  const tryCreate = await request(app).post(`/api/v1/admin/store-plans/${res.body.data.plan.id}/store-product`).set(auth(state.admin));
  assert.equal(tryCreate.status, 400);
});

test('only admins can manage plans', async () => {
  const reg = await request(app).post('/api/v1/auth/register').send({ first_name: 'Stu', email: 'stu@test.local', password: 'Student123' });
  assert.equal(reg.status, 201);
  const token = reg.body.data.token;
  assert.equal((await request(app).get('/api/v1/admin/store-plans').set(auth(token))).status, 403);
  assert.equal((await request(app).post('/api/v1/admin/store-plans').set(auth(token)).send({ name: 'X', price: 1, courses: [state.premiere] })).status, 403);
  assert.equal((await request(app).get('/api/v1/admin/store-plans')).status, 401);
});
