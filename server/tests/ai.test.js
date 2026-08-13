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

  test('breakdown persists AI subtasks under the parent task', async () => {
    const parent = await request(app).post('/api/tasks').set(auth()).send({ title: 'Launch blog' });
    const parentId = parent.body.task.id;

    aiClient.breakdown.mockResolvedValue({ subtasks: ['Draft outline', 'Write post', 'Publish'] });
    const res = await request(app).post(`/api/ai/tasks/${parentId}/breakdown`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.subtasks.map((s) => s.title)).toEqual(['Draft outline', 'Write post', 'Publish']);
    expect(res.body.subtasks.every((s) => s.parentId === parentId)).toBe(true);

    // They surface nested under the parent in the task list.
    const list = await request(app).get('/api/tasks').set(auth());
    const top = list.body.tasks.find((t) => t.id === parentId);
    expect(top.subtasks.length).toBe(3);
  });

  test('breakdown returns 503 when AI service is down', async () => {
    const ApiError = require('../utils/ApiError');
    const parent = await request(app).post('/api/tasks').set(auth()).send({ title: 'Down task' });
    aiClient.breakdown.mockRejectedValue(new ApiError(503, 'AI service is unavailable.'));
    const res = await request(app).post(`/api/ai/tasks/${parent.body.task.id}/breakdown`).set(auth());
    expect(res.status).toBe(503);
  });

  test('plan-day gathers context and returns proposed blocks', async () => {
    await request(app).post('/api/tasks').set(auth()).send({ title: 'Write spec' });
    aiClient.planDay.mockResolvedValue({
      blocks: [
        { title: 'Write spec', startTime: '2026-08-13T09:00:00Z', endTime: '2026-08-13T10:00:00Z', reason: 'focus' },
      ],
    });
    const res = await request(app).post('/api/ai/plan-day').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.blocks[0].title).toBe('Write spec');
    // Controller passes gathered tasks to the AI client.
    const arg = aiClient.planDay.mock.calls.at(-1)[0];
    expect(Array.isArray(arg.tasks)).toBe(true);
  });

  test('plan-day/accept persists blocks as schedule entries', async () => {
    const blocks = [
      { title: 'Deep work', startTime: '2026-08-13T09:00:00Z', endTime: '2026-08-13T10:30:00Z', reason: 'top priority' },
    ];
    const res = await request(app).post('/api/ai/plan-day/accept').set(auth()).send({ blocks });
    expect(res.status).toBe(201);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0].id).toBeTruthy();

    const list = await request(app).get('/api/schedules').set(auth());
    expect(list.body.schedules.some((s) => s.title === 'Deep work')).toBe(true);
  });

  test('plan-day/accept rejects an invalid block', async () => {
    const res = await request(app)
      .post('/api/ai/plan-day/accept')
      .set(auth())
      .send({ blocks: [{ title: '', startTime: '2026-08-13T09:00:00Z' }] });
    expect(res.status).toBe(400);
  });

  test('plan-day returns 503 when AI service is down', async () => {
    const ApiError = require('../utils/ApiError');
    aiClient.planDay.mockRejectedValue(new ApiError(503, 'AI service is unavailable.'));
    const res = await request(app).post('/api/ai/plan-day').set(auth());
    expect(res.status).toBe(503);
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
