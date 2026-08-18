'use strict';

// Zero retry delay so the test is fast.
process.env.AI_RETRY_DELAY_MS = '0';

const mockPost = jest.fn();
jest.mock('axios', () => ({ create: () => ({ post: mockPost }) }));
// recordUsage only touches prisma when a user context is set (never in this test),
// but the module still requires it at load time.
jest.mock('../models/prisma', () => ({ aiUsage: { create: jest.fn() } }));

const aiClient = require('../services/aiClient');

describe('aiClient retry + graceful degradation', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  test('retries once on a cold-start 503, then succeeds', async () => {
    mockPost
      .mockRejectedValueOnce({ response: { status: 503, data: {} } })
      .mockResolvedValueOnce({ data: { reply: 'ok' }, headers: {} });

    const res = await aiClient.chat('hi', {}, []);
    expect(res.reply).toBe('ok');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test('retries on a transport error (no response), then succeeds', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ data: { key_points: [], summary: '' }, headers: {} });

    const res = await aiClient.summarize('text');
    expect(res).toBeDefined();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test('after the retry is exhausted, throws a 503 (graceful degrade)', async () => {
    mockPost.mockRejectedValue({ response: { status: 503, data: { detail: 'down' } } });

    await expect(aiClient.chat('hi', {}, [])).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPost).toHaveBeenCalledTimes(2); // initial + one retry
  });

  test('does not retry a non-retryable error (401 maps to 500)', async () => {
    mockPost.mockRejectedValue({ response: { status: 401, data: { detail: 'bad key' } } });

    await expect(aiClient.chat('hi', {}, [])).rejects.toMatchObject({ statusCode: 500 });
    expect(mockPost).toHaveBeenCalledTimes(1); // no retry
  });

  test('each attempt carries a timeout so one call cannot run unbounded', async () => {
    mockPost.mockResolvedValueOnce({ data: { reply: 'ok' }, headers: {} });

    await aiClient.chat('hi', {}, []);

    const [, , opts] = mockPost.mock.calls[0];
    expect(opts.timeout).toBeGreaterThan(0);
    // Never longer than the total budget for the whole call.
    expect(opts.timeout).toBeLessThanOrEqual(75000);
  });

  test('the retry is skipped when it would exceed the total budget', async () => {
    jest.resetModules();
    process.env.AI_TOTAL_BUDGET_MS = '10';
    process.env.AI_RETRY_DELAY_MS = '50'; // sleeping would blow the 10ms budget
    const fresh = require('../services/aiClient');
    mockPost.mockRejectedValue({ response: { status: 503, data: { detail: 'down' } } });

    await expect(fresh.chat('hi', {}, [])).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPost).toHaveBeenCalledTimes(1); // no retry — the budget forbade it

    delete process.env.AI_TOTAL_BUDGET_MS;
    process.env.AI_RETRY_DELAY_MS = '0';
    jest.resetModules();
  });
});
