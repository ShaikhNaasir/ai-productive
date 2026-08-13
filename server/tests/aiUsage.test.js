'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');
const { costUsd } = require('../utils/aiCost');

const app = createApp();
let token;
let userId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'usage@b.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('aiCost', () => {
  test('prices Opus 4.8 tokens per million', () => {
    // 1M input @ $5 + 1M output @ $25 = $30
    expect(costUsd('claude-opus-4-8', 1_000_000, 1_000_000)).toBe(30);
  });

  test('prices Haiku 4.5 tokens per million', () => {
    // 1M input @ $1 + 1M output @ $5 = $6
    expect(costUsd('claude-haiku-4-5', 1_000_000, 1_000_000)).toBe(6);
  });

  test('falls back to an Opus-tier rate for an unknown model', () => {
    expect(costUsd('mystery-model', 1_000_000, 0)).toBe(5);
  });

  test('prices OpenAI and Gemini default models', () => {
    // gpt-4o-mini: 1M in @ $0.15 + 1M out @ $0.60 = $0.75
    expect(costUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBe(0.75);
    // gemini-2.0-flash: 1M in @ $0.10 + 1M out @ $0.40 = $0.50
    expect(costUsd('gemini-2.0-flash', 1_000_000, 1_000_000)).toBe(0.5);
  });
});

describe('AI usage summary', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/ai/usage');
    expect(res.status).toBe(401);
  });

  test('empty usage returns zeroed totals with a 7-day series', async () => {
    const res = await request(app).get('/api/ai/usage').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.callCount).toBe(0);
    expect(res.body.totalCostUsd).toBe(0);
    expect(res.body.last7Days).toHaveLength(7);
  });

  test('aggregates seeded usage rows by endpoint and total cost', async () => {
    await prisma.aiUsage.create({
      data: { userId, endpoint: 'summarize', model: 'claude-opus-4-8', inputTokens: 1000, outputTokens: 500, costUsd: 0.0175 },
    });
    await prisma.aiUsage.create({
      data: { userId, endpoint: 'summarize', model: 'claude-opus-4-8', inputTokens: 2000, outputTokens: 1000, costUsd: 0.035 },
    });
    await prisma.aiUsage.create({
      data: { userId, endpoint: 'chat', model: 'claude-opus-4-8', inputTokens: 500, outputTokens: 200, costUsd: 0.0075 },
    });
    // Another user's usage must not leak in.
    await prisma.aiUsage.create({
      data: { userId: 'someone-else', endpoint: 'chat', model: 'claude-opus-4-8', inputTokens: 9999, outputTokens: 9999, costUsd: 9.99 },
    });

    const res = await request(app).get('/api/ai/usage').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.callCount).toBe(3);
    expect(res.body.totalInputTokens).toBe(3500);
    expect(res.body.totalOutputTokens).toBe(1700);
    expect(res.body.totalCostUsd).toBeCloseTo(0.06, 6);

    const summarize = res.body.byEndpoint.find((e) => e.endpoint === 'summarize');
    expect(summarize.calls).toBe(2);
    expect(summarize.costUsd).toBeCloseTo(0.0525, 6);
    // Sorted by cost desc — summarize (0.0525) before chat (0.0075).
    expect(res.body.byEndpoint[0].endpoint).toBe('summarize');
  });
});
