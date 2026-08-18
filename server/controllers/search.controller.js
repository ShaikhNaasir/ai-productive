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

  return (
    [...notes, ...tasks]
      .sort((a, b) => Number(a.distance) - Number(b.distance))
      .slice(0, limit)
      // pgvector's `<=>` is cosine distance in [0, 2], so a bare `1 - distance`
      // reports anything more than 90° from the query as a negative relevance.
      // Normalise onto [0, 1].
      .map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        score: Math.max(0, Math.min(1, 1 - Number(r.distance) / 2)),
      }))
  );
}

// Interleave two ranked lists so truncating to `limit` can't starve one type.
// Concatenating notes-then-tasks meant 10 matching notes hid every task.
function interleave(a, b, limit) {
  const merged = [];
  for (let i = 0; i < Math.max(a.length, b.length) && merged.length < limit; i += 1) {
    if (a[i]) merged.push(a[i]);
    if (b[i] && merged.length < limit) merged.push(b[i]);
  }
  return merged;
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
  return interleave(
    notes.map((n) => ({ id: n.id, title: n.title, type: 'note', snippet: (n.content || '').slice(0, 160) })),
    tasks.map((t) => ({ id: t.id, title: t.title, type: 'task', snippet: t.description || '' })),
    limit
  );
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
