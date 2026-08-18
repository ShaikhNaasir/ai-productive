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
    .send({ email: 'search@b.com', password: 'password123' });
  token = res.body.token;
  await request(app).post('/api/notes').set({ Authorization: `Bearer ${token}` }).send({ title: 'Interview prep notes', content: 'study system design' });
  await request(app).post('/api/tasks').set({ Authorization: `Bearer ${token}` }).send({ title: 'Prepare interview slides' });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('search (keyword fallback)', () => {
  test('finds notes and tasks by keyword', async () => {
    const res = await request(app).get('/api/search?q=interview').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('keyword');
    const types = res.body.results.map((r) => r.type);
    expect(types).toContain('note');
    expect(types).toContain('task');
  });

  test('requires a query', async () => {
    const res = await request(app).get('/api/search').set(auth());
    expect(res.status).toBe(400);
  });

  test('is user-scoped', async () => {
    const other = await request(app).post('/api/auth/register').send({ email: 'search2@b.com', password: 'password123' });
    const res = await request(app)
      .get('/api/search?q=interview')
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(0);
  });

  test('many matching notes do not starve tasks out of the results', async () => {
    const solo = await request(app)
      .post('/api/auth/register')
      .send({ email: 'starve@b.com', password: 'password123' });
    const as = { Authorization: `Bearer ${solo.body.token}` };

    // More matching notes than the default limit of 10.
    for (let i = 0; i < 14; i += 1) {
      await request(app).post('/api/notes').set(as).send({ title: `widget note ${i}`, content: 'widget' });
    }
    await request(app).post('/api/tasks').set(as).send({ title: 'widget task' });

    const res = await request(app).get('/api/search?q=widget').set(as);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(10);
    // Concatenating notes-then-tasks would have shown zero tasks here.
    expect(res.body.results.some((r) => r.type === 'task')).toBe(true);
  });

  test('respects the limit exactly when both types match', async () => {
    const solo = await request(app)
      .post('/api/auth/register')
      .send({ email: 'limit@b.com', password: 'password123' });
    const as = { Authorization: `Bearer ${solo.body.token}` };
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/notes').set(as).send({ title: `gadget note ${i}`, content: 'gadget' });
      await request(app).post('/api/tasks').set(as).send({ title: `gadget task ${i}` });
    }

    const res = await request(app).get('/api/search?q=gadget&limit=5').set(as);
    expect(res.body.results.length).toBe(5);
  });
});
