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

  test('clamps a future startedAt to now (tolerates client clock skew)', async () => {
    const startedAt = new Date(Date.now() + 60 * 1000).toISOString();
    const started = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    expect(started.status).toBe(201);

    const res = await request(app).post(`/api/focus/${started.body.session.id}/stop`).set(auth());
    expect(res.status).toBe(200);
    // Clamped to ~now, so elapsed is ~0 — never negative, never the +60s.
    expect(res.body.session.seconds).toBeGreaterThanOrEqual(0);
    expect(res.body.session.seconds).toBeLessThanOrEqual(3);
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

  test('start stores the planned duration', async () => {
    const res = await request(app).post('/api/focus/start').set(auth()).send({ plannedSeconds: 1500 });
    expect(res.status).toBe(201);
    expect(res.body.session.plannedSeconds).toBe(1500);
  });

  test('active returns the open session, then null after it is stopped', async () => {
    // Fresh user so no open session from earlier tests interferes.
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'focus-active@b.com', password: 'password123' });
    const h = { Authorization: `Bearer ${reg.body.token}` };

    const before = await request(app).get('/api/focus/active').set(h);
    expect(before.body.session).toBeNull();

    const started = await request(app).post('/api/focus/start').set(h).send({ plannedSeconds: 900 });
    const id = started.body.session.id;

    const open = await request(app).get('/api/focus/active').set(h);
    expect(open.status).toBe(200);
    expect(open.body.session.id).toBe(id);
    expect(open.body.session.endedAt).toBeNull();

    await request(app).post(`/api/focus/${id}/stop`).set(h);
    const none = await request(app).get('/api/focus/active').set(h);
    expect(none.body.session).toBeNull();
  });

  test('stop caps recorded seconds at the planned duration', async () => {
    // Started 1000s ago but planned only 60s — an orphaned session must not inflate.
    const startedAt = new Date(Date.now() - 1000 * 1000).toISOString();
    const started = await request(app)
      .post('/api/focus/start')
      .set(auth())
      .send({ startedAt, plannedSeconds: 60 });
    const res = await request(app).post(`/api/focus/${started.body.session.id}/stop`).set(auth());
    expect(res.body.session.seconds).toBe(60);
  });

  test('stop clamps client-reported seconds to the wall-clock elapsed', async () => {
    const startedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const started = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    const res = await request(app)
      .post(`/api/focus/${started.body.session.id}/stop`)
      .set(auth())
      .send({ seconds: 5000 });
    expect(res.body.session.seconds).toBeLessThanOrEqual(62);
    expect(res.body.session.seconds).toBeGreaterThanOrEqual(59);
  });

  test('starting a session closes one left open by another tab', async () => {
    const startedAt = new Date(Date.now() - 90 * 1000).toISOString();
    const orphan = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    const orphanId = orphan.body.session.id;

    // A second tab starts its own session without stopping the first.
    await request(app).post('/api/focus/start').set(auth()).send({});

    // The abandoned session is closed with its wall-clock time, not stranded at 0.
    const active = await request(app).get('/api/focus/active').set(auth());
    expect(active.body.session.id).not.toBe(orphanId);

    const stats = await request(app).get('/api/focus/stats').set(auth());
    expect(stats.status).toBe(200);

    const stopped = await request(app)
      .post(`/api/focus/${orphanId}/stop`)
      .set(auth())
      .send({});
    // Already closed; stopping again must not resurrect or double-count it.
    expect(stopped.status).toBe(200);
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
