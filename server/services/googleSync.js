'use strict';

const prisma = require('../models/prisma');
const googleCalendar = require('./googleCalendar');

// Map a Google event to local Schedule fields. Handles both timed events
// (start.dateTime) and all-day events (start.date).
function fromGoogleEvent(ev) {
  const start = ev.start && (ev.start.dateTime || ev.start.date);
  const end = ev.end && (ev.end.dateTime || ev.end.date);
  return {
    title: ev.summary || '(no title)',
    description: ev.description || null,
    location: ev.location || null,
    startTime: start ? new Date(start) : null,
    endTime: end ? new Date(end) : null,
  };
}

// Pull changed events from Google into local Schedules. Returns the next sync token
// and the set of Google event ids touched, so the push phase can let a remote change
// win a conflict (Google-wins policy).
async function pull(account) {
  let result;
  try {
    result = await googleCalendar.listEvents(account);
  } catch (err) {
    if (err.code === 410) {
      // Sync token expired — reset and do a fresh forward sync this run.
      await prisma.googleAccount.update({ where: { id: account.id }, data: { syncToken: null } });
      account.syncToken = null;
      result = await googleCalendar.listEvents(account);
    } else {
      throw err;
    }
  }

  const pulledIds = new Set();
  for (const ev of result.events || []) {
    if (!ev.id) continue;
    pulledIds.add(ev.id);
    const existing = await prisma.schedule.findFirst({
      where: { userId: account.userId, googleEventId: ev.id },
    });

    if (ev.status === 'cancelled') {
      if (existing) await prisma.schedule.delete({ where: { id: existing.id } });
      continue;
    }

    const data = fromGoogleEvent(ev);
    if (!data.startTime) continue; // skip malformed events
    if (existing) {
      await prisma.schedule.update({ where: { id: existing.id }, data });
    } else {
      await prisma.schedule.create({
        data: { ...data, userId: account.userId, googleEventId: ev.id },
      });
    }
  }
  return { nextSyncToken: result.nextSyncToken, pulledIds };
}

// Two-way sync for a single user. Pull-then-push so a remote edit wins over a
// concurrent local edit of the same event (Google-wins). Degrades: any Google
// error propagates to the caller, which decides how to surface it.
async function syncUser(userId) {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account) return { skipped: true };

  const syncStart = new Date();

  // Snapshot linked schedules edited locally since the last sync BEFORE pulling,
  // so events the pull just overwrote are excluded from the push (Google wins).
  const locallyChanged = account.lastSyncedAt
    ? await prisma.schedule.findMany({
        where: {
          userId,
          googleEventId: { not: null },
          updatedAt: { gt: account.lastSyncedAt },
        },
      })
    : [];

  // 1. Pull Google -> app.
  const { nextSyncToken, pulledIds } = await pull(account);

  // 2. Push new local schedules (never synced) -> Google.
  const unsynced = await prisma.schedule.findMany({
    where: { userId, googleEventId: null },
  });
  for (const s of unsynced) {
    const ev = await googleCalendar.insertEvent(account, s);
    if (ev && ev.id) {
      await prisma.schedule.update({ where: { id: s.id }, data: { googleEventId: ev.id } });
    }
  }

  // 3. Push local edits of already-linked schedules -> Google, except events a
  //    remote change just won during the pull.
  for (const s of locallyChanged) {
    if (pulledIds.has(s.googleEventId)) continue;
    const current = await prisma.schedule.findUnique({ where: { id: s.id } });
    if (current && current.googleEventId) {
      await googleCalendar.updateEvent(account, current.googleEventId, current);
    }
  }

  // 4. Persist incremental sync state.
  await prisma.googleAccount.update({
    where: { id: account.id },
    data: { syncToken: nextSyncToken || account.syncToken, lastSyncedAt: syncStart },
  });

  return { pulled: pulledIds.size, pushed: unsynced.length };
}

// Sync every connected account. Per-user failures are isolated and logged so one
// bad account never stalls the others.
async function syncAll() {
  const accounts = await prisma.googleAccount.findMany();
  for (const account of accounts) {
    try {
      await syncUser(account.userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[google-sync] user ${account.userId} failed: ${err.message}`);
    }
  }
}

// Best-effort remote delete when a schedule is deleted in the app. Never throws —
// the local delete must succeed even if Google is unreachable.
async function deleteRemoteForSchedule(schedule) {
  if (!schedule || !schedule.googleEventId) return;
  const account = await prisma.googleAccount.findUnique({ where: { userId: schedule.userId } });
  if (!account) return;
  try {
    await googleCalendar.deleteEvent(account, schedule.googleEventId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[google-sync] remote delete failed for ${schedule.googleEventId}: ${err.message}`);
  }
}

module.exports = { syncUser, syncAll, deleteRemoteForSchedule, fromGoogleEvent };
