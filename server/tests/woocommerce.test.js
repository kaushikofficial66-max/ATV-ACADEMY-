/**
 * WooCommerce -> LMS integration test (store purchases enroll students).
 *
 *   DB_NAME=lms_db_test npm test
 *
 * Same safety rules as e2e.test.js: refuses to run unless DB_NAME ends with
 * "_test"; the database is recreated and seeded first. The WooCommerce REST
 * API is stubbed in-process (axios.request), webhooks are signed like WooCommerce
 * does (base64 HMAC-SHA256 of the raw body).
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
const SECRET = 'wc_webhook_secret_123';
const PRODUCT = { A: 325, B: 326, C: 327 };

let request;
let app;
let models;
let axios;
const state = {};
const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  const env = { ...process.env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password };
  execFileSync(process.execPath, ['scripts/migrate.js', '--fresh'], { cwd: ROOT, env, stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env, stdio: 'ignore' });

  ({ default: request } = await import('supertest'));
  ({ default: app } = await import('../index.js'));
  models = await import('../models/index.js');
  ({ default: axios } = await import('axios'));
});

after(async () => {
  await models.sequelize.close();
});

const login = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.body.message);
  return res.body.data.token;
};

/** WooCommerce REST v3 order shape (only the fields the LMS reads, plus noise). */
const wcOrder = (id, { status = 'processing', email = 'new.buyer@example.com', items = [{ product_id: PRODUCT.A }], modified = '2026-10-05T10:00:00', refunds = [], coupons = ['atv500'] } = {}) => {
  const lineItems = items.map((it, i) => ({
    id: id * 10 + i,
    name: `Product ${it.product_id}`,
    product_id: it.product_id,
    variation_id: it.variation_id || 0,
    quantity: it.quantity || 1,
    subtotal: it.subtotal || '10000.00',
    total: it.total || '9500.00'
  }));
  const total = lineItems.reduce((s, l) => s + Number(l.total), 0);
  const subtotal = lineItems.reduce((s, l) => s + Number(l.subtotal), 0);
  return {
    id,
    number: String(id),
    status,
    currency: 'INR',
    total: total.toFixed(2),
    discount_total: (subtotal - total).toFixed(2),
    total_tax: '0.00',
    customer_id: 77,
    billing: { first_name: 'New', last_name: 'Buyer', email, phone: '+91 98765 00000', address_1: 'not synced' },
    payment_method: 'razorpay',
    payment_method_title: 'Credit Card / UPI (Razorpay)',
    transaction_id: `pay_${id}`,
    date_created_gmt: '2026-10-05T09:59:00',
    date_paid_gmt: ['processing', 'completed'].includes(status) ? '2026-10-05T10:00:00' : null,
    date_modified_gmt: modified,
    line_items: lineItems,
    coupon_lines: coupons.map((code) => ({ code, discount: '500.00' })),
    refunds
  };
};

const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('base64');

const hook = (topic, payload, { secret = SECRET, source = `${STORE}/`, signature } = {}) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const req = request(app).post('/api/v1/webhooks/woocommerce').set('Content-Type', 'application/json').set('X-WC-Webhook-Topic', topic);
  if (source) req.set('X-WC-Webhook-Source', source);
  const sig = signature === undefined ? sign(body, secret) : signature;
  if (sig) req.set('X-WC-Webhook-Signature', sig);
  return req.send(body);
};

const enrollmentOf = (userId, courseId) => models.Enrollment.findOne({ where: { user_id: userId, course_id: courseId } });
const mirrorOf = (wcId) => models.Order.findOne({ where: { woocommerce_order_id: wcId } });

