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

module.exports = server;
