'use strict';

// Force a tiny cap so the limiter trips within the test. Set before requiring the
// middleware so the limiter picks it up (Jest isolates modules per test file).
process.env.AI_RATE_LIMIT_MAX = '2';

const express = require('express');
const request = require('supertest');
const { aiLimiter } = require('../middleware/rateLimit');

// Don't leak the tiny cap into other test files (process.env is process-global).
afterAll(() => {
  delete process.env.AI_RATE_LIMIT_MAX;
});

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'rate-user' };
    next();
  });
  app.get('/ai', aiLimiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('aiLimiter', () => {
  test('allows up to the max, then returns 429', async () => {
    const app = makeApp();
    expect((await request(app).get('/ai')).status).toBe(200);
    expect((await request(app).get('/ai')).status).toBe(200);
    const blocked = await request(app).get('/ai');
    expect(blocked.status).toBe(429);
  });
});
