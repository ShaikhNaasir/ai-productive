'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const aiClient = require('../services/aiClient');
const { extractText } = require('../services/textExtract');

// Cap stored note content so a large document can't bloat a row unreasonably.
const MAX_STORED_CHARS = 100000;

function titleFromFilename(name) {
  const base = (name || 'Untitled document').replace(/\.[^.]+$/, '').trim();
  return (base || 'Untitled document').slice(0, 300);
}

// Upload a document, extract its text, store it as a user-scoped note, and
// return an AI summary. Text extraction and storage keep working even if the
// AI service is unavailable (summary/key points come back empty).
async function uploadAndSummarize(req, res) {
  if (!req.file) throw ApiError.badRequest('No file uploaded');

  const text = await extractText(req.file.buffer, req.file.mimetype);

  const note = await prisma.note.create({
    data: {
      userId: req.user.id,
      title: titleFromFilename(req.file.originalname),
      content: text.slice(0, MAX_STORED_CHARS),
      tags: ['document'],
    },
  });

  let summary = '';
  let keyPoints = [];
  try {
    const result = await aiClient.summarize(text);
    summary = result.summary || '';
    keyPoints = result.key_points || [];
  } catch (err) {
    // Graceful degradation: the document is still stored; summarization is best-effort.
    if (!(err instanceof ApiError) || err.statusCode < 500) throw err;
  }

  res.status(201).json({ note, summary, key_points: keyPoints });
}

module.exports = { uploadAndSummarize };
