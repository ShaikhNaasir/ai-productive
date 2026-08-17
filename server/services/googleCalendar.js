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

// Map a local Schedule row to a Google event body.
function toGoogleEvent(schedule) {
  const start = new Date(schedule.startTime).toISOString();
  const end = new Date(schedule.endTime || schedule.startTime).toISOString();
  return {
    summary: schedule.title,
    description: schedule.description || undefined,
    location: schedule.location || undefined,
    start: { dateTime: start },
    end: { dateTime: end },
  };
}

// Incremental event list. Uses the stored syncToken when present (only changed
// events since last sync); otherwise a forward-looking initial sync from now.
// A 410 (expired syncToken) is re-thrown with code 410 so the caller can reset.
// Note: a single page (up to 250 events) per call — enough for incremental deltas.
async function listEvents(account) {
  const calendar = getCalendarClient(account);
  const params = { calendarId: account.calendarId, singleEvents: true, maxResults: 250 };
  if (account.syncToken) params.syncToken = account.syncToken;
  else params.timeMin = new Date().toISOString();

  let res;
  try {
    res = await calendar.events.list(params);
  } catch (err) {
    const status = err.code || err.response?.status;
    if (status === 410) {
      const gone = new Error('Sync token expired');
      gone.code = 410;
      throw gone;
    }
    throw err;
  }
  return { events: res.data.items || [], nextSyncToken: res.data.nextSyncToken || null };
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
