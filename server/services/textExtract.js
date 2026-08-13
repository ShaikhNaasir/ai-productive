'use strict';

const ApiError = require('../utils/ApiError');

// Plain-text formats we can read directly from the uploaded buffer.
const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
]);
const PDF_MIME = 'application/pdf';

function isTextMime(mimetype) {
  if (!mimetype) return false;
  if (TEXT_MIMES.has(mimetype)) return true;
  return TEXT_MIME_PREFIXES.some((p) => mimetype.startsWith(p));
}

// Extract readable text from an uploaded document buffer. Supports plain-text
// formats (utf8) and PDFs (via pdf-parse). Throws ApiError.badRequest for
// unsupported types or documents with no extractable text.
async function extractText(buffer, mimetype) {
  let text;
  if (isTextMime(mimetype)) {
    text = buffer.toString('utf8');
  } else if (mimetype === PDF_MIME) {
    // Required lazily so the dependency only loads when a PDF is uploaded.
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } else {
    throw ApiError.badRequest(`Unsupported file type: ${mimetype || 'unknown'}`);
  }

  text = (text || '').trim();
  if (!text) throw ApiError.badRequest('No readable text found in the document');
  return text;
}

module.exports = { extractText, isTextMime, PDF_MIME };
