'use strict';

const { syncAll } = require('./googleSync');

let timer = null;

// Periodically two-way sync every connected Google account. Mirrors the persistent
// reminder scheduler: DB-backed (state lives in GoogleAccount.syncToken), so a
// restart resumes cleanly. Failures are swallowed — sync must never crash the server.
async function tick() {
  try {
    await syncAll();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[google-sync] tick failed: ${err.message}`);
  }
}

function startScheduler(intervalMs) {
  if (timer) return timer;
  const ms = intervalMs || parseInt(process.env.GOOGLE_SYNC_INTERVAL_MS || '300000', 10);
  timer = setInterval(() => {
    tick().catch(() => {});
  }, ms);
  if (timer.unref) timer.unref();
  return timer;
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, tick };