test('setup: admin maps WooCommerce products to courses and enables the store', async () => {
  state.admin = await login(ADMIN.email, ADMIN.password);
  const cats = await request(app).get('/api/v1/public/categories');
  const categoryId = String(cats.body.data.categories[0].id);

  const createCourse = async (title, price, productId) => {
    const req = request(app).post('/api/v1/admin/courses').set(auth(state.admin)).field('title', title).field('category_id', categoryId).field('price', String(price)).field('status', 'published');
    if (productId) req.field('woocommerce_product_id', String(productId));
    const res = await req;
    assert.equal(res.status, 201, res.body.message);
    return res.body.data.course;
  };
  state.courseA = (await createCourse('React JS Masterclass', 10000, PRODUCT.A)).id;
  state.courseB = (await createCourse('Node JS Bootcamp', 10000, PRODUCT.B)).id;
  state.courseC = (await createCourse('SQL Basics', 10000, null)).id;
  state.freeCourse = (await createCourse('Free Intro', 0, null)).id;

  const mapLater = await request(app).put(`/api/v1/admin/courses/${state.courseC}`).set(auth(state.admin)).field('woocommerce_product_id', String(PRODUCT.C));
  assert.equal(mapLater.status, 200, mapLater.body.message);
  assert.equal(Number(mapLater.body.data.course.woocommerce_product_id), PRODUCT.C);

  const duplicate = await request(app).put(`/api/v1/admin/courses/${state.freeCourse}`).set(auth(state.admin)).field('woocommerce_product_id', String(PRODUCT.A));
  assert.equal(duplicate.status, 409, 'one product cannot map to two courses');

  const settings = await request(app)
    .put('/api/v1/admin/settings/woocommerce')
    .set(auth(state.admin))
    .send({ woocommerce_enabled: 'true', woocommerce_url: STORE, woocommerce_webhook_secret: SECRET });
  assert.equal(settings.status, 200, settings.body.message);

  const pub = await request(app).get('/api/v1/public/settings');
  assert.equal(pub.body.data.settings?.woocommerce_enabled ?? pub.body.data.woocommerce_enabled, true);
  assert.equal(JSON.stringify(pub.body).includes(SECRET), false, 'webhook secret is never public');

  const reg = await request(app).post('/api/v1/auth/register').send({ first_name: 'Esha', email: 'existing@test.local', password: 'Student123' });
  assert.equal(reg.status, 201);
  state.existingId = reg.body.data.user.id;
  state.existing = reg.body.data.token;
});

test('webhook security: ping, signature, source and payload validation', async () => {
  const ping = await request(app).post('/api/v1/webhooks/woocommerce').set('Content-Type', 'application/x-www-form-urlencoded').send('webhook_id=12');
  assert.equal(ping.status, 200);
  assert.equal(ping.body.ping, true);

  const payload = wcOrder(900);
  assert.equal((await hook('order.created', payload, { signature: null })).status, 401, 'unsigned request rejected');
  assert.equal((await hook('order.created', payload, { secret: 'wrong' })).status, 401, 'wrong secret rejected');
  assert.equal((await hook('order.created', payload, { source: 'https://staging.example.com' })).status, 403, 'foreign store rejected');
  assert.equal((await hook('order.created', { id: 900, status: 'processing' })).status, 400, 'missing line_items rejected');
  assert.equal((await hook('order.created', { ...payload, status: 'bogus' })).status, 400, 'unknown status rejected');
  assert.equal((await hook('order.created', '{not json')).status, 400);
  assert.equal((await hook('coupon.updated', { id: 1 })).body.ignored, true, 'other topics acknowledged but ignored');
  assert.equal((await hook('product.updated', { id: 1 })).body.result.reason, 'not_linked', 'products not linked to a course are ignored');
  assert.equal(await mirrorOf(900), null, 'nothing synced from rejected requests');
  assert.equal(await models.User.findOne({ where: { email: 'new.buyer@example.com' } }), null);

  // Enrollment cannot be created through any student/public API.
  const fake = await request(app).post('/api/v1/student/purchases/woocommerce/900').set(auth(state.existing));
  assert.equal(fake.status, 404);
});

