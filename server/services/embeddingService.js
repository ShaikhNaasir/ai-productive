'use strict';

const prisma = require('../models/prisma');
const aiClient = require('./aiClient');
const config = require('../config/env');

// Build the text that represents a record for embedding.
function taskText(t) {
  return [t.title, t.description, (t.tags || []).join(' ')].filter(Boolean).join('\n');
}
function noteText(n) {
  return [n.title, n.content, (n.tags || []).join(' ')].filter(Boolean).join('\n');
}

function toVectorLiteral(vec) {
  return `[${vec.map((x) => Number(x)).join(',')}]`;
}

// Table names can't be bound as SQL parameters, so restrict them to a fixed
// allowlist (callers only ever pass these two constants).
const ALLOWED_TABLES = new Set(['tasks', 'notes']);

// Compute and persist an embedding for a single record. Failures are swallowed so
// they never break the originating CRUD request.
async function indexRecord(table, id, text) {
  if (!config.embeddingsEnabled || !text) return;
  if (!ALLOWED_TABLES.has(table)) return;
  try {
    const { embeddings } = await aiClient.embed([text]);
    const literal = toVectorLiteral(embeddings[0]);
    // id and the vector literal are both bound as parameters ($1, $2).
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET embedding = $2::vector WHERE id = $1`,
      id,
      literal
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[embeddings] failed to index ${table}/${id}: ${err.message}`);
  }
}

// Backfill embeddings for many records in ONE embed call. Firing a separate
// embed per record (Promise.all over every row) storms the provider on a free
// tier, so a slice of the calls rate-limit and — because indexRecord swallows
// failures — silently leave those rows unindexed. That makes semantic search
// miss notes/tasks by their own content. Batching one request, then persisting
// each vector, keeps the index complete and returns an honest success count.
async function reindexRecords(items) {
  if (!config.embeddingsEnabled) return { indexed: 0, failed: 0, total: items.length };
  const valid = items.filter((it) => it.text && ALLOWED_TABLES.has(it.table));
  if (valid.length === 0) return { indexed: 0, failed: 0, total: items.length };

  let embeddings;
  try {
    ({ embeddings } = await aiClient.embed(valid.map((it) => it.text)));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[embeddings] batch embed failed for ${valid.length} records: ${err.message}`);
    return { indexed: 0, failed: valid.length, total: items.length };
  }

  let indexed = 0;
  let failed = 0;
  for (let i = 0; i < valid.length; i += 1) {
    const vec = embeddings && embeddings[i];
    if (!vec) {
      failed += 1;
      continue;
    }
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "${valid[i].table}" SET embedding = $2::vector WHERE id = $1`,
        valid[i].id,
        toVectorLiteral(vec)
      );
      indexed += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[embeddings] failed to persist ${valid[i].table}/${valid[i].id}: ${err.message}`);
      failed += 1;
    }
  }
  return { indexed, failed, total: items.length };
}

const embeddingService = {
  indexTask: (task) => indexRecord('tasks', task.id, taskText(task)),
  indexNote: (note) => indexRecord('notes', note.id, noteText(note)),
  // Batch-backfill for the reindex endpoint. Reports real successes, not attempts.
  reindexAll: (tasks, notes) =>
    reindexRecords([
      ...tasks.map((t) => ({ table: 'tasks', id: t.id, text: taskText(t) })),
      ...notes.map((n) => ({ table: 'notes', id: n.id, text: noteText(n) })),
    ]),
  reindexRecords,
  embedQuery: async (q) => {
    const { embeddings } = await aiClient.embed([q], 'query');
    return embeddings[0];
  },
  toVectorLiteral,
};

module.exports = embeddingService;
