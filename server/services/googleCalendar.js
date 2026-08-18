'use strict';

const { google } = require('googleapis');
const config = require('../config/env');

// calendar.events grants create/read/update/delete on the user's events, which is
// all two-way schedule sync needs. Kept narrow — no full-calendar management scope.
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

// The integration is optional: without OAuth client credentials every endpoint
// degrades to a clean 503 instead of crashing (invariant: app works if Google is off).
function isConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret && config.google.redirectUri);
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

// Consent URL. `state` carries a signed token identifying the user so the callback
// can attribute the returned tokens without a session. offline + prompt=consent so
// Google always returns a refresh token (needed for long-term background sync).
function getAuthUrl(state) {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

// Exchange an authorization code for tokens ({ access_token, refresh_token, expiry_date }).
async function exchangeCode(code) {
  const { tokens } = await getOAuthClient().getToken(code);
  return tokens;
}

// Authenticated Calendar v3 client for a stored account. googleapis transparently
// mints a fresh access token from the refresh token when the current one expires.
function getCalendarClient(account) {
  const auth = getOAuthClient();
  auth.setCredentials({
    refresh_token: account.refreshToken,
    access_token: account.accessToken || undefined,
    expiry_date: account.expiryDate ? new Date(account.expiryDate).getTime() : undefined,
  });
  return google.calendar({ version: 'v3', auth });
}

// Map a local Schedule row to a Google event body. An all-day schedule must go back
// as `date`, not `dateTime` — pushing it as a timestamp would rewrite the user's
// real all-day event into a zero-length midnight-UTC one.
function toGoogleEvent(schedule) {
  const startDate = new Date(schedule.startTime);
  const endDate = new Date(schedule.endTime || schedule.startTime);
  const body = {
    summary: schedule.title,
    description: schedule.description || undefined,
    location: schedule.location || undefined,
  };

  if (schedule.allDay) {
    const day = (d) => d.toISOString().slice(0, 10);
    // Google treats `end.date` as exclusive, so a single-day event ends the next day.
    const endDay = endDate.getTime() > startDate.getTime() ? endDate : addDaysUTC(startDate, 1);
    body.start = { date: day(startDate) };
    body.end = { date: day(endDay) };
  } else {
    body.start = { dateTime: startDate.toISOString() };
    body.end = { dateTime: endDate.toISOString() };
  }
  return body;
}

function addDaysUTC(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Incremental event list. Uses the stored syncToken when present (only changed
// events since last sync); otherwise a forward-looking initial sync from now.
// A 410 (expired syncToken) is re-thrown with code 410 so the caller can reset.
//
// Google returns `nextSyncToken` ONLY on the final page of a result set; a
// paginated response carries `nextPageToken` instead. Reading just the first page
// would therefore leave the caller with no new sync token — it would keep the stale
// one and replay the same page forever, so every event past the first one would
// never sync. Page through to the end to get the token.
const PAGE_SIZE = 250;
const MAX_PAGES = 20; // bounded so one tick can't spin on a pathological calendar

async function listEvents(account) {
  const calendar = getCalendarClient(account);
  const base = { calendarId: account.calendarId, singleEvents: true, maxResults: PAGE_SIZE };
  if (account.syncToken) base.syncToken = account.syncToken;
  else base.timeMin = new Date().toISOString();

  const events = [];
  let pageToken = null;
  let nextSyncToken = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let res;
    try {
      // A pageToken already encodes the sync/time context, so it replaces those params.
      res = await calendar.events.list(pageToken ? { ...base, pageToken } : base);
    } catch (err) {
      const status = err.code || err.response?.status;
      if (status === 410) {
        const gone = new Error('Sync token expired');
        gone.code = 410;
        throw gone;
      }
      throw err;
    }
    events.push(...(res.data.items || []));
    nextSyncToken = res.data.nextSyncToken || null;
    pageToken = res.data.nextPageToken || null;
    if (!pageToken) break;
  }

  if (pageToken) {
    // eslint-disable-next-line no-console
    console.warn(
      `[google-sync] stopped after ${MAX_PAGES} pages for user ${account.userId}; ` +
        'remaining events sync on the next run'
    );
  }
  return { events, nextSyncToken };
}

async function insertEvent(account, schedule) {
  const calendar = getCalendarClient(account);
  const res = await calendar.events.insert({
    calendarId: account.calendarId,
    requestBody: toGoogleEvent(schedule),
  });
  return res.data;
}

async function updateEvent(account, eventId, schedule) {
  const calendar = getCalendarClient(account);
  const res = await calendar.events.update({
    calendarId: account.calendarId,
    eventId,
    requestBody: toGoogleEvent(schedule),
  });
  return res.data;
}

// Delete a remote event. A 404/410 (already gone) is treated as success.
async function deleteEvent(account, eventId) {
  const calendar = getCalendarClient(account);
  try {
    await calendar.events.delete({ calendarId: account.calendarId, eventId });
  } catch (err) {
    const status = err.code || err.response?.status;
    if (status === 404 || status === 410) return;
    throw err;
  }
}

module.exports = {
  isConfigured,
  getOAuthClient,
  getAuthUrl,
  exchangeCode,
  getCalendarClient,
  toGoogleEvent,
  listEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
  SCOPES,
};
