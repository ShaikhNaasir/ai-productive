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
    .send({ email: 'tasks@b.com', password: 'password123', name: 'T' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('tasks', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  test('create task with normalized priority/status', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'Complete JavaScript project', priority: 'High', status: 'Pending', dueDate: '2026-08-15', tags: ['work'] });
    expect(res.status).toBe(201);
    expect(res.body.task.priority).toBe('HIGH');
    expect(res.body.task.status).toBe('PENDING');
    expect(res.body.task.tags).toEqual(['work']);
  });

  test('list returns only the user\'s tasks', async () => {
    const res = await request(app).get('/api/tasks').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks.length).toBeGreaterThan(0);
  });

  test('filter by status', async () => {
    const res = await request(app).get('/api/tasks?status=completed').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.tasks.every((t) => t.status === 'COMPLETED')).toBe(true);
  });

  test('complete sets status + completedAt', async () => {
    const created = await request(app).post('/api/tasks').set(auth()).send({ title: 'finish me' });
    const id = created.body.task.id;
    const res = await request(app).post(`/api/tasks/${id}/complete`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('COMPLETED');
    expect(res.body.task.completedAt).toBeTruthy();
  });

  test('update task', async () => {
    const created = await request(app).post('/api/tasks').set(auth()).send({ title: 'orig' });
    const id = created.body.task.id;
    const res = await request(app).patch(`/api/tasks/${id}`).set(auth()).send({ title: 'updated' });
    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('updated');
  });

  test('set task status to IN_PROGRESS', async () => {
    const created = await request(app).post('/api/tasks').set(auth()).send({ title: 'wip' });
    const id = created.body.task.id;
    const res = await request(app).patch(`/api/tasks/${id}`).set(auth()).send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('IN_PROGRESS');
    expect(res.body.task.completedAt).toBeNull();
  });

  test('delete task', async () => {
    const created = await request(app).post('/api/tasks').set(auth()).send({ title: 'temp' });
    const id = created.body.task.id;
    const res = await request(app).delete(`/api/tasks/${id}`).set(auth());
    expect(res.status).toBe(204);
    const after = await request(app).get(`/api/tasks/${id}`).set(auth());
    expect(after.status).toBe(404);
  });

  test('reject invalid create', async () => {
    const res = await request(app).post('/api/tasks').set(auth()).send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('cannot access another user\'s task', async () => {
    const created = await request(app).post('/api/tasks').set(auth()).send({ title: 'mine' });
    const id = created.body.task.id;

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: 'other@b.com', password: 'password123' });
    const otherToken = other.body.token;

    const res = await request(app)
      .get(`/api/tasks/${id}`)
      .set({ Authorization: `Bearer ${otherToken}` });
    expect(res.status).toBe(404);
  });
});
