'use strict';

const { z } = require('zod');
const prisma = require('../models/prisma');
const config = require('../config/env');
const embeddingService = require('../services/embeddingService');

const querySchema = z.object({ q: z.string().trim().min(1), limit: z.coerce.number().min(1).max(50).optional().default(10) });

// Semantic (embedding) search across the user's notes and tasks via pgvector.
async function vectorSearch(userId, q, limit) {
  const vec = await embeddingService.embedQuery(q);
  const literal = embeddingService.toVectorLiteral(vec);

  // All dynamic values are bound as parameters ($1 user, $2 vector, $3 limit) —
  // nothing is string-interpolated into the SQL.
  const [notes, tasks] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT id, title, 'note' AS type, (embedding <=> $2::vector) AS distance
       FROM "notes" WHERE "userId" = $1 AND embedding IS NOT NULL
       ORDER BY distance ASC LIMIT $3`,
      userId,
      literal,
      limit
    ),
    prisma.$queryRawUnsafe(
      `SELECT id, title, 'task' AS type, (embedding <=> $2::vector) AS distance
       FROM "tasks" WHERE "userId" = $1 AND embedding IS NOT NULL
       ORDER BY distance ASC LIMIT $3`,
      userId,
      literal,
      limit
    ),
  ]);

  return [...notes, ...tasks]
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .slice(0, limit)
    .map((r) => ({ id: r.id, title: r.title, type: r.type, score: 1 - Number(r.distance) }));
}

// Keyword fallback used when embeddings are disabled or the vector search fails.
async function keywordSearch(userId, q, limit) {
  const like = { contains: q, mode: 'insensitive' };
  const [notes, tasks] = await Promise.all([
    prisma.note.findMany({
      where: { userId, OR: [{ title: like }, { content: like }] },
      take: limit,
    }),
    prisma.task.findMany({
      where: { userId, OR: [{ title: like }, { description: like }] },
      take: limit,
    }),
  ]);
  return [
    ...notes.map((n) => ({ id: n.id, title: n.title, type: 'note', snippet: (n.content || '').slice(0, 160) })),
    ...tasks.map((t) => ({ id: t.id, title: t.title, type: 'task', snippet: t.description || '' })),
  ].slice(0, limit);
}

async function search(req, res) {
  const { q, limit } = querySchema.parse({ ...req.query, ...req.body });
  const userId = req.user.id;

  let results = null;
  let mode = 'keyword';

  if (config.embeddingsEnabled) {
    try {
      const semantic = await vectorSearch(userId, q, limit);
      // Only use semantic results if there are any; otherwise fall through to keyword
      // (e.g. before existing rows have been indexed).
      if (semantic.length > 0) {
        results = semantic;
        mode = 'semantic';
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[search] semantic search failed, falling back to keyword: ${err.message}`);
    }
  }

  if (!results) {
    results = await keywordSearch(userId, q, limit);
  }

  res.json({ results, mode });
}

module.exports = { search };
