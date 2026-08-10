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

// Compute and persist an embedding for a single record. Failures are swallowed so
// they never break the originating CRUD request.
async function indexRecord(table, id, text) {
  if (!config.embeddingsEnabled || !text) return;
  try {
    const { embeddings } = await aiClient.embed([text]);
    const literal = toVectorLiteral(embeddings[0]);
    // Parameterize the id; the vector literal contains only numbers we generated.
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET embedding = '${literal}'::vector WHERE id = $1`,
      id
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