test('new customer purchase creates the LMS user, mirror order, payment reference and enrollment', async () => {
  const res = await hook('order.created', wcOrder(1001, { email: '  New.Buyer@Example.COM ' }));
  assert.equal(res.status, 200, res.body.message);
  assert.equal(res.body.result.action, 'enrolled');
  assert.equal(res.body.result.user_created, true);
  assert.equal(JSON.stringify(res.body).includes('example.com'), false, 'no customer PII in the webhook response');

  const user = await models.User.findOne({ where: { email: 'new.buyer@example.com' }, include: ['role'] });
  assert.ok(user, 'email normalised');
  assert.equal(user.role.name, 'student');
  assert.equal(user.status, 'active');
  assert.equal(Number(user.woocommerce_customer_id), 77);
  assert.equal(user.phone, '+919876500000');
  state.buyerId = user.id;
  assert.ok(await models.PasswordReset.findOne({ where: { user_id: user.id, used_at: null } }), 'set-password link issued');

  const order = await mirrorOf(1001);
  assert.equal(order.source, 'woocommerce');
  assert.equal(order.order_number, 'WC-1001');
  assert.equal(order.status, 'paid');
  assert.equal(order.woocommerce_status, 'processing');
  assert.equal(Number(order.total_amount), 9500, 'WooCommerce decides the discounted total');
  assert.equal(Number(order.discount_amount), 500);
  assert.equal(order.coupon_codes, 'ATV500');
  assert.equal(order.coupon_id, null, 'no LMS coupon involved');

  const payments = await models.Payment.findAll({ where: { order_id: order.id } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].payment_gateway, 'woocommerce');
  assert.equal(payments[0].status, 'success');
  assert.equal(payments[0].gateway_payment_id, 'pay_1001');
  assert.equal(JSON.stringify(payments[0].raw_response).includes('not synced'), false, 'billing address not stored');

  const enrollment = await enrollmentOf(user.id, state.courseA);
  assert.equal(enrollment.status, 'active');
  assert.equal(enrollment.order_id, order.id, 'enrollment references the WooCommerce order mirror');
});

test('duplicate / retried webhooks are idempotent', async () => {
  const payload = wcOrder(1001, { email: 'new.buyer@example.com' });
  const again = await hook('order.created', payload);
  assert.equal(again.body.result.action, 'already_paid');
  const completed = await hook('order.updated', { ...payload, status: 'completed', date_modified_gmt: '2026-10-05T10:05:00' });
  assert.equal(completed.status, 200);

  // Concurrent deliveries of a brand-new order.
  const fresh = wcOrder(1010, { email: 'race@example.com' });
  const results = await Promise.all([hook('order.created', fresh), hook('order.updated', fresh), hook('order.updated', fresh)]);
  results.forEach((r) => assert.equal(r.status, 200, r.body.message));

  assert.equal(await models.User.count({ where: { email: 'new.buyer@example.com' } }), 1);
  assert.equal(await models.User.count({ where: { email: 'race@example.com' } }), 1);
  for (const wcId of [1001, 1010]) {
    const order = await mirrorOf(wcId);
    assert.equal(await models.Order.count({ where: { woocommerce_order_id: wcId } }), 1);
    assert.equal(await models.Payment.count({ where: { order_id: order.id } }), 1);
    assert.equal(await models.Enrollment.count({ where: { user_id: order.user_id, course_id: state.courseA } }), 1);
  }
  assert.equal((await mirrorOf(1001)).woocommerce_status, 'completed');
});

test('existing customer: no duplicate user; multiple courses, quantities and unmapped products', async () => {
  const payload = wcOrder(1002, {
    email: 'EXISTING@test.local',
    items: [{ product_id: PRODUCT.B }, { product_id: PRODUCT.C, quantity: 2, subtotal: '20000.00', total: '19000.00' }, { product_id: 999, total: '500.00', subtotal: '500.00' }]
  });
  const res = await hook('order.created', payload);
  assert.equal(res.body.result.action, 'enrolled');
  assert.equal(res.body.result.user_created, false);
  assert.equal(Number(res.body.result.user_id), Number(state.existingId));
  assert.equal(await models.User.count({ where: { email: 'existing@test.local' } }), 1);

  for (const courseId of [state.courseB, state.courseC]) {
    assert.equal((await enrollmentOf(state.existingId, courseId)).status, 'active');
    const learn = await request(app).get(`/api/v1/student/courses/${courseId}/learn`).set(auth(state.existing));
    assert.equal(learn.status, 200, 'student can open the purchased course');
  }
  const order = await mirrorOf(1002);
  const items = await models.OrderItem.findAll({ where: { order_id: order.id } });
  assert.equal(items.length, 2, 'only course lines are mirrored');
  assert.match(order.sync_note, /999/);
  assert.match(order.sync_note, /Quantity/);

  const orders = await request(app).get('/api/v1/student/orders').set(auth(state.existing));
  const mine = orders.body.data.orders.find((o) => o.woocommerce_order_id === 1002 || Number(o.woocommerce_order_id) === 1002);
  assert.equal(mine.store_order_url, `${STORE}/my-account/view-order/1002/`);
  assert.equal(mine.sync_note, undefined, 'internal sync notes are hidden from students');

  const status = await request(app).get('/api/v1/student/purchases/woocommerce/1002').set(auth(state.existing));
  assert.equal(status.body.data.status, 'paid');
  assert.equal(status.body.data.order.courses.length, 2);
  const notMine = await request(app).get('/api/v1/student/purchases/woocommerce/1001').set(auth(state.existing));
  assert.equal(notMine.body.data.status, 'processing', "another customer's order is not revealed");
  assert.equal(notMine.body.data.order, null);
});

