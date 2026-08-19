'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');
const totp = require('../services/totp');

const app = createApp();

const register = (email) =>
  request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'T' });
const login = (email) =>
  request(app).post('/api/auth/login').send({ email, password: 'password123' });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const codeFor = (secret) => totp.hotp(secret, Math.floor(Date.now() / 1000 / 30));

describe('totp algorithm', () => {
  test('a freshly generated code verifies; a wrong one does not', () => {
    const secret = totp.generateSecret();
    expect(totp.verify(secret, codeFor(secret))).toBe(true);
    expect(totp.verify(secret, '000000')).toBe(false);
    expect(totp.verify(secret, 'nope')).toBe(false);
  });
});

describe('two-factor enrollment + login (E2)', () => {
  let token;
  let secret;
  let backupCodes;

  beforeAll(async () => {
    token = (await register('tfa@b.com')).body.token;
  });

  test('setup returns a secret and a scannable QR', async () => {
    const res = await request(app).post('/api/auth/2fa/setup').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.otpauthUrl).toContain('otpauth://totp/');
    secret = res.body.secret;
  });

  test('a wrong code does not enable 2FA', async () => {
    const res = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: '000000' });
    expect(res.status).toBe(400);
  });

  test('the right code enables 2FA and returns backup codes', async () => {
    const res = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: codeFor(secret) });
    expect(res.status).toBe(200);
    expect(res.body.backupCodes).toHaveLength(10);
    backupCodes = res.body.backupCodes;

    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.body.user.twoFactorEnabled).toBe(true);
  });

  test('login now demands a second factor instead of a token', async () => {
    const res = await login('tfa@b.com');
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.token).toBeUndefined();
  });

  test('a valid TOTP completes login', async () => {
    const challenge = (await login('tfa@b.com')).body.challengeToken;
    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challengeToken: challenge, code: codeFor(secret) });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.twoFactorEnabled).toBe(true);
  });

  test('a backup code completes login and is single-use', async () => {
    const challenge = (await login('tfa@b.com')).body.challengeToken;
    const first = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challengeToken: challenge, code: backupCodes[0] });
    expect(first.status).toBe(200);
    expect(first.body.token).toBeTruthy();

    // The same backup code cannot be reused.
    const challenge2 = (await login('tfa@b.com')).body.challengeToken;
    const reuse = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challengeToken: challenge2, code: backupCodes[0] });
    expect(reuse.status).toBe(401);
  });

  test('a bad challenge token is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challengeToken: 'garbage', code: codeFor(secret) });
    expect(res.status).toBe(401);
  });

  test('disable with a valid code turns 2FA off', async () => {
    const res = await request(app).post('/api/auth/2fa/disable').set(bearer(token)).send({ code: codeFor(secret) });
    expect(res.status).toBe(200);

    // Login no longer requires a second factor.
    const relog = await login('tfa@b.com');
    expect(relog.body.token).toBeTruthy();
    expect(relog.body.twoFactorRequired).toBeUndefined();
  });
});
