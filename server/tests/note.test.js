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
    .send({ email: 'notes@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('notes', () => {
  test('create note', async () => {
    const res = await request(app)
      .post('/api/notes')
      .set(auth())
      .send({ title: 'Meeting', content: 'API integration pending', category: 'work', tags: ['project'] });
    expect(res.status).toBe(201);
    expect(res.body.note.title).toBe('Meeting');
    expect(res.body.note.pinned).toBe(false);
  });

  test('pin toggles', async () => {
    const created = await request(app).post('/api/notes').set(auth()).send({ title: 'pin me' });
    const id = created.body.note.id;
    const res = await request(app).post(`/api/notes/${id}/pin`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.note.pinned).toBe(true);
  });

  test('keyword search', async () => {
    await request(app).post('/api/notes').set(auth()).send({ title: 'Interview prep', content: 'study algorithms' });
    const res = await request(app).get('/api/notes?q=interview').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.notes.some((n) => /interview/i.test(n.title))).toBe(true);
  });

  test('filter by category', async () => {
    const res = await request(app).get('/api/notes?category=work').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.notes.every((n) => n.category === 'work')).toBe(true);
  });

  test('delete note', async () => {
    const created = await request(app).post('/api/notes').set(auth()).send({ title: 'temp' });
    const id = created.body.note.id;
    const res = await request(app).delete(`/api/notes/${id}`).set(auth());
    expect(res.status).toBe(204);
  });
});