test('failed, pending and cancelled orders never grant access', async () => {
  const failed = await hook('order.created', wcOrder(1003, { status: 'failed', email: 'failed@example.com' }));
  assert.equal(failed.body.result.action, 'ignored');
  assert.equal(await models.User.findOne({ where: { email: 'failed@example.com' } }), null, 'no account for unpaid checkouts');

  const pending = await hook('order.created', wcOrder(1004, { status: 'pending', email: 'later@example.com' }));
  assert.equal(pending.body.result.reason, 'not_paid');
  const onHold = await hook('order.updated', wcOrder(1004, { status: 'on-hold', email: 'later@example.com', modified: '2026-10-05T10:01:00' }));
  assert.equal(onHold.body.result.reason, 'not_paid');
  const paid = await hook('order.updated', wcOrder(1004, { status: 'completed', email: 'later@example.com', modified: '2026-10-05T10:02:00' }));
  assert.equal(paid.body.result.action, 'enrolled');
  const later = await models.User.findOne({ where: { email: 'later@example.com' } });
  assert.equal((await enrollmentOf(later.id, state.courseA)).status, 'active');

  const cancelled = await hook('order.updated', wcOrder(1004, { status: 'cancelled', email: 'later@example.com', modified: '2026-10-05T10:03:00' }));
  assert.equal(cancelled.body.result.action, 'cancelled_access_revoked');
  assert.equal((await enrollmentOf(later.id, state.courseA)).status, 'cancelled', 'history kept, access removed');
  assert.equal((await mirrorOf(1004)).status, 'cancelled');

  // Payment failure after the order existed (e.g. disputed / on-hold again).
  await hook('order.updated', wcOrder(1004, { status: 'processing', email: 'later@example.com', modified: '2026-10-05T10:04:00' }));
  assert.equal((await enrollmentOf(later.id, state.courseA)).status, 'active', 're-opened order restores access');
  await hook('order.updated', wcOrder(1004, { status: 'failed', email: 'later@example.com', modified: '2026-10-05T10:05:00' }));
  assert.equal((await enrollmentOf(later.id, state.courseA)).status, 'cancelled');
  assert.equal((await mirrorOf(1004)).status, 'failed');
});

