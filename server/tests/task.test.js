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

  test('completing a recurring task spawns the next occurrence', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'weekly standup', recurrence: 'weekly', dueDate: '2026-08-12' });
    expect(created.body.task.recurrence).toBe('WEEKLY');
    const id = created.body.task.id;

    await request(app).post(`/api/tasks/${id}/complete`).set(auth());

    const list = await request(app).get('/api/tasks').set(auth());
    const sameTitle = list.body.tasks.filter((t) => t.title === 'weekly standup');
    expect(sameTitle.length).toBe(2);
    const spawned = sameTitle.find((t) => t.status === 'PENDING');
    expect(spawned).toBeTruthy();
    expect(spawned.recurrence).toBe('WEEKLY');
    expect(new Date(spawned.dueDate).toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  test('completing a non-recurring task does not spawn', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'one off', dueDate: '2026-08-12' });
    const id = created.body.task.id;
    await request(app).post(`/api/tasks/${id}/complete`).set(auth());
    const list = await request(app).get('/api/tasks').set(auth());
    expect(list.body.tasks.filter((t) => t.title === 'one off').length).toBe(1);
  });

  test('completing a recurring task twice does not double-spawn', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'daily dedupe', recurrence: 'daily', dueDate: '2026-08-12' });
    const id = created.body.task.id;
    await request(app).post(`/api/tasks/${id}/complete`).set(auth());
    await request(app).post(`/api/tasks/${id}/complete`).set(auth());
    const list = await request(app).get('/api/tasks').set(auth());
    expect(list.body.tasks.filter((t) => t.title === 'daily dedupe').length).toBe(2);
  });

  test('create a subtask under a parent; parent nests it, subtask hidden at top level', async () => {
    const parent = await request(app).post('/api/tasks').set(auth()).send({ title: 'ship feature' });
    const parentId = parent.body.task.id;

    const sub = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'write tests', parentId });
    expect(sub.status).toBe(201);
    expect(sub.body.task.parentId).toBe(parentId);

    const list = await request(app).get('/api/tasks').set(auth());
    const top = list.body.tasks.find((t) => t.id === parentId);
    expect(top.subtasks.map((s) => s.title)).toContain('write tests');
    // The subtask itself does not appear as a top-level row.
    expect(list.body.tasks.some((t) => t.id === sub.body.task.id)).toBe(false);
  });

  test('reject a subtask under a non-existent / other-user parent', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'orphan', parentId: '11111111-1111-1111-1111-111111111111' });
    expect(res.status).toBe(404);
  });

  test('deleting a parent cascades to its subtasks', async () => {
    const parent = await request(app).post('/api/tasks').set(auth()).send({ title: 'cascade parent' });
    const parentId = parent.body.task.id;
    const sub = await request(app).post('/api/tasks').set(auth()).send({ title: 'child', parentId });
    const subId = sub.body.task.id;

    await request(app).delete(`/api/tasks/${parentId}`).set(auth());

    const gone = await request(app).get(`/api/tasks/${subId}`).set(auth());
    expect(gone.status).toBe(404);
  });

  test('recurring task spawned via PATCH status=COMPLETED', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'patch recur', recurrence: 'daily', dueDate: '2026-08-12' });
    const id = created.body.task.id;
    await request(app).patch(`/api/tasks/${id}`).set(auth()).send({ status: 'COMPLETED' });
    const list = await request(app).get('/api/tasks').set(auth());
    const sameTitle = list.body.tasks.filter((t) => t.title === 'patch recur');
    expect(sameTitle.length).toBe(2);
    const spawned = sameTitle.find((t) => t.status === 'PENDING');
    expect(new Date(spawned.dueDate).toISOString()).toBe('2026-08-13T00:00:00.000Z');
  });
});
