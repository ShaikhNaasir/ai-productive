'use strict';

// In-memory fake of the Prisma user model so auth logic is tested without a database.
jest.mock('../models/prisma', () => {
  const users = [];
  let seq = 1;
  return {
    __users: users,
    user: {
      findUnique: jest.fn(async ({ where }) => {
        return (
          users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email)) ||
          null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const user = { id: String(seq++), createdAt: new Date(), name: null, ...data };
        users.push(user);
        return user;
      }),
      update: jest.fn(async ({ where, data }) => {
        const user = users.find((u) => u.id === where.id);
        Object.assign(user, data);
        return user;
      }),
    },
  };
});

const request = require('supertest');
const createApp = require('../app');

const app = createApp();

async function registerUser(overrides = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ email: 'a@b.com', password: 'password123', name: 'Alice', ...overrides });
}

describe('auth', () => {
  test('register creates user and returns token', async () => {
    const res = await registerUser({ email: 'reg@b.com' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('reg@b.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('register rejects short password', async () => {
    const res = await registerUser({ email: 'short@b.com', password: '123' });
    expect(res.status).toBe(400);
  });

  test('register rejects a password under 10 characters', async () => {
    const res = await registerUser({ email: 'nine@b.com', password: 'nineChars' }); // 9 chars
    expect(res.status).toBe(400);
  });

  test('register rejects duplicate email', async () => {
    await registerUser({ email: 'dup@b.com' });
    const res = await registerUser({ email: 'dup@b.com' });
    expect(res.status).toBe(409);
  });

  test('login succeeds with correct password', async () => {
    await registerUser({ email: 'login@b.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@b.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('login fails with wrong password', async () => {
    await registerUser({ email: 'wrong@b.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@b.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('me requires auth', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('logout invalidates the existing token (server-side revocation)', async () => {
    const reg = await registerUser({ email: 'lo@b.com' });
    const token = reg.body.token;

    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  test('change password rotates the token: old one dies, new one works', async () => {
    const reg = await registerUser({ email: 'rotate@b.com', password: 'password123' });
    const oldToken = reg.body.token;

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });
    expect(changed.status).toBe(200);
    const newToken = changed.body.token;
    expect(newToken).toBeTruthy();

    // Old token is now invalid, new token works.
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${newToken}`)).status).toBe(200);
  });

  test('me returns current user with valid token', async () => {
    const reg = await registerUser({ email: 'me@b.com' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@b.com');
  });

  test('change password requires correct current password', async () => {
    const reg = await registerUser({ email: 'cp@b.com', password: 'password123' });
    const token = reg.body.token;

    const bad = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'newpassword123' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });
    expect(ok.status).toBe(200);
  });
});
