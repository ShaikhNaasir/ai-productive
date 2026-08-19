'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');
const totp = require('../services/totp');
const prisma = require('../models/prisma');

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
  let userId;
  let secret;
  let backupCodes;

  beforeAll(async () => {
    const reg = await register('tfa@b.com');
    token = reg.body.token;
    userId = reg.body.user.id;
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

    // The secret is stored encrypted at rest, not as the raw base32 value.
    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row.twoFactorSecret).not.toBe(secret);
    expect(row.twoFactorSecret.startsWith('v1:')).toBe(true);
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

describe('two-factor login throttle (F2)', () => {
  test('too many wrong codes lock the 2FA step with 429', async () => {
    const reg = await register('tfa-throttle@b.com');
    const setup = (await request(app).post('/api/auth/2fa/setup').set(bearer(reg.body.token))).body;
    await request(app).post('/api/auth/2fa/enable').set(bearer(reg.body.token)).send({ code: codeFor(setup.secret) });

    // Five wrong attempts are rejected as 401 …
    for (let i = 0; i < 5; i += 1) {
      const challenge = (await login('tfa-throttle@b.com')).body.challengeToken;
      const res = await request(app).post('/api/auth/2fa/login').send({ challengeToken: challenge, code: '000000' });
      expect(res.status).toBe(401);
    }
    // … the sixth is locked out with 429.
    const challenge = (await login('tfa-throttle@b.com')).body.challengeToken;
    const locked = await request(app).post('/api/auth/2fa/login').send({ challengeToken: challenge, code: '000000' });
    expect(locked.status).toBe(429);
  });
});

describe('two-factor edge cases (F3)', () => {
  test('disable also accepts a backup code', async () => {
    const reg = await register('tfa-backup@b.com');
    const setup = (await request(app).post('/api/auth/2fa/setup').set(bearer(reg.body.token))).body;
    const enable = await request(app).post('/api/auth/2fa/enable').set(bearer(reg.body.token)).send({ code: codeFor(setup.secret) });

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set(bearer(reg.body.token))
      .send({ code: enable.body.backupCodes[0] });
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set(bearer(reg.body.token));
    expect(me.body.user.twoFactorEnabled).toBe(false);
  });

  test('a normal session token cannot be used as a 2FA challenge', async () => {
    const reg = await register('tfa-nochallenge@b.com');
    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challengeToken: reg.body.token, code: '123456' });
    expect(res.status).toBe(401);
  });
});
