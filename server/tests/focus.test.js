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
    .send({ email: 'focus@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('focus sessions', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/api/focus/start');
    expect(res.status).toBe(401);
  });

  test('start opens a session', async () => {
    const res = await request(app).post('/api/focus/start').set(auth()).send({});
    expect(res.status).toBe(201);
    expect(res.body.session.id).toBeTruthy();
    expect(res.body.session.endedAt).toBeNull();
    expect(res.body.session.seconds).toBe(0);
  });

  test('stop computes elapsed seconds from startedAt', async () => {
    const startedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const started = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    const id = started.body.session.id;

    const res = await request(app).post(`/api/focus/${id}/stop`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.session.endedAt).toBeTruthy();
    expect(res.body.session.seconds).toBeGreaterThanOrEqual(59);
    expect(res.body.session.seconds).toBeLessThanOrEqual(62);
  });

  test('rejects a future startedAt', async () => {
    const startedAt = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    expect(res.status).toBe(400);
  });

  test('rejects a session bound to a task the user does not own', async () => {
    const res = await request(app)
      .post('/api/focus/start')
      .set(auth())
      .send({ taskId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  test('cannot stop another user\'s session', async () => {
    const started = await request(app).post('/api/focus/start').set(auth()).send({});
    const id = started.body.session.id;

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: 'focus-other@b.com', password: 'password123' });
    const res = await request(app)
      .post(`/api/focus/${id}/stop`)
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(res.status).toBe(404);
  });

  test('stats aggregate per task and per day', async () => {
    const task = await request(app).post('/api/tasks').set(auth()).send({ title: 'deep work' });
    const taskId = task.body.task.id;
    const startedAt = new Date(Date.now() - 120 * 1000).toISOString();
    const started = await request(app).post('/api/focus/start').set(auth()).send({ taskId, startedAt });
    await request(app).post(`/api/focus/${started.body.session.id}/stop`).set(auth());

    const res = await request(app).get('/api/focus/stats').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.perDay).toHaveLength(7);
    expect(res.body.total).toBeGreaterThanOrEqual(120);
    const forTask = res.body.perTask.find((p) => p.taskId === taskId);
    expect(forTask.seconds).toBeGreaterThanOrEqual(119);
  });
});
