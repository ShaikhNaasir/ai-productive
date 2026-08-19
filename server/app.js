'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const routes = require('./routes');
const asyncHandler = require('./utils/asyncHandler');
const billingController = require('./controllers/billing.controller');
const { authLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { requestContext } = require('./middleware/requestContext');

function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Render's proxy — needed for correct client IPs / rate limiting
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    })
  );
  // The Razorpay webhook must verify an HMAC over the exact raw bytes, so it is
  // mounted with a raw body parser BEFORE express.json() (which would otherwise
  // consume and re-serialize the body, breaking the signature). It is
  // unauthenticated by design — trust comes from the signature.
  app.post(
    '/api/billing/webhook',
    express.raw({ type: '*/*', limit: '1mb' }),
    asyncHandler(billingController.webhook)
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use(morgan('dev'));
    // Throttle auth endpoints to slow brute-force attempts (disabled in tests).
    app.use('/api/auth', authLimiter);
  }

  // Wire embedding indexing hooks so task/note writes refresh their vectors
  // (no-op unless EMBEDDINGS_ENABLED=true).
  const embeddingService = require('./services/embeddingService');
  require('./controllers/task.controller').setTaskChangeHook(embeddingService.indexTask);
  require('./controllers/note.controller').setNoteChangeHook(embeddingService.indexNote);

  app.get('/', (req, res) => {
    res.json({ name: 'Productivity Assistant API', version: '0.1.0' });
  });

  app.use('/api', requestContext, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
