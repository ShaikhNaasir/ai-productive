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
    .send({ email: 'analytics@b.com', password: 'password123' });
  token = res.body.token;
  const h = { Authorization: `Bearer ${token}` };
  // 2 tasks, complete one, one overdue
  await request(app).post('/api/tasks').set(h).send({ title: 't1', tags: ['work'] });
  const t2 = await request(app).post('/api/tasks').set(h).send({ title: 't2', dueDate: '2020-01-01', tags: ['work', 'urgent'] });
  const c = await request(app).post('/api/tasks').set(h).send({ title: 't3' });
  await request(app).post(`/api/tasks/${c.body.task.id}/complete`).set(h);
  // keep t2 pending + overdue
  void t2;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('analytics', () => {
  test('summary computes counts and completion rate', async () => {
    const res = await request(app).get('/api/analytics/summary').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.completed).toBe(1);
    expect(res.body.pending).toBe(2);
    expect(res.body.overdue).toBe(1);
    expect(res.body.completionRate).toBe(33);
  });

  test('trends returns 7-day series, category workload, status breakdown', async () => {
    const res = await request(app).get('/api/analytics/trends').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.perDay).toHaveLength(7);
    expect(res.body.perDay.at(-1).completed).toBe(1); // completed today
    const work = res.body.categoryWorkload.find((c) => c.tag === 'work');
    expect(work.count).toBe(2);
    expect(res.body.byStatus.COMPLETED).toBe(1);
  });

  test('summary surfaces focus time tracked today', async () => {
    const startedAt = new Date(Date.now() - 90 * 1000).toISOString();
    const started = await request(app).post('/api/focus/start').set(auth()).send({ startedAt });
    await request(app).post(`/api/focus/${started.body.session.id}/stop`).set(auth());

    const res = await request(app).get('/api/analytics/summary').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.focusSecondsToday).toBeGreaterThanOrEqual(89);
  });
});