test('refunds revoke access; stale replays and deletions are handled', async () => {
  const learnBefore = await enrollmentOf(state.buyerId, state.courseA);
  assert.equal(learnBefore.status, 'active');

  const refund = await hook('order.updated', wcOrder(1001, { status: 'refunded', email: 'new.buyer@example.com', modified: '2026-10-05T11:00:00' }));
  assert.equal(refund.body.result.action, 'refunded_access_revoked');
  const order = await mirrorOf(1001);
  assert.equal(order.status, 'refunded');
  assert.equal((await models.Payment.findOne({ where: { order_id: order.id } })).status, 'refunded');
  assert.equal((await enrollmentOf(state.buyerId, state.courseA)).status, 'cancelled');

  // An older "processing" delivery arriving late must not restore access.
  const stale = await hook('order.updated', wcOrder(1001, { status: 'processing', email: 'new.buyer@example.com', modified: '2026-10-05T10:00:00' }));
  assert.equal(stale.body.result.action, 'stale');
  assert.equal((await enrollmentOf(state.buyerId, state.courseA)).status, 'cancelled');

  // Deleting / trashing an order on the store.
  await hook('order.created', wcOrder(1005, { email: 'trash@example.com' }));
  const trashUser = await models.User.findOne({ where: { email: 'trash@example.com' } });
  assert.equal((await enrollmentOf(trashUser.id, state.courseA)).status, 'active');
  const deleted = await hook('order.deleted', { id: 1005 });
  assert.equal(deleted.body.result.action, 'cancelled');
  assert.equal((await enrollmentOf(trashUser.id, state.courseA)).status, 'cancelled');

  // A refund of one purchase does not remove a course the student also owns through another paid order.
  await hook('order.created', wcOrder(1006, { email: 'twice@example.com', modified: '2026-10-05T12:00:00' }));
  await hook('order.created', wcOrder(1007, { email: 'twice@example.com', modified: '2026-10-05T12:00:00' }));
  const twice = await models.User.findOne({ where: { email: 'twice@example.com' } });
  await hook('order.updated', wcOrder(1006, { status: 'refunded', email: 'twice@example.com', modified: '2026-10-05T12:30:00' }));
  const kept = await enrollmentOf(twice.id, state.courseA);
  assert.equal(kept.status, 'active');
  assert.equal(kept.order_id, (await mirrorOf(1007)).id);
});

test('partial refunds and the REST API: line refunds, resync, reconcile, status pull, store outage', async () => {
  // Without REST keys a partial refund is flagged for the admin instead of guessed.
  await hook('order.created', wcOrder(1008, { email: 'partial@example.com', items: [{ product_id: PRODUCT.A }, { product_id: PRODUCT.B }], modified: '2026-10-05T13:00:00' }));
  const partialNoApi = wcOrder(1008, { status: 'completed', email: 'partial@example.com', items: [{ product_id: PRODUCT.A }, { product_id: PRODUCT.B }], modified: '2026-10-05T13:10:00', refunds: [{ id: 5, total: '-9500.00' }] });
  await hook('order.updated', partialNoApi);
  assert.match((await mirrorOf(1008)).sync_note, /REST API/);

  await request(app)
    .put('/api/v1/admin/settings/woocommerce')
    .set(auth(state.admin))
    .send({ woocommerce_consumer_key: 'ck_test', woocommerce_consumer_secret: 'cs_test' })
    .expect(200);

  const store = new Map();
  const realRequest = axios.request;
  let storeDown = false;
  const calls = [];
  axios.request = async (config) => {
    const { url } = config;
    calls.push({ url, auth: config?.auth });
    if (storeDown) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const refunds = url.match(/\/orders\/(\d+)\/refunds$/);
    if (refunds) return { data: store.get(`refunds:${refunds[1]}`) || [], headers: {} };
    const one = url.match(/\/orders\/(\d+)$/);
    if (one) {
      if (!store.has(one[1])) throw Object.assign(new Error('404'), { response: { status: 404, data: { message: 'Invalid ID.' } } });
      return { data: store.get(one[1]), headers: {} };
    }
    if (url.endsWith('/orders')) return { data: [...store.entries()].filter(([k]) => /^\d+$/.test(k)).map(([, v]) => v), headers: { 'x-wp-totalpages': '1' } };
    throw new Error(`unexpected ${url}`);
  };

  try {
    // Line-item refund of course B only.
    store.set('refunds:1008', [{ id: 5, line_items: [{ product_id: PRODUCT.B, variation_id: 0, quantity: -1, total: '-9500.00' }] }]);
    store.set('1008', { ...partialNoApi, date_modified_gmt: '2026-10-05T13:20:00' });
    const resync = await request(app).post('/api/v1/admin/woocommerce/orders/1008/sync').set(auth(state.admin));
    assert.equal(resync.status, 200, resync.body.message);
    assert.equal(calls[0].url, `${STORE}/wp-json/wc/v3/orders/1008`);
    assert.deepEqual(calls[0].auth, { username: 'ck_test', password: 'cs_test' });
    const partialUser = await models.User.findOne({ where: { email: 'partial@example.com' } });
    assert.equal((await enrollmentOf(partialUser.id, state.courseA)).status, 'active', 'unrefunded course kept');
    assert.equal((await enrollmentOf(partialUser.id, state.courseB)).status, 'cancelled', 'refunded course revoked');
    assert.equal((await mirrorOf(1008)).status, 'paid');

    // Webhook never arrived: the student's purchase-complete page pulls the order from the store.
    const missed = await request(app).post('/api/v1/auth/register').send({ first_name: 'Mia', email: 'missed@test.local', password: 'Student123' });
    store.set('1020', wcOrder(1020, { email: 'missed@test.local', modified: '2026-10-05T14:00:00' }));
    const status = await request(app).get('/api/v1/student/purchases/woocommerce/1020').set(auth(missed.body.data.token));
    assert.equal(status.body.data.status, 'paid', 'verified with WooCommerce, then enrolled');
    assert.equal((await enrollmentOf(missed.body.data.user.id, state.courseA)).status, 'active');

    // Reconciliation picks up orders whose webhooks failed.
    store.set('1021', wcOrder(1021, { email: 'reconcile@example.com', modified: '2026-10-05T14:30:00' }));
    const recon = await request(app).post('/api/v1/admin/woocommerce/reconcile').set(auth(state.admin)).send({ since: '2026-10-05T00:00:00Z' });
    assert.equal(recon.status, 200, recon.body.message);
    assert.equal(recon.body.data.failed, 0);
    assert.ok(await mirrorOf(1021));

    // Store unavailable: clear error, nothing changes.
    storeDown = true;
    const down = await request(app).post('/api/v1/admin/woocommerce/orders/1021/sync').set(auth(state.admin));
    assert.equal(down.status, 502);
    assert.match(down.body.message, /WooCommerce API error/);
    assert.equal(down.body.message.includes('cs_test'), false, 'secrets never echoed');
  } finally {
    axios.request = realRequest;
  }
});

