'use strict';

// Set the webhook secret before config loads so signature verification has a key.
// (Provider API keys stay unset, so checkout/cancel correctly report "not configured".)
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const crypto = require('crypto');
const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');
const { PLAN_LIMITS } = require('../config/plans');

const app = createApp();

const register = (email) =>
  request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'T' });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('billing status', () => {
  test('reports FREE plan, entitlements, usage, and that billing is unconfigured', async () => {
    const { body } = await register('bstatus@b.com');
    const res = await request(app).get('/api/billing/status').set(bearer(body.token));

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('FREE');
    expect(res.body.billingConfigured).toBe(false); // no API keys in test env
    expect(typeof res.body.limits.tasks).toBe('number');
    expect(res.body.usage).toHaveProperty('aiMonthlyCostUsd');
  });
});

describe('checkout when the provider is not configured', () => {
  test('degrades to 503 rather than crashing', async () => {
    const { body } = await register('bcheckout@b.com');
    const res = await request(app).post('/api/billing/checkout').set(bearer(body.token));
    expect(res.status).toBe(503);
  });
});

describe('resource quota gating', () => {
  const realNotes = PLAN_LIMITS.FREE.notes;
  beforeAll(() => {
    PLAN_LIMITS.FREE.notes = 1; // shrink so we don't have to create 50 rows
  });
  afterAll(() => {
    PLAN_LIMITS.FREE.notes = realNotes;
  });

  test('a FREE user is blocked with 402 once over the note cap', async () => {
    const { body } = await register('bquota@b.com');
    const h = bearer(body.token);

    const first = await request(app).post('/api/notes').set(h).send({ title: 'one' });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/notes').set(h).send({ title: 'two' });
    expect(second.status).toBe(402);
    expect(second.body.error.message).toMatch(/limit/i);
  });
});

describe('AI monthly budget gating', () => {
  test('a FREE user over their monthly AI spend is blocked with 402', async () => {
    const { body } = await register('bbudget@b.com');
    // Seed month-to-date spend at the FREE ceiling.
    await prisma.aiUsage.create({
      data: { userId: body.user.id, endpoint: 'chat', model: 'x', costUsd: PLAN_LIMITS.FREE.aiMonthlyCostUsd },
    });

    const res = await request(app)
      .post('/api/ai/parse-task')
      .set(bearer(body.token))
      .send({ text: 'buy milk' });

    expect(res.status).toBe(402);
    expect(res.body.error.message).toMatch(/allowance/i);
  });
});

describe('razorpay webhook', () => {
  const sign = (raw) => crypto.createHmac('sha256', 'whsec_test').update(raw).digest('hex');

  test('rejects a bad signature with 400', async () => {
    const raw = JSON.stringify({ event: 'subscription.charged' });
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'deadbeef')
      .set('x-razorpay-event-id', 'evt_bad')
      .send(raw);
    expect(res.status).toBe(400);
  });

  test('a signed subscription.charged upgrades the user and is idempotent', async () => {
    const { body } = await register('bhook@b.com');
    await prisma.user.update({
      where: { id: body.user.id },
      data: { razorpaySubscriptionId: 'sub_hook1' },
    });

    const currentEnd = Math.floor((Date.now() + 30 * 86400000) / 1000);
    const raw = JSON.stringify({
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_hook1', status: 'active', current_end: currentEnd } } },
    });
    const headers = {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sign(raw),
      'x-razorpay-event-id': 'evt_hook_1',
    };

    const first = await request(app).post('/api/billing/webhook').set(headers).send(raw);
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const upgraded = await prisma.user.findUnique({ where: { id: body.user.id } });
    expect(upgraded.plan).toBe('PAID');
    expect(new Date(upgraded.planRenewsAt).getTime()).toBeGreaterThan(Date.now());

    // Redelivery of the same event id is a no-op.
    const again = await request(app).post('/api/billing/webhook').set(headers).send(raw);
    expect(again.status).toBe(200);
    expect(again.body.deduped).toBe(true);
  });

  test('a signed subscription.cancelled with no remaining period downgrades to FREE', async () => {
    const { body } = await register('bcancel@b.com');
    await prisma.user.update({
      where: { id: body.user.id },
      data: { razorpaySubscriptionId: 'sub_cancel', plan: 'PAID' },
    });

    const pastEnd = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const raw = JSON.stringify({
      event: 'subscription.cancelled',
      payload: { subscription: { entity: { id: 'sub_cancel', status: 'cancelled', current_end: pastEnd } } },
    });
    const res = await request(app)
      .post('/api/billing/webhook')
      .set({ 'Content-Type': 'application/json', 'x-razorpay-signature': sign(raw), 'x-razorpay-event-id': 'evt_cancel_1' })
      .send(raw);
    expect(res.status).toBe(200);

    const downgraded = await prisma.user.findUnique({ where: { id: body.user.id } });
    expect(downgraded.plan).toBe('FREE');
  });
});
