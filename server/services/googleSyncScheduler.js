'use strict';

const { syncAll } = require('./googleSync');

let timer = null;
let running = false;

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

// Skip a tick while the previous one is still running. A sync that outruns the
// interval would otherwise overlap itself and double-insert events whose
// googleEventId has not been written back yet.
async function guardedTick() {
  if (running) return;
  running = true;
  try {
    await tick();
  } finally {
    running = false;
  }
}

// Chained setTimeout rather than setInterval, so the gap is measured from the end
// of one run to the start of the next.
function startScheduler(intervalMs) {
  if (timer) return timer;
  const ms = intervalMs || parseInt(process.env.GOOGLE_SYNC_INTERVAL_MS || '300000', 10);
  const loop = () => {
    timer = setTimeout(async () => {
      await guardedTick();
      if (timer) loop();
    }, ms);
    if (timer.unref) timer.unref();
  };
  loop();
  return timer;
}

function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, tick, guardedTick };
