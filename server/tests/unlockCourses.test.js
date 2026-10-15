/**
 * Locked plan courses: a student who bought a store plan sees the courses of the other plans as locked
 * ("Included in the Complete plan") and can buy a single locked course at its own fee with Razorpay.
 *
 *   DB_NAME=lms_db_test npm test
 *
 * Refuses to run unless DB_NAME ends with "_test". The WooCommerce side is only a signed webhook; Razorpay's
 * REST API is stubbed at the HTTP adapter level (its SDK builds its own axios client).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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
const SECRET = 'wc_webhook_secret_unlock';
const RZP = { key: 'rzp_test_unlock', secret: 'rzp_secret_unlock' };

let request;
let app;
let models;
let axios;
const state = { rzpOrders: [] };
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64');

before(async () => {
  const env = { ...process.env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password };
  execFileSync(process.execPath, ['scripts/migrate.js', '--fresh'], { cwd: ROOT, env, stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });
  ({ default: request } = await import('supertest'));
  ({ default: app } = await import('../index.js'));
  models = await import('../models/index.js');
  ({ default: axios } = await import('axios'));

  // Razorpay's SDK creates its own axios client (inheriting these defaults), so stub the HTTP adapter.
  const cjsAxios = createRequire(import.meta.url)('axios').default;
  cjsAxios.defaults.adapter = async (config) => {
    if (/api\.razorpay\.com\/v1\/orders/.test(`${config.baseURL || ''}${config.url || ''}`) && String(config.method).toLowerCase() === 'post') {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const order = { id: `order_unlock_${state.rzpOrders.length + 1}`, entity: 'order', amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created', notes: body.notes };
      state.rzpOrders.push(order);
      return { data: order, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    }
    if (/\/payments\//.test(config.url || '')) return { data: { id: 'pay_x', method: 'upi', status: 'captured' }, status: 200, statusText: 'OK', headers: {}, config, request: {} };
    throw new Error(`unexpected HTTP call in test: ${config.method} ${config.baseURL || ''}${config.url}`);
  };
});

after(async () => {
  await models.sequelize.close();
});

const login = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.body.message);
  return res.body.data.token;
};
const wcOrder = (id, { email, productId, amount, status = 'processing', modified = '2026-10-15T10:00:00' }) => ({
  id, number: String(id), status, currency: 'INR', total: amount.toFixed(2), discount_total: '0.00', total_tax: '0.00', customer_id: 0,
  billing: { first_name: 'Plan', last_name: 'Buyer', email, phone: '' }, payment_method: 'razorpay', payment_method_title: 'Razorpay', transaction_id: `pay_${id}`,
  date_created_gmt: '2026-10-15T09:59:00', date_paid_gmt: status === 'processing' ? '2026-10-15T10:00:00' : null, date_modified_gmt: modified,
  line_items: [{ id: id * 10, name: `Plan ${productId}`, product_id: productId, variation_id: 0, quantity: 1, subtotal: amount.toFixed(2), total: amount.toFixed(2) }], coupon_lines: [], refunds: []
});
const hook = (payload) => {
  const body = JSON.stringify(payload);
  return request(app).post('/api/v1/webhooks/woocommerce').set('Content-Type', 'application/json').set('X-WC-Webhook-Topic', 'order.updated').set('X-WC-Webhook-Source', `${STORE}/`).set('X-WC-Webhook-Signature', sign(body)).send(body);
};
/** Registers a student (so they can log in), then buys a plan on the "store" with the same email. */
const studentWithPlan = async (email, planSlug) => {
  const reg = await request(app).post('/api/v1/auth/register').send({ first_name: 'Stu', email, password: 'Student123' });
  assert.equal(reg.status, 201, reg.body.message);
  if (planSlug) {
    const plan = state.plans[planSlug];
    state.wc += 1;
    const res = await hook(wcOrder(state.wc, { email, productId: plan.product, amount: plan.price }));
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return reg.body.data.token;
};
const lockedFor = async (token) => (await request(app).get('/api/v1/student/locked-courses').set(auth(token))).body.data;
const titles = (list) => list.map((c) => c.title).sort();

test('setup: courses with fees, three plans, store connected, Razorpay keys', async () => {
  state.admin = await login(ADMIN.email, ADMIN.password);
  const cats = await request(app).get('/api/v1/public/categories');
  const categoryId = String(cats.body.data.categories[0].id);
  const course = async (title, price) => {
    const res = await request(app).post('/api/v1/admin/courses').set(auth(state.admin)).field('title', title).field('category_id', categoryId).field('price', String(price)).field('status', 'published');
    assert.equal(res.status, 201, res.body.message);
    return res.body.data.course.id;
  };
  state.premiere = await course('Premiere Pro A to Z', 0);
  state.photoshop = await course('Photoshop: Thumbnails, Posters & Branding', 4599);
  state.aftereffects = await course('After Effects + AI Tools', 9999);
  state.free = await course('Free Intro', 0);

  // Curriculum for the course that will be locked (titles must be visible, nothing else).
  const sec = await request(app).post(`/api/v1/admin/courses/${state.photoshop}/sections`).set(auth(state.admin)).send({ title: 'Thumbnail design' });
  assert.equal(sec.status, 201, sec.body.message);
  for (const t of ['Layers and masks', 'Text and effects']) {
    const lec = await request(app).post(`/api/v1/admin/sections/${sec.body.data.section.id}/lectures`).set(auth(state.admin)).send({ title: t, lecture_type: 'video', status: 'published' });
    assert.equal(lec.status, 201, lec.body.message);
  }

  const settings = await request(app).put('/api/v1/admin/settings/woocommerce').set(auth(state.admin)).send({ woocommerce_enabled: 'true', woocommerce_url: STORE, woocommerce_webhook_secret: SECRET });
  assert.equal(settings.status, 200, settings.body.message);

  state.plans = {};
  const make = async (name, price, product, picks) => {
    const res = await request(app).post('/api/v1/admin/store-plans').set(auth(state.admin)).send({ name, price, woocommerce_product_id: product, courses: picks.map((c) => ({ course_id: c, revenue_weight: 1 })) });
    assert.equal(res.status, 201, res.body.message);
    state.plans[name.toLowerCase()] = { id: res.body.data.plan.id, product, price };
  };
  await make('Essential', 7999, 801, [state.premiere]);
  await make('Pro', 14999, 802, [state.premiere, state.photoshop]);
  await make('Complete', 29999, 803, [state.premiere, state.photoshop, state.aftereffects]);
  state.wc = 4000;
});

test('a student without a plan sees no locked courses and cannot unlock anything', async () => {
  const token = await studentWithPlan('noplan@student.test', null);
  const data = await lockedFor(token);
  assert.equal(data.is_plan_buyer, false);
  assert.deepEqual(data.courses, []);
  assert.equal((await request(app).get(`/api/v1/student/locked-courses/${state.photoshop}`).set(auth(token))).status, 404);
  assert.equal((await request(app).post(`/api/v1/student/locked-courses/${state.photoshop}/unlock`).set(auth(token))).status, 404, 'the unlock payment is not a general checkout');
  state.noPlan = token;
});

test('Essential buyer: Premiere Pro is open; Photoshop and After Effects are listed as locked with the plans that include them', async () => {
  state.essential = await studentWithPlan('essential@student.test', 'essential');
  const user = await models.User.findOne({ where: { email: 'essential@student.test' } });
  const enrolled = (await models.Enrollment.findAll({ where: { user_id: user.id, status: 'active' } })).map((e) => e.course_id);
  assert.deepEqual(enrolled, [state.premiere], 'only the plan course is enrolled');

  const data = await lockedFor(state.essential);
  assert.equal(data.is_plan_buyer, true);
  assert.deepEqual(titles(data.courses), ['After Effects + AI Tools', 'Photoshop: Thumbnails, Posters & Branding']);
  const ps = data.courses.find((c) => c.id === state.photoshop);
  assert.deepEqual(ps.included_in.map((p) => p.name), ['Pro', 'Complete'], 'Photoshop is in Pro and Complete');
  assert.equal(ps.lecture_count, 2);
  // upgrade pricing: the plan price MINUS the plan they already have
  assert.deepEqual(data.owned_plan && data.owned_plan.name, 'Essential');
  assert.deepEqual(ps.upgrade_options.map((o) => [o.name, o.price]), [['Pro', 7000], ['Complete', 22000]], 'Pro 14,999 - Essential 7,999 = 7,000; Complete 29,999 - 7,999 = 22,000');
  assert.equal(ps.effective_price, 7000, 'the cheapest way to open it');
  assert.deepEqual(ps.upgrade_options[1].unlocks.map((u) => u.title).sort(), ['After Effects + AI Tools', 'Photoshop: Thumbnails, Posters & Branding']);
  const ae = data.courses.find((c) => c.id === state.aftereffects);
  assert.deepEqual(ae.included_in.map((p) => p.name), ['Complete']);
  assert.deepEqual(ae.upgrade_options.map((o) => [o.name, o.price]), [['Complete', 22000]]);
  assert.equal(JSON.stringify(data).includes('video_url'), false);

  // the locked course really is locked: the player still refuses them
  const player = await request(app).get(`/api/v1/student/courses/${state.photoshop}/learn`).set(auth(state.essential));
  assert.ok([403, 404].includes(player.status), `player blocked (${player.status})`);
});

test('Pro buyer sees only the Complete-only course as locked; Complete buyer sees nothing locked', async () => {
  state.pro = await studentWithPlan('pro@student.test', 'pro');
  const proData = await lockedFor(state.pro);
  assert.deepEqual(titles(proData.courses), ['After Effects + AI Tools']);
  assert.deepEqual(proData.courses[0].upgrade_options.map((o) => [o.name, o.price]), [['Complete', 15000]], 'Complete 29,999 - Pro 14,999 = 15,000');
  const complete = await studentWithPlan('complete@student.test', 'complete');
  const data = await lockedFor(complete);
  assert.equal(data.is_plan_buyer, true);
  assert.deepEqual(data.courses, []);
});

test('the outline of a locked course shows module and lecture titles only, and how to buy it', async () => {
  const res = await request(app).get(`/api/v1/student/locked-courses/${state.photoshop}`).set(auth(state.essential));
  assert.equal(res.status, 200, res.body.message);
  const { course, sections, purchase } = res.body.data;
  assert.equal(course.title, 'Photoshop: Thumbnails, Posters & Branding');
  assert.deepEqual(sections.map((s) => [s.title, s.lectures.map((l) => l.title)]), [['Thumbnail design', ['Layers and masks', 'Text and effects']]]);
  assert.deepEqual(Object.keys(sections[0].lectures[0]).sort(), ['duration_seconds', 'id', 'lecture_type', 'title'], 'no content fields leak');
  assert.deepEqual(purchase.options.map((o) => [o.name, o.price, o.full_price]), [['Pro', 7000, 14999], ['Complete', 22000, 29999]]);
  assert.equal(purchase.owned_plan.name, 'Essential');
  assert.equal(purchase.can_buy, false, 'cannot buy until Razorpay is configured');
  assert.match(purchase.reason, /not available/i);
  assert.equal((await request(app).get(`/api/v1/student/locked-courses/${state.premiere}`).set(auth(state.essential))).status, 404, 'a course the student already has is not "locked"');
  assert.equal((await request(app).get(`/api/v1/student/locked-courses/${state.free}`).set(auth(state.essential))).status, 404, 'courses outside every plan are not offered');
});

test('unlocking needs payment keys and a price; in store mode ordinary in-portal checkout stays blocked', async () => {
  const noKeys = await request(app).post(`/api/v1/student/locked-courses/${state.photoshop}/unlock`).set(auth(state.essential));
  assert.equal(noKeys.status, 503);
  assert.match(noKeys.body.message, /not available/i);

  await request(app).put('/api/v1/admin/settings/payment').set(auth(state.admin)).send({ razorpay_key_id: RZP.key, razorpay_key_secret: RZP.secret }).expect(200);
  const blocked = await request(app).post('/api/v1/student/checkout').set(auth(state.essential)).send({ course_ids: [state.photoshop] });
  assert.equal(blocked.status, 409, 'the general checkout still defers to the store');

});

test('Razorpay payment for the Pro UPGRADE (the difference), verified server-side, then Photoshop opens', async () => {
  const res = await request(app).post(`/api/v1/student/locked-courses/${state.photoshop}/unlock`).set(auth(state.essential));
  assert.equal(res.status, 201, res.body.message);
  const { order, payment } = res.body.data;
  assert.equal(payment.key_id, RZP.key);
  assert.equal(payment.amount, 700000, 'the upgrade price (14,999 - 7,999) in paise');
  assert.equal(payment.currency, 'INR');
  assert.match(payment.razorpay_order_id, /^order_unlock_/);
  assert.equal(order.status, 'pending');
  assert.equal(order.source, 'lms');
  assert.deepEqual(order.items.map((i) => [i.course_id, Number(i.final_amount)]), [[state.photoshop, 7000]]);
  assert.equal(Number(order.total_amount), 7000);
  assert.equal(state.rzpOrders.at(-1).amount, 700000);
  const item = await models.OrderItem.findOne({ where: { order_id: order.id } });
  assert.equal(Number(item.store_plan_id), state.plans.pro.id, 'the item is recorded as a Pro plan purchase');

  // not yet unlocked
  assert.ok((await lockedFor(state.essential)).courses.some((c) => c.id === state.photoshop));

  const bad = await request(app).post('/api/v1/student/payments/verify').set(auth(state.essential)).send({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: 'pay_forged', razorpay_signature: 'nope' });
  assert.equal(bad.status, 400, 'a forged signature is rejected');
  assert.ok((await lockedFor(state.essential)).courses.some((c) => c.id === state.photoshop), 'still locked after a forged payment');

  // a fresh attempt replaces the abandoned one (only one pending order for the course)
  const again = await request(app).post(`/api/v1/student/locked-courses/${state.photoshop}/unlock`).set(auth(state.essential));
  assert.equal(again.status, 201, again.body.message);
  const pending = await models.Order.findAll({ where: { user_id: (await models.User.findOne({ where: { email: 'essential@student.test' } })).id, source: 'lms', status: 'pending' } });
  assert.equal(pending.length, 1, 'older unpaid attempts are closed');

  const pay = again.body.data.payment;
  const ok = await request(app).post('/api/v1/student/payments/verify').set(auth(state.essential)).send({
    razorpay_order_id: pay.razorpay_order_id, razorpay_payment_id: 'pay_ok_1', razorpay_signature: hmac(RZP.secret, `${pay.razorpay_order_id}|pay_ok_1`)
  });
  assert.equal(ok.status, 200, ok.body.message);
  assert.equal(ok.body.data.order.status, 'paid');

  const user = await models.User.findOne({ where: { email: 'essential@student.test' } });
  const enrolled = (await models.Enrollment.findAll({ where: { user_id: user.id, status: 'active' } })).map((e) => e.course_id).sort((a, b) => a - b);
  assert.deepEqual(enrolled, [state.premiere, state.photoshop].sort((a, b) => a - b), 'Premiere Pro + the unlocked Photoshop');
  const after = await lockedFor(state.essential);
  assert.deepEqual(titles(after.courses), ['After Effects + AI Tools'], 'only After Effects is still locked');
  assert.equal(after.owned_plan.name, 'Pro', 'they now count as a Pro owner');
  assert.deepEqual(after.courses[0].upgrade_options.map((o) => [o.name, o.price]), [['Complete', 15000]], 'next upgrade is Complete minus Pro');
  assert.equal((await request(app).get(`/api/v1/student/locked-courses/${state.photoshop}`).set(auth(state.essential))).status, 404, 'no longer locked');

  // the same verification twice changes nothing
  const replay = await request(app).post('/api/v1/student/payments/verify').set(auth(state.essential)).send({
    razorpay_order_id: pay.razorpay_order_id, razorpay_payment_id: 'pay_ok_1', razorpay_signature: hmac(RZP.secret, `${pay.razorpay_order_id}|pay_ok_1`)
  });
  assert.equal(replay.status, 200);
  assert.equal(await models.Enrollment.count({ where: { user_id: user.id, course_id: state.photoshop } }), 1);
});

test('the admin can override an upgrade price; a free upgrade cannot be bought; an owned course cannot be bought again', async () => {
  // Admin sets a custom Pro -> Complete price (the plan form sends upgrade_prices keyed by the smaller plan)
  const complete = state.plans.complete;
  const edit = (upgradePrices) => request(app).put(`/api/v1/admin/store-plans/${complete.id}`).set(auth(state.admin)).send({
    name: 'Complete', price: complete.price, woocommerce_product_id: complete.product, courses: [state.premiere, state.photoshop, state.aftereffects].map((c) => ({ course_id: c, revenue_weight: 1 })), upgrade_prices: upgradePrices
  });
  const saved = await edit({ [state.plans.pro.id]: 12500 });
  assert.equal(saved.status, 200, saved.body.message);
  const listed = (await request(app).get('/api/v1/admin/store-plans').set(auth(state.admin))).body.data.plans.find((p) => p.id === complete.id);
  assert.deepEqual(listed.upgrades.map((u) => [u.from_name, u.auto_price, u.price, u.effective_price]), [['Essential', 22000, null, 22000], ['Pro', 15000, 12500, 12500]]);
  const custom = await request(app).get(`/api/v1/student/locked-courses/${state.aftereffects}`).set(auth(state.essential));
  assert.deepEqual(custom.body.data.purchase.options.map((o) => o.price), [12500], 'the override is what the Pro owner pays');

  // A 0 upgrade price cannot be bought
  assert.equal((await edit({ [state.plans.pro.id]: 0 })).status, 200);
  const res = await request(app).post(`/api/v1/student/locked-courses/${state.aftereffects}/unlock`).set(auth(state.essential));
  assert.equal(res.status, 400);
  assert.match(res.body.message, /price/i);
  const outline = await request(app).get(`/api/v1/student/locked-courses/${state.aftereffects}`).set(auth(state.essential));
  assert.equal(outline.body.data.purchase.can_buy, false);

  // Clearing the override goes back to the automatic difference
  assert.equal((await edit({ [state.plans.pro.id]: '' })).status, 200);
  const back = await request(app).get(`/api/v1/student/locked-courses/${state.aftereffects}`).set(auth(state.essential));
  assert.deepEqual(back.body.data.purchase.options.map((o) => o.price), [15000]);

  const owned = await request(app).post(`/api/v1/student/locked-courses/${state.premiere}/unlock`).set(auth(state.essential));
  assert.equal(owned.status, 404, 'a course the student already has cannot be bought again');
});

test('refunding the plan order removes plan access and the locked list; the separately bought course stays', async () => {
  const plan = state.plans.essential;
  const user = await models.User.findOne({ where: { email: 'essential@student.test' } });
  const order = await models.Order.findOne({ where: { user_id: user.id, source: 'woocommerce' } });
  assert.ok(order, 'the Essential store order exists');
  const res = await hook(wcOrder(Number(order.woocommerce_order_id), { email: 'essential@student.test', productId: plan.product, amount: plan.price, status: 'refunded', modified: '2026-10-15T12:00:00' }));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = await lockedFor(state.essential);
  assert.equal(data.owned_plan.name, 'Pro', 'the Pro upgrade they paid for separately still counts');
  const premiere = data.courses.find((c) => c.id === state.premiere);
  assert.ok(premiere, 'Premiere Pro is locked again after the refund');
  assert.deepEqual(premiere.upgrade_options.map((o) => [o.name, o.price]), [['Complete', 15000]], 'only bigger plans than the owned one are offered');
  const active = (await models.Enrollment.findAll({ where: { user_id: user.id, status: 'active' } })).map((e) => e.course_id);
  assert.deepEqual(active, [state.photoshop], 'only the course they paid for separately remains');
});

test('only students can use the locked-course endpoints', async () => {
  const tutor = await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
  assert.equal((await request(app).get('/api/v1/student/locked-courses').set(auth(tutor.body.data.token))).status, 403);
  assert.equal((await request(app).get('/api/v1/student/locked-courses')).status, 401);
});
