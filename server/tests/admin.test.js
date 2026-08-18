'use strict';

// Set the allowlist before anything loads config. dotenv does not override an
// already-set env var, so this wins over whatever is in .env and keeps the
// bootstrap deterministic.
process.env.ADMIN_EMAILS = 'boot-admin@b.com,later-admin@b.com';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const bcrypt = require('bcryptjs');
const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');

const app = createApp();

const register = (email) =>
  request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'T' });
const login = (email) =>
  request(app).post('/api/auth/login').send({ email, password: 'password123' });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('admin bootstrap + guard (A1)', () => {
  test('an allowlisted email registers as ADMIN and reaches /api/admin/ping', async () => {
    const res = await register('boot-admin@b.com');
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('ADMIN');

    const ping = await request(app).get('/api/admin/ping').set(bearer(res.body.token));
    expect(ping.status).toBe(200);
    expect(ping.body).toMatchObject({ ok: true, admin: 'boot-admin@b.com' });
  });

  test('a non-allowlisted user is USER and is 403 from admin routes', async () => {
    const res = await register('plain@b.com');
    expect(res.body.user.role).toBe('USER');

    const ping = await request(app).get('/api/admin/ping').set(bearer(res.body.token));
    expect(ping.status).toBe(403);
  });

  test('login promotes an existing account once its email is allowlisted', async () => {
    // Pre-existing USER whose email was added to the allowlist later.
    await prisma.user.create({
      data: {
        email: 'later-admin@b.com',
        passwordHash: bcrypt.hashSync('password123', 10),
        name: 'L',
        role: 'USER',
      },
    });

    const res = await login('later-admin@b.com');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');

    const ping = await request(app).get('/api/admin/ping').set(bearer(res.body.token));
    expect(ping.status).toBe(200);
  });

  test('a disabled account is locked out of authed routes and cannot log in', async () => {
    const res = await register('victim@b.com');
    await prisma.user.update({ where: { id: res.body.user.id }, data: { status: 'DISABLED' } });

    // The still-valid token no longer works anywhere.
    const tasks = await request(app).get('/api/tasks').set(bearer(res.body.token));
    expect(tasks.status).toBe(403);

    // A fresh login is refused too.
    const relog = await login('victim@b.com');
    expect(relog.status).toBe(403);
  });

  test('admin routes require authentication', async () => {
    const ping = await request(app).get('/api/admin/ping');
    expect(ping.status).toBe(401);
  });
});

