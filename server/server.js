'use strict';

const http = require('http');
const createApp = require('./app');
const config = require('./config/env');

const app = createApp();
const server = http.createServer(app);

// Socket.IO realtime layer + reminder scheduler.
const { attachRealtime } = require('./realtime');
attachRealtime(server);
const { startScheduler } = require('./services/reminderScheduler');
startScheduler();

// Background Google Calendar two-way sync — only when the integration is configured.
const googleCalendar = require('./services/googleCalendar');
if (googleCalendar.isConfigured()) {
  require('./services/googleSyncScheduler').startScheduler();
}

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${config.port} (${config.env})`);
});

// Render sends SIGTERM on redeploy and scale-down. Stop accepting connections, let
// in-flight requests finish, halt the schedulers, and drain the Prisma pool rather
// than having the process killed mid-request.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    try {
      require('./services/reminderScheduler').stopScheduler();
      if (googleCalendar.isConfigured()) {
        require('./services/googleSyncScheduler').stopScheduler();
      }
      await require('./models/prisma').$disconnect();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`shutdown cleanup failed: ${err.message}`);
    }
    process.exit(0);
  });

  // Don't hang forever on a stuck keep-alive connection.
  setTimeout(() => process.exit(1), 10000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal));
}

module.exports = server;
