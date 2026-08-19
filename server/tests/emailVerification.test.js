'use strict';

// Admin allowlist so we can assert admins are auto-verified.
process.env.ADMIN_EMAILS = 'ev-admin@b.com';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');

const app = createApp();

const register = (email) =>
  request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'T' });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const tokenFromUrl = (url) => new URL(url).searchParams.get('token');

describe('email verification (E1)', () => {
  test('a new account starts unverified and gets a dev-mode link (email not configured)', async () => {
    const res = await register('newbie@b.com');
    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.verification.delivery).toBe('devmode');
    expect(res.body.verification.devVerifyUrl).toContain('/verify-email?token=');
  });

  test('the emailed token verifies the account', async () => {
    const reg = await register('verifyme@b.com');
    const token = tokenFromUrl(reg.body.verification.devVerifyUrl);

    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);

    // /me now reports verified.
    const me = await request(app).get('/api/auth/me').set(bearer(reg.body.token));
    expect(me.body.user.emailVerified).toBe(true);
  });

  test('an invalid token is rejected', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });

  test('resend is throttled right after registration (cooldown)', async () => {
    const reg = await register('resend@b.com');
    const res = await request(app).post('/api/auth/resend-verification').set(bearer(reg.body.token));
    expect(res.status).toBe(429);
  });

  test('resend succeeds once the cooldown has passed', async () => {
    const reg = await register('resend2@b.com');
    // Clear the last-send marker to simulate the cooldown having elapsed.
    await prisma.user.update({ where: { id: reg.body.user.id }, data: { emailVerifyExpires: null } });
    const res = await request(app).post('/api/auth/resend-verification').set(bearer(reg.body.token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('changing email marks the account unverified again and re-sends', async () => {
    const reg = await register('changer@b.com');
    const token = tokenFromUrl(reg.body.verification.devVerifyUrl);
    await request(app).post('/api/auth/verify-email').send({ token }); // now verified

    const res = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(reg.body.token))
      .send({ email: 'changed@b.com' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('changed@b.com');
    expect(res.body.user.emailVerified).toBe(false);
  });

  test('an allowlisted admin registers already verified (no email sent)', async () => {
    const res = await register('ev-admin@b.com');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.emailVerified).toBe(true);
    expect(res.body.verification.delivery).toBe('skipped');
  });

  test('with email unconfigured, gated routes are NOT blocked', async () => {
    const reg = await register('unblocked@b.com');
    // documents/upload with no file → 400 from the controller means requireVerified
    // let it through (it would be 403 if the block were engaged).
    const res = await request(app).post('/api/documents/upload').set(bearer(reg.body.token));
    expect(res.status).toBe(400);
  });
});