describe('admin read API — metrics + users (D2)', () => {
  let adminToken;
  let userToken;
  let userId;

  beforeAll(async () => {
    // boot-admin was registered in the suite above; log in for a fresh token.
    adminToken = (await login('boot-admin@b.com')).body.token;

    const u = await register('metrics-user@b.com');
    userToken = u.body.token;
    userId = u.body.user.id;

    await request(app).post('/api/tasks').set(bearer(userToken)).send({ title: 'first task' });
    await request(app).post('/api/tasks').set(bearer(userToken)).send({ title: 'second task' });
    await request(app)
      .post('/api/notes')
      .set(bearer(userToken))
      .send({ title: 'private note', content: 'SUPER SECRET BODY' });
  });

  test('metrics returns aggregates only, never content', async () => {
    const res = await request(app).get('/api/admin/metrics').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(2);
    expect(res.body.users.activeToday).toBeGreaterThanOrEqual(1);
    expect(res.body.content.tasks).toBeGreaterThanOrEqual(2);
    expect(res.body.content.notes).toBeGreaterThanOrEqual(1);
    expect(res.body.plans).toHaveProperty('free');
    expect(res.body.ai).toHaveProperty('costUsd');
    expect(JSON.stringify(res.body)).not.toContain('SUPER SECRET BODY');
  });

  test('users list is metadata-only and paginated', async () => {
    const res = await request(app).get('/api/admin/users?limit=100').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalPages');

    const row = res.body.users.find((x) => x.id === userId);
    expect(row).toMatchObject({ email: 'metrics-user@b.com', role: 'USER', status: 'ACTIVE', plan: 'FREE' });
    // Sensitive / content-bearing fields must not leak.
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('tasks');
    expect(row).not.toHaveProperty('notes');
  });

  test('users list filters by search', async () => {
    const res = await request(app).get('/api/admin/users?search=metrics-user').set(bearer(adminToken));
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.users.every((x) => /metrics-user/.test(x.email))).toBe(true);
  });

  test('user drill-down returns counts + ai aggregate, no content', async () => {
    const res = await request(app).get(`/api/admin/users/${userId}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.counts.tasks).toBe(2);
    expect(res.body.counts.notes).toBe(1);
    expect(res.body.user.email).toBe('metrics-user@b.com');
    expect(res.body.ai).toHaveProperty('costUsd');
    expect(JSON.stringify(res.body)).not.toContain('SUPER SECRET BODY');
  });

  test('metrics and users endpoints are admin-gated', async () => {
    expect((await request(app).get('/api/admin/metrics').set(bearer(userToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(bearer(userToken))).status).toBe(403);
    expect((await request(app).get(`/api/admin/users/${userId}`).set(bearer(userToken))).status).toBe(403);
  });
});

describe('admin moderation + audit (D3)', () => {
  let adminToken;
  let adminId;

  beforeAll(async () => {
    adminToken = (await login('boot-admin@b.com')).body.token;
    const list = await request(app).get('/api/admin/users?search=boot-admin').set(bearer(adminToken));
    adminId = list.body.users.find((x) => x.email === 'boot-admin@b.com').id;
  });

  const newUser = (email) => register(email).then((r) => r.body);
  const asAdmin = (m, path, body) => request(app)[m](path).set(bearer(adminToken)).send(body || {});

  test('disable locks the account out; enable restores it', async () => {
    const u = await newUser('mod1@b.com');
    const dis = await asAdmin('post', `/api/admin/users/${u.user.id}/disable`);
    expect(dis.status).toBe(200);
    expect(dis.body.user.status).toBe('DISABLED');
    // Existing token is revoked (tokenVersion bumped → 401), and a fresh login is
    // refused because the account is not ACTIVE (403).
    expect((await request(app).get('/api/tasks').set(bearer(u.token))).status).toBe(401);
    expect((await login('mod1@b.com')).status).toBe(403);

    const en = await asAdmin('post', `/api/admin/users/${u.user.id}/enable`);
    expect(en.body.user.status).toBe('ACTIVE');
    expect((await login('mod1@b.com')).status).toBe(200);
  });

  test('force-logout invalidates the current token', async () => {
    const u = await newUser('mod2@b.com');
    expect((await request(app).get('/api/tasks').set(bearer(u.token))).status).toBe(200);
    await asAdmin('post', `/api/admin/users/${u.user.id}/force-logout`);
    expect((await request(app).get('/api/tasks').set(bearer(u.token))).status).toBe(401);
  });

  test('grant then revoke admin role', async () => {
    const u = await newUser('mod3@b.com');
    const g = await asAdmin('post', `/api/admin/users/${u.user.id}/role`, { role: 'ADMIN' });
    expect(g.body.user.role).toBe('ADMIN');
    const r = await asAdmin('post', `/api/admin/users/${u.user.id}/role`, { role: 'USER' });
    expect(r.body.user.role).toBe('USER');
  });

  test('set plan to PAID', async () => {
    const u = await newUser('mod4@b.com');
    const res = await asAdmin('post', `/api/admin/users/${u.user.id}/plan`, { plan: 'PAID' });
    expect(res.body.user.plan).toBe('PAID');
  });

  test('soft delete locks out but keeps the record; hard delete removes it', async () => {
    const soft = await newUser('mod5@b.com');
    const s = await asAdmin('delete', `/api/admin/users/${soft.user.id}`, {});
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ deleted: true, hard: false });
    expect((await login('mod5@b.com')).status).toBe(403);
    // Record retained — drill-down still resolves.
    expect((await asAdmin('get', `/api/admin/users/${soft.user.id}`)).status).toBe(200);

    const hard = await newUser('mod6@b.com');
    const h = await asAdmin('delete', `/api/admin/users/${hard.user.id}`, { hard: true });
    expect(h.body).toMatchObject({ deleted: true, hard: true });
    expect((await asAdmin('get', `/api/admin/users/${hard.user.id}`)).status).toBe(404);
  });

  test('an admin cannot disable, delete, or self-revoke their own account', async () => {
    expect((await asAdmin('post', `/api/admin/users/${adminId}/disable`)).status).toBe(400);
    expect((await asAdmin('delete', `/api/admin/users/${adminId}`, {})).status).toBe(400);
    expect((await asAdmin('post', `/api/admin/users/${adminId}/role`, { role: 'USER' })).status).toBe(400);
  });

  test('audit log records actions and is admin-gated', async () => {
    const res = await asAdmin('get', '/api/admin/audit');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.logs.some((l) => l.action === 'user.disable')).toBe(true);

    const u = await newUser('mod7@b.com');
    expect((await request(app).get('/api/admin/audit').set(bearer(u.token))).status).toBe(403);
  });

  test('moderation routes are admin-gated', async () => {
    const u = await newUser('mod8@b.com');
    expect((await request(app).post(`/api/admin/users/${u.user.id}/disable`).set(bearer(u.token))).status).toBe(403);
  });
});
