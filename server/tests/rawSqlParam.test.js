'use strict';

// Enable the semantic-search path so the parameterized raw SQL is exercised.
process.env.EMBEDDINGS_ENABLED = 'true';

const mockExec = jest.fn().mockResolvedValue(0);
const mockQuery = jest.fn().mockResolvedValue([]);

jest.mock('../models/prisma', () => ({
  $executeRawUnsafe: mockExec,
  $queryRawUnsafe: mockQuery,
  // Keyword fallback (semantic returns nothing here) needs these.
  note: { findMany: jest.fn().mockResolvedValue([]) },
  task: { findMany: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../services/aiClient', () => ({
  embed: jest.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] }),
}));

const embeddingService = require('../services/embeddingService');
const { search } = require('../controllers/search.controller');

// Don't leak the flag into other test files (process.env is process-global).
afterAll(() => {
  delete process.env.EMBEDDINGS_ENABLED;
});

describe('raw SQL is parameterized (no interpolation)', () => {
  test('indexTask binds the vector literal as a parameter', async () => {
    await embeddingService.indexTask({ id: 't1', title: 'Hello', description: '', tags: [] });

    expect(mockExec).toHaveBeenCalledTimes(1);
    const [sql, id, literal] = mockExec.mock.calls[0];
    expect(sql).toContain('$2::vector');
    expect(sql).not.toContain('[0.1'); // literal must NOT be interpolated into the SQL
    expect(id).toBe('t1');
    expect(literal).toBe('[0.1,0.2,0.3]');
  });

  test('vectorSearch binds user, vector, and limit as parameters', async () => {
    const req = { query: { q: 'hello', limit: 5 }, body: {}, user: { id: 'u1' } };
    const res = { json: jest.fn() };

    await search(req, res);

    expect(mockQuery).toHaveBeenCalled();
    const [sql, userId, literal, limit] = mockQuery.mock.calls[0];
    expect(sql).toContain('$2::vector');
    expect(sql).toContain('LIMIT $3');
    expect(sql).not.toContain('[0.1');
    expect(userId).toBe('u1');
    expect(literal).toBe('[0.1,0.2,0.3]');
    expect(limit).toBe(5);
  });
});
