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
});
