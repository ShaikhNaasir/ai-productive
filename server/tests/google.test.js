'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

// Mock the Google service so no real OAuth/network happens; controllers only depend
// on isConfigured / getAuthUrl / exchangeCode.
jest.mock('../services/googleCalendar', () => ({
  isConfigured: jest.fn(() => true),
  getAuthUrl: jest.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?state=x'),
  exchangeCode: jest.fn(async () => ({
    refresh_token: 'refresh-abc',
    access_token: 'access-abc',
    expiry_date: Date.now() + 3600000,
  })),
  // Used by googleSync via the /sync endpoint.
  listEvents: jest.fn(async () => ({ events: [], nextSyncToken: 'tok' })),
  insertEvent: jest.fn(async () => ({ id: 'gev-new' })),
  updateEvent: jest.fn(async () => ({})),
  deleteEvent: jest.fn(async () => ({})),
}));

const request = require('supertest');
const createApp = require('../app');
const googleCalendar = require('../services/googleCalendar');
const { signToken } = require('../utils/jwt');

const app = createApp();
let token;
let userId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'gcal@b.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

afterEach(() => {
  googleCalendar.isConfigured.mockReturnValue(true);
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const validState = () => signToken({ sub: userId, purpose: 'google-oauth' });

describe('google calendar oauth (C1.1)', () => {
  test('auth-url requires authentication', async () => {
    const res = await request(app).get('/api/google/auth-url');
    expect(res.status).toBe(401);
  });

  test('auth-url returns a consent URL', async () => {
    const res = await request(app).get('/api/google/auth-url').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('accounts.google.com');
  });

  test('auth-url returns 503 when integration is not configured', async () => {
    googleCalendar.isConfigured.mockReturnValue(false);
    const res = await request(app).get('/api/google/auth-url').set(auth());
    expect(res.status).toBe(503);
  });

  test('status reports disconnected before linking', async () => {
    const res = await request(app).get('/api/google/status').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  test('callback rejects a missing code or state', async () => {
    const res = await request(app).get('/api/google/callback').query({ state: validState() });
    expect(res.status).toBe(400);
  });

  test('callback rejects an invalid state token', async () => {
    const res = await request(app)
      .get('/api/google/callback')
      .query({ code: 'authcode', state: 'not-a-jwt' });
    expect(res.status).toBe(400);
  });

  test('callback rejects when Google returns no refresh token', async () => {
    googleCalendar.exchangeCode.mockResolvedValueOnce({ access_token: 'access-only' });
    const res = await request(app)
      .get('/api/google/callback')
      .query({ code: 'authcode', state: validState() });
    expect(res.status).toBe(400);
  });

  test('callback stores the refresh token and redirects to the client', async () => {
    const res = await request(app)
      .get('/api/google/callback')
      .query({ code: 'authcode', state: validState() });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/settings?google=connected');

    const status = await request(app).get('/api/google/status').set(auth());
    expect(status.body.connected).toBe(true);
    expect(status.body.calendarId).toBe('primary');
  });

  test('callback re-linking updates the existing account (no duplicate)', async () => {
    const res = await request(app)
      .get('/api/google/callback')
      .query({ code: 'authcode2', state: validState() });
    expect(res.status).toBe(302);
    const status = await request(app).get('/api/google/status').set(auth());
    expect(status.body.connected).toBe(true);
  });

  test('sync-now succeeds for a connected user', async () => {
    const res = await request(app).post('/api/google/sync').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('sync-now rejects a user who has not connected', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nogcal@b.com', password: 'password123' });
    const res = await request(app)
      .post('/api/google/sync')
      .set({ Authorization: `Bearer ${reg.body.token}` });
    expect(res.status).toBe(400);
  });

  test('disconnect removes the link', async () => {
    const res = await request(app).delete('/api/google/disconnect').set(auth());
    expect(res.status).toBe(204);
    const status = await request(app).get('/api/google/status').set(auth());
    expect(status.body.connected).toBe(false);
  });
});
