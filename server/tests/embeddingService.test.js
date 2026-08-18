'use strict';

// Embeddings on, but the provider and DB are mocked so we test the batching and
// counting logic in isolation.
jest.mock('../config/env', () => ({ embeddingsEnabled: true }));
jest.mock('../services/aiClient', () => ({ embed: jest.fn() }));
jest.mock('../models/prisma', () => ({ $executeRawUnsafe: jest.fn() }));

const embeddingService = require('../services/embeddingService');
const aiClient = require('../services/aiClient');
const prisma = require('../models/prisma');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$executeRawUnsafe.mockResolvedValue(1);
});

describe('embeddingService.reindexRecords', () => {
  test('embeds every record in a single batched call, not one per record', async () => {
    aiClient.embed.mockResolvedValue({ embeddings: [[1], [2], [3]] });

    const res = await embeddingService.reindexRecords([
      { table: 'tasks', id: 't1', text: 'a' },
      { table: 'notes', id: 'n1', text: 'b' },
      { table: 'tasks', id: 't2', text: 'c' },
    ]);

    // One embed call for all three — this is the fix for the concurrent-call
    // storm that silently rate-limited and left rows unindexed.
    expect(aiClient.embed).toHaveBeenCalledTimes(1);
    expect(aiClient.embed).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ indexed: 3, failed: 0, total: 3 });
  });

  test('reports the real success count when some vectors come back missing', async () => {
    aiClient.embed.mockResolvedValue({ embeddings: [[1], null, [3]] });

    const res = await embeddingService.reindexRecords([
      { table: 'tasks', id: 't1', text: 'a' },
      { table: 'notes', id: 'n1', text: 'b' },
      { table: 'tasks', id: 't2', text: 'c' },
    ]);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ indexed: 2, failed: 1, total: 3 });
  });

  test('a failed batch embed never throws and counts every record as failed', async () => {
    aiClient.embed.mockRejectedValue(new Error('429 rate limited'));

    const res = await embeddingService.reindexRecords([
      { table: 'tasks', id: 't1', text: 'a' },
      { table: 'notes', id: 'n1', text: 'b' },
    ]);

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(res).toEqual({ indexed: 0, failed: 2, total: 2 });
  });

  test('skips records with empty text or an unknown table', async () => {
    aiClient.embed.mockResolvedValue({ embeddings: [[1]] });

    const res = await embeddingService.reindexRecords([
      { table: 'tasks', id: 't1', text: 'keep' },
      { table: 'tasks', id: 't2', text: '' },
      { table: 'widgets', id: 'w1', text: 'nope' },
    ]);

    expect(aiClient.embed).toHaveBeenCalledWith(['keep']);
    expect(res).toEqual({ indexed: 1, failed: 0, total: 3 });
  });
});