test('LMS checkout, coupons and admin payment actions defer to WooCommerce', async () => {
  const cart = await request(app).post('/api/v1/student/cart').set(auth(state.existing)).send({ course_id: state.courseA });
  assert.equal(cart.status, 409);
  assert.match(cart.body.message, /antarikshtv\.com/);
  const paid = await request(app).post('/api/v1/student/checkout').set(auth(state.existing)).send({ course_ids: [state.courseA] });
  assert.equal(paid.status, 409, 'no second payment system');
  const coupon = await request(app).post('/api/v1/student/cart/apply-coupon').set(auth(state.existing)).send({ code: 'ATV500' });
  assert.equal(coupon.status, 409, 'no second coupon system');
  const free = await request(app).post('/api/v1/student/checkout').set(auth(state.existing)).send({ course_ids: [state.freeCourse] });
  assert.equal(free.status, 201, 'free courses still enroll in the LMS');

  const order = await mirrorOf(1002);
  const markPaid = await request(app).patch(`/api/v1/admin/orders/${order.id}/status`).set(auth(state.admin)).send({ status: 'cancelled' });
  assert.equal(markPaid.status, 400);
  const refund = await request(app).post(`/api/v1/admin/orders/${order.id}/refund`).set(auth(state.admin)).send({});
  assert.equal(refund.status, 400);
  const studentCancel = await request(app).post(`/api/v1/student/orders/${order.id}/cancel`).set(auth(state.existing));
  assert.equal(studentCancel.status, 400);

  const list = await request(app).get('/api/v1/admin/orders?source=woocommerce').set(auth(state.admin));
  assert.ok(list.body.data.orders.length >= 5);
  assert.ok(list.body.data.orders.every((o) => o.source === 'woocommerce'));

  const course = await request(app).get('/api/v1/public/courses').set(auth(state.existing));
  const slug = course.body.data.courses.find((c) => c.id === state.courseA).slug;
  const detail = await request(app).get(`/api/v1/public/courses/${slug}`);
  assert.equal(detail.body.data.course.purchase.store_checkout, true);
  assert.equal(detail.body.data.course.purchase.purchase_url, `${STORE}/checkout/?add-to-cart=${PRODUCT.A}`);

  // Store revenue flows into the existing LMS reports / tutor earnings tables.
  const dash = await request(app).get('/api/v1/admin/dashboard').set(auth(state.admin));
  assert.equal(dash.status, 200);
});

