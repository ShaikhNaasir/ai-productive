'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');

const app = createApp();

// Owner shares tasks; sharee receives access. A third user stays locked out.
let ownerToken;
let shareeToken;
let outsiderToken;
const shareeEmail = 'sharee@b.com';

beforeAll(async () => {
  const owner = await request(app).post('/api/auth/register').send({ email: 'owner@b.com', password: 'password123' });
  ownerToken = owner.body.token;
  const sharee = await request(app).post('/api/auth/register').send({ email: shareeEmail, password: 'password123' });
  shareeToken = sharee.body.token;
  const outsider = await request(app).post('/api/auth/register').send({ email: 'outsider@b.com', password: 'password123' });
  outsiderToken = outsider.body.token;
});

const as = (token) => ({ Authorization: `Bearer ${token}` });

async function makeTask(title = 'Shared task') {
  const res = await request(app).post('/api/tasks').set(as(ownerToken)).send({ title });
  return res.body.task.id;
}

describe('task sharing', () => {
  test('owner shares a task by email', async () => {
    const id = await makeTask();
    const res = await request(app)
      .post(`/api/tasks/${id}/share`)
      .set(as(ownerToken))
      .send({ email: shareeEmail, role: 'VIEW' });
    expect(res.status).toBe(201);
    expect(res.body.share.email).toBe(shareeEmail);
    expect(res.body.share.role).toBe('VIEW');
  });

  test('sharing with an unknown email returns 404', async () => {
    const id = await makeTask();
    const res = await request(app)
      .post(`/api/tasks/${id}/share`)
      .set(as(ownerToken))
      .send({ email: 'nobody@b.com' });
    expect(res.status).toBe(404);
  });

  test('a non-owner cannot share', async () => {
    const id = await makeTask();
    const res = await request(app)
      .post(`/api/tasks/${id}/share`)
      .set(as(shareeToken))
      .send({ email: 'outsider@b.com' });
    expect(res.status).toBe(404);
  });

  test('a VIEW sharee can read but not edit', async () => {
    const id = await makeTask('View only');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'VIEW' });

    const get = await request(app).get(`/api/tasks/${id}`).set(as(shareeToken));
    expect(get.status).toBe(200);
    expect(get.body.task.title).toBe('View only');

    const patch = await request(app).patch(`/api/tasks/${id}`).set(as(shareeToken)).send({ title: 'Hijacked' });
    expect(patch.status).toBe(403);
  });

  test('an EDIT sharee can update and complete', async () => {
    const id = await makeTask('Editable');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'EDIT' });

    const patch = await request(app).patch(`/api/tasks/${id}`).set(as(shareeToken)).send({ title: 'Edited by sharee' });
    expect(patch.status).toBe(200);
    expect(patch.body.task.title).toBe('Edited by sharee');

    const done = await request(app).post(`/api/tasks/${id}/complete`).set(as(shareeToken));
    expect(done.status).toBe(200);
    expect(done.body.task.status).toBe('COMPLETED');
  });

  test('GET /tasks/shared lists shared tasks with owner and role', async () => {
    const id = await makeTask('In shared view');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'EDIT' });

    const res = await request(app).get('/api/tasks/shared').set(as(shareeToken));
    expect(res.status).toBe(200);
    const entry = res.body.tasks.find((t) => t.id === id);
    expect(entry).toBeTruthy();
    expect(entry.myRole).toBe('EDIT');
    expect(entry.owner.email).toBe('owner@b.com');
  });

  test('an outsider cannot access a shared task', async () => {
    const id = await makeTask('Private');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail });

    const get = await request(app).get(`/api/tasks/${id}`).set(as(outsiderToken));
    expect(get.status).toBe(404);
  });

  test('unshare revokes access', async () => {
    const id = await makeTask('Revoke me');
    const shared = await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail });
    const shareeId = shared.body.share.userId;

    const del = await request(app).delete(`/api/tasks/${id}/share/${shareeId}`).set(as(ownerToken));
    expect(del.status).toBe(204);

    const get = await request(app).get(`/api/tasks/${id}`).set(as(shareeToken));
    expect(get.status).toBe(404);
  });

  test('a sharee cannot delete the task (owner only)', async () => {
    const id = await makeTask('No delete for you');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'EDIT' });

    const del = await request(app).delete(`/api/tasks/${id}`).set(as(shareeToken));
    expect(del.status).toBe(404);
  });

  test('an EDIT sharee cannot re-parent the task (no cascade-delete escalation)', async () => {
    const id = await makeTask('Cascade bait');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'EDIT' });

    // The sharee's own task, which they could then legally delete — taking the
    // owner's task with it via the parent cascade, if re-parenting were allowed.
    const trap = await request(app).post('/api/tasks').set(as(shareeToken)).send({ title: 'Trap' });

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(as(shareeToken))
      .send({ parentId: trap.body.task.id });
    expect(res.status).toBe(403);

    // The owner's task is untouched and still top-level.
    const check = await request(app).get(`/api/tasks/${id}`).set(as(ownerToken));
    expect(check.status).toBe(200);
    expect(check.body.task.parentId).toBeNull();
  });

  test('owner lists the shares on a task', async () => {
    const id = await makeTask('List shares');
    await request(app).post(`/api/tasks/${id}/share`).set(as(ownerToken)).send({ email: shareeEmail, role: 'EDIT' });

    const res = await request(app).get(`/api/tasks/${id}/shares`).set(as(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.shares.some((s) => s.email === shareeEmail && s.role === 'EDIT')).toBe(true);
  });
});
