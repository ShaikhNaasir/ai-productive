'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');

const app = createApp();
let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'habits@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('habits', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/habits');
    expect(res.status).toBe(401);
  });

  test('create a habit with zeroed streaks', async () => {
    const res = await request(app).post('/api/habits').set(auth()).send({ name: 'Read 20 minutes' });
    expect(res.status).toBe(201);
    expect(res.body.habit.name).toBe('Read 20 minutes');
    expect(res.body.habit.currentStreak).toBe(0);
    expect(res.body.habit.checkedInToday).toBe(false);
  });

  test('reject an empty name', async () => {
    const res = await request(app).post('/api/habits').set(auth()).send({ name: '' });
    expect(res.status).toBe(400);
  });

  test('check-in today advances the streak and is idempotent', async () => {
    const created = await request(app).post('/api/habits').set(auth()).send({ name: 'Meditate' });
    const id = created.body.habit.id;

    const first = await request(app).post(`/api/habits/${id}/check-in`).set(auth());
    expect(first.status).toBe(200);
    expect(first.body.habit.currentStreak).toBe(1);
    expect(first.body.habit.checkedInToday).toBe(true);
    expect(first.body.habit.totalCheckIns).toBe(1);

    // Checking in again the same day does not create a second log.
    const second = await request(app).post(`/api/habits/${id}/check-in`).set(auth());
    expect(second.body.habit.totalCheckIns).toBe(1);
    expect(second.body.habit.currentStreak).toBe(1);
  });

  test('uncheck removes today\'s check-in', async () => {
    const created = await request(app).post('/api/habits').set(auth()).send({ name: 'Stretch' });
    const id = created.body.habit.id;
    await request(app).post(`/api/habits/${id}/check-in`).set(auth());

    const res = await request(app).delete(`/api/habits/${id}/check-in`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.habit.checkedInToday).toBe(false);
    expect(res.body.habit.currentStreak).toBe(0);
    expect(res.body.habit.totalCheckIns).toBe(0);
  });

  test('list returns habits with computed streak fields', async () => {
    const res = await request(app).get('/api/habits').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.habits)).toBe(true);
    expect(res.body.habits[0]).toHaveProperty('currentStreak');
    expect(res.body.habits[0]).toHaveProperty('longestStreak');
  });

  test('cannot check in another user\'s habit', async () => {
    const created = await request(app).post('/api/habits').set(auth()).send({ name: 'Mine' });
    const id = created.body.habit.id;

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: 'habits-other@b.com', password: 'password123' });
    const res = await request(app)
      .post(`/api/habits/${id}/check-in`)
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(res.status).toBe(404);
  });

  test('deleting a habit removes it and its logs', async () => {
    const created = await request(app).post('/api/habits').set(auth()).send({ name: 'Temp habit' });
    const id = created.body.habit.id;
    await request(app).post(`/api/habits/${id}/check-in`).set(auth());

    const del = await request(app).delete(`/api/habits/${id}`).set(auth());
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/habits').set(auth());
    expect(list.body.habits.some((h) => h.id === id)).toBe(false);
  });

  test('analytics summary reports habit completion for today', async () => {
    const created = await request(app).post('/api/habits').set(auth()).send({ name: 'Analytics habit' });
    await request(app).post(`/api/habits/${created.body.habit.id}/check-in`).set(auth());

    const res = await request(app).get('/api/analytics/summary').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.habitsTotal).toBeGreaterThanOrEqual(1);
    expect(res.body.habitsCheckedToday).toBeGreaterThanOrEqual(1);
  });
});