test('store products: course creation creates a draft product; WordPress changes sync back; archive / delete follow', async () => {
  const cats = await request(app).get('/api/v1/public/categories');
  const categoryId = String(cats.body.data.categories[0].id);

  // In-memory WooCommerce product store.
  const products = new Map();
  let nextId = 500;
  const calls = [];
  const fail = { create: false, createThenTimeout: false, stripAuthHeader: false };
  const realRequest = axios.request;
  const wcError = (status, code, message) => Object.assign(new Error(message), { response: { status, data: { code, message } } });
  const toProduct = (p) => ({ ...p, price: p.sale_price || p.regular_price, on_sale: Boolean(p.sale_price) });

  axios.request = async (config) => {
    const { method, url, params = {}, data } = config;
    calls.push({ method, url, params, auth: config.auth, data });
    if (fail.stripAuthHeader && config.auth) throw wcError(401, 'woocommerce_rest_cannot_view', 'Sorry, you cannot list resources.');
    const one = url.match(/\/products\/(\d+)$/);
    if (method === 'post' && url.endsWith('/products')) {
      if (fail.create) throw wcError(500, 'internal', 'Store temporarily unavailable');
      if ([...products.values()].some((p) => p.sku === data.sku && p.status !== 'trash')) throw wcError(400, 'product_invalid_sku', 'Invalid or duplicated SKU.');
      const product = toProduct({ ...data, id: nextId++, permalink: `${STORE}/product/${data.sku}/` });
      products.set(product.id, product);
      if (fail.createThenTimeout) throw Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' });
      return { data: product, headers: {} };
    }
    if (method === 'put' && one) {
      const product = toProduct({ ...products.get(Number(one[1])), ...data });
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

  const createCourse = (title, price, discount) => {
    const req = request(app).post('/api/v1/admin/courses').set(auth(state.admin)).field('title', title).field('category_id', categoryId).field('price', String(price)).field('status', 'published');
    if (discount !== undefined) req.field('discount_price', String(discount));
    return req;
  };
  const courseRow = (id) => models.Course.findByPk(id);
  const detailOf = async (id) => (await request(app).get(`/api/v1/public/courses/${(await courseRow(id)).slug}`)).body.data.course.purchase;

  try {
    // 1. Paid course -> draft product with the course's details, linked automatically.
    const created = await createCourse('Astro Photography', 4999, 3999);
    assert.equal(created.status, 201, created.body.message);
    assert.equal(created.body.data.store_product.action, 'created');
    assert.match(created.body.message, /draft product/);
    const astroId = created.body.data.course.id;
    const productId = Number(created.body.data.course.woocommerce_product_id);
    const posted = calls.find((c) => c.method === 'post').data;
    assert.deepEqual(
      { status: posted.status, virtual: posted.virtual, type: posted.type, sku: posted.sku, regular: posted.regular_price, sale: posted.sale_price, name: posted.name },
      { status: 'draft', virtual: true, type: 'simple', sku: `atv-course-${astroId}`, regular: '4999.00', sale: '3999.00', name: 'Astro Photography' }
    );
    assert.equal((await courseRow(astroId)).woocommerce_product_status, 'draft');
    assert.equal((await detailOf(astroId)).purchase_url, null, 'not buyable until published in WordPress');

    // 2. Free courses do not get a store product.
    const free = await createCourse('Free Astronomy Basics', 0);
    assert.equal(free.body.data.store_product.reason, 'free_course');
    assert.equal(free.body.data.course.woocommerce_product_id, null);

    // 3. Published + repriced in WordPress -> product webhook updates the course instantly.
    const published = { ...products.get(productId), status: 'publish', regular_price: '5999.00', sale_price: '', on_sale: false, price: '5999.00' };
    products.set(productId, published);
    const hookRes = await hook('product.updated', published);
    assert.equal(hookRes.body.result.action, 'synced');
    let astro = await courseRow(astroId);
    assert.equal(Number(astro.price), 5999);
    assert.equal(astro.discount_price, null);
    assert.equal(astro.woocommerce_product_status, 'publish');
    assert.equal((await detailOf(astroId)).purchase_url, `${STORE}/checkout/?add-to-cart=${productId}`);

    // 4. The LMS cannot change the price of a linked course (WooCommerce owns it).
    const edit = await request(app).put(`/api/v1/admin/courses/${astroId}`).set(auth(state.admin)).field('price', '1').field('title', 'Astro Photography Pro');
    assert.equal(edit.status, 200, edit.body.message);
    assert.match(edit.body.message, /managed in WooCommerce/);
    astro = await courseRow(astroId);
    assert.equal(Number(astro.price), 5999);
    assert.equal(astro.title, 'Astro Photography Pro', 'other course fields still save');
    assert.equal(calls.filter((c) => c.method === 'put').length, 0, 'course edits never overwrite the store product');

    // 5. "Sync now" (and the hourly job) read changes made without a webhook.
    products.set(productId, { ...products.get(productId), regular_price: '6499.00', sale_price: '5499.00', on_sale: true, price: '5499.00' });
    const sync = await request(app).post('/api/v1/admin/woocommerce/products/sync').set(auth(state.admin)).send({});
    assert.equal(sync.status, 200, sync.body.message);
    astro = await courseRow(astroId);
    assert.equal(Number(astro.price), 6499);
    assert.equal(Number(astro.discount_price), 5499);

    // 6. Archiving the course stops sales on the store.
    const archived = await request(app).patch(`/api/v1/admin/courses/${astroId}/status`).set(auth(state.admin)).send({ status: 'archived' });
    assert.equal(archived.status, 200, archived.body.message);
    assert.equal(products.get(productId).status, 'draft');
    assert.equal((await courseRow(astroId)).woocommerce_product_status, 'draft');

    // 7. Store down at creation: course still saved, error recorded, admin retry works.
    fail.create = true;
    const offline = await createCourse('Telescope Making', 2999);
    assert.equal(offline.status, 201, 'course creation never fails because of the store');
    assert.equal(offline.body.data.store_product.action, 'error');
    const telescopeId = offline.body.data.course.id;
    assert.match((await courseRow(telescopeId)).woocommerce_sync_error, /unavailable/);
    fail.create = false;
    const retry = await request(app).post(`/api/v1/admin/courses/${telescopeId}/woocommerce-product`).set(auth(state.admin));
    assert.equal(retry.status, 201, retry.body.message);
    assert.equal((await courseRow(telescopeId)).woocommerce_sync_error, null);

    // 8. A timed-out create that actually succeeded is re-linked by SKU, never duplicated.
    fail.createThenTimeout = true;
    const timedOut = await createCourse('Star Charts', 1999);
    fail.createThenTimeout = false;
    const starId = timedOut.body.data.course.id;
    assert.equal(timedOut.body.data.store_product.action, 'error');
    const relink = await request(app).put(`/api/v1/admin/courses/${starId}`).set(auth(state.admin)).field('title', 'Star Charts');
    assert.equal(relink.body.data.store_product.action, 'linked');
    assert.equal([...products.values()].filter((p) => p.sku === `atv-course-${starId}`).length, 1);

    // 9. Deleting a course (no sales) trashes the product the LMS created.
    const starProduct = Number((await courseRow(starId)).woocommerce_product_id);
    const del = await request(app).delete(`/api/v1/admin/courses/${starId}`).set(auth(state.admin));
    assert.equal(del.status, 200, del.body.message);
    assert.equal(products.get(starProduct).status, 'trash');

    // 10. Product deleted in WordPress -> course flagged for the admin.
    const telescopeProduct = Number((await courseRow(telescopeId)).woocommerce_product_id);
    await hook('product.deleted', { id: telescopeProduct });
    assert.match((await courseRow(telescopeId)).woocommerce_sync_error, /deleted/);
    assert.equal((await detailOf(telescopeId)).purchase_url, null);

    // 11. Hosts that strip the Authorization header: keys are retried as query parameters.
    fail.stripAuthHeader = true;
    calls.length = 0;
    const viaQuery = await request(app).post('/api/v1/admin/woocommerce/products/sync').set(auth(state.admin)).send({ course_ids: [astroId] });
    assert.equal(viaQuery.status, 200, viaQuery.body.message);
    assert.equal(calls[1].params.consumer_key, 'ck_test');
    assert.equal(calls[1].auth, undefined);
  } finally {
    axios.request = realRequest;
  }
});
