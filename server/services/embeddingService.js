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

const embeddingService = {
  indexTask: (task) => indexRecord('tasks', task.id, taskText(task)),
  indexNote: (note) => indexRecord('notes', note.id, noteText(note)),
  embedQuery: async (q) => {
    const { embeddings } = await aiClient.embed([q]);
    return embeddings[0];
  },
  toVectorLiteral,
};

module.exports = embeddingService;
