'use strict';

require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // In test mode we tolerate missing secrets so unit tests can run without a real environment.
    if (process.env.NODE_ENV === 'test') return `test-${name}`;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Render's blueprint `fromService` injects a bare hostname (no scheme). Prepend https://
// so service-to-service URLs and CORS origins are usable as-is.
function ensureScheme(url) {
  if (!url) return url;
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '4000', 10),
  clientOrigin: ensureScheme(process.env.CLIENT_ORIGIN) || 'http://localhost:5173',
  jwt: {
    secret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test-secret' : undefined),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  aiService: {
    url: ensureScheme(process.env.AI_SERVICE_URL) || 'http://localhost:8000',
    internalKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
  },
  // Semantic search needs the AI service + Voyage key + pgvector. Off by default so
  // core CRUD never blocks on embeddings; enable in production once configured.
  embeddingsEnabled: process.env.EMBEDDINGS_ENABLED === 'true',
  databaseUrl: process.env.DATABASE_URL,
};

module.exports = config;
