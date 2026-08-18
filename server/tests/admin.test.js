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
