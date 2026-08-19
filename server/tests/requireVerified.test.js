'use strict';

process.env.ADMIN_EMAILS = 'rv-admin@b.com';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

// Force email delivery to look configured so the verification hard-block engages.
jest.mock('../services/mailer', () => ({
  isConfigured: () => true,
  send: async () => {},
  sendVerificationEmail: async () => {},
}));

const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');

const app = createApp();

const register = (email) =>
  request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'T' });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('email verification hard-block (E1)', () => {
  test('an unverified user is blocked from AI with 403 EMAIL_UNVERIFIED', async () => {
    const reg = await register('blocked@b.com');
    expect(reg.body.user.emailVerified).toBe(false);

    const res = await request(app)
      .post('/api/ai/parse-task')
      .set(bearer(reg.body.token))
      .send({ text: 'buy milk' });

    expect(res.status).toBe(403);
    expect(res.body.error.details.code).toBe('EMAIL_UNVERIFIED');
  });

  test('a verified user passes the gate', async () => {
    const reg = await register('okay@b.com');
    await prisma.user.update({ where: { id: reg.body.user.id }, data: { emailVerified: true } });

    // documents/upload with no file → 400 (from controller) proves the gate passed.
    const res = await request(app).post('/api/documents/upload').set(bearer(reg.body.token));
    expect(res.status).toBe(400);
  });

  test('an admin is exempt even when unverified', async () => {
    const reg = await register('rv-admin@b.com');
    expect(reg.body.user.role).toBe('ADMIN');
    const res = await request(app).post('/api/documents/upload').set(bearer(reg.body.token));
    expect(res.status).toBe(400); // passed the gate → controller "no file"
  });
});
