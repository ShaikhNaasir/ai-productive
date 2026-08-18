'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

jest.mock('../services/aiClient', () => ({
  parseTask: jest.fn(),
  breakdown: jest.fn(),
  planDay: jest.fn(),
  summarize: jest.fn(),
  prioritize: jest.fn(),
  chat: jest.fn(),
  embed: jest.fn(),
}));

const request = require('supertest');
const createApp = require('../app');
const aiClient = require('../services/aiClient');

const app = createApp();
let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'docs@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('document upload + summarization', () => {
  test('requires auth', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(401);
  });

  test('uploads a text document, stores it as a note, and returns a summary', async () => {
    aiClient.summarize.mockResolvedValue({ key_points: ['point a', 'point b'], summary: 'short summary' });
    const res = await request(app)
      .post('/api/documents/upload')
      .set(auth())
      .attach('file', Buffer.from('This is the document body.'), {
        filename: 'meeting-notes.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(201);
    expect(res.body.note.id).toBeTruthy();
    expect(res.body.note.title).toBe('meeting-notes');
    expect(res.body.note.tags).toContain('document');
    expect(res.body.note.content).toContain('document body');
    expect(res.body.key_points).toEqual(['point a', 'point b']);

    // The stored document now appears in the user's notes.
    const notes = await request(app).get('/api/notes').set(auth());
    expect(notes.body.notes.some((n) => n.title === 'meeting-notes')).toBe(true);
  });

  test('truncates a large document before sending it to the LLM', async () => {
    aiClient.summarize.mockClear();
    aiClient.summarize.mockResolvedValue({ key_points: [], summary: '' });
    // Well past the 40k summarization cap; a 2MB PDF can extract to far more.
    const huge = 'x'.repeat(200000);

    const res = await request(app)
      .post('/api/documents/upload')
      .set(auth())
      .attach('file', Buffer.from(huge), { filename: 'huge.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    const sent = aiClient.summarize.mock.calls[0][0];
    expect(sent.length).toBe(40000);
    // Stored content keeps its own, larger cap.
    expect(res.body.note.content.length).toBe(100000);
  });

  test('still stores the note when the AI service is unavailable', async () => {
    const ApiError = require('../utils/ApiError');
    aiClient.summarize.mockRejectedValue(new ApiError(503, 'AI unavailable'));
    const res = await request(app)
      .post('/api/documents/upload')
      .set(auth())
      .attach('file', Buffer.from('offline body'), { filename: 'offline.md', contentType: 'text/markdown' });
    expect(res.status).toBe(201);
    expect(res.body.note.title).toBe('offline');
    expect(res.body.key_points).toEqual([]);
  });

  test('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set(auth())
      .attach('file', Buffer.from('binary'), { filename: 'a.bin', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
  });

  test('rejects a file over the size limit', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 'a');
    const res = await request(app)
      .post('/api/documents/upload')
      .set(auth())
      .attach('file', big, { filename: 'big.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no file', async () => {
    const res = await request(app).post('/api/documents/upload').set(auth());
    expect(res.status).toBe(400);
  });
});
