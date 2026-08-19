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
  // Google Calendar sync (Roadmap C1). Optional — absent credentials leave the
  // integration disabled and its endpoints degrade to 503 (never crash core CRUD).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/google/callback',
  },
  // Email verification (Roadmap E1). Optional — with no Resend key, verification
  // emails aren't sent and the hard-block on unverified accounts stays OFF (you
  // can't require what you can't deliver). Set the key to turn the feature on.
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM || 'Productivity <onboarding@resend.dev>',
  },
  // SaaS billing (Roadmap D5). Optional — absent keys leave billing disabled: the
  // checkout/cancel endpoints degrade to 503 and no one can be upgraded via
  // payment, but plan-gating still runs off the User.plan column (an admin can set
  // it) and core CRUD is unaffected.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    planId: process.env.RAZORPAY_PLAN_ID,
  },
  // Semantic search needs the AI service + Voyage key + pgvector. Off by default so
  // core CRUD never blocks on embeddings; enable in production once configured.
  embeddingsEnabled: process.env.EMBEDDINGS_ENABLED === 'true',
  databaseUrl: process.env.DATABASE_URL,
  // Bootstrap admins. Emails in this comma-separated allowlist are granted role
  // ADMIN on register (and promoted on their next login). Deliberately read from
  // the environment only — never hardcode a real address, since this repo is
  // public. Empty by default, so no account is silently privileged.
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};

// In production the shared internal key must be a real, non-default secret —
// otherwise anyone who reaches the public AI service URL could call it. Fail fast
// rather than silently falling back to the public 'dev-internal-key'.
if (config.env === 'production') {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || key === 'dev-internal-key') {
    throw new Error('INTERNAL_API_KEY must be set to a strong, non-default value in production');
  }
}

module.exports = config;
