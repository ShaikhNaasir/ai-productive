'use strict';

// Configure a tiny cap before the limiter module loads.
process.env.API_RATE_LIMIT_MAX = '2';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const express = require('express');
const request = require('supertest');
const { apiLimiter } = require('../middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);
app.use(apiLimiter);
app.get('/ping', (req, res) => res.json({ ok: true }));

describe('global API rate limiter', () => {
  test('allows requests up to the cap, then returns 429', async () => {
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);
    const third = await request(app).get('/ping');
    expect(third.status).toBe(429);
    expect(third.body.error.message).toMatch(/too many requests/i);
  });
});
