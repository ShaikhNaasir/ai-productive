'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

jest.mock('../services/aiClient', () => ({
  parseTask: jest.fn(),
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
    .send({ email: 'ai@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('AI wiring', () => {
  test('parse-task returns structured task without persisting', async () => {
    aiClient.parseTask.mockResolvedValue({ title: 'Prepare interview', priority: 'HIGH', dueDate: null, tags: [] });
    const res = await request(app)
      .post('/api/ai/parse-task')
      .set(auth())
      .send({ text: 'prepare for my interview next friday' });
    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('Prepare interview');
  });

  test('NL task creation persists a task', async () => {
    aiClient.parseTask.mockResolvedValue({ title: 'Call dentist', priority: 'MEDIUM', dueDate: '2026-08-20T09:00:00Z', tags: ['health'] });
    const res = await request(app)
      .post('/api/ai/tasks')
      .set(auth())
      .send({ text: 'remind me to call the dentist' });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Call dentist');
    expect(res.body.task.id).toBeTruthy();

    // Confirm it now appears in the task list
    const list = await request(app).get('/api/tasks').set(auth());
    expect(list.body.tasks.some((t) => t.title === 'Call dentist')).toBe(true);
  });

  test('summarize by text', async () => {
    aiClient.summarize.mockResolvedValue({ key_points: ['a', 'b'], summary: 's' });
    const res = await request(app).post('/api/ai/summarize').set(auth()).send({ text: 'long note' });
    expect(res.status).toBe(200);
    expect(res.body.key_points).toEqual(['a', 'b']);
  });

  test('chat gathers context and replies', async () => {
    aiClient.chat.mockResolvedValue({ reply: 'You have tasks due.' });
    const res = await request(app)
      .post('/api/ai/chat')
      .set(auth())
      .send({ message: 'what should I do today?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('You have tasks due.');
    // context passed as second arg contains tasks array
    const contextArg = aiClient.chat.mock.calls.at(-1)[1];
    expect(contextArg).toHaveProperty('tasks');
  });

  test('gracefully returns 503 when AI service is down', async () => {
    const ApiError = require('../utils/ApiError');
    aiClient.parseTask.mockRejectedValue(new ApiError(503, 'AI service is unavailable.'));
    const res = await request(app).post('/api/ai/parse-task').set(auth()).send({ text: 'x' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/unavailable/i);
  });
});
