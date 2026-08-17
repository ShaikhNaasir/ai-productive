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

module.exports = { isConfigured, getOAuthClient, getAuthUrl, exchangeCode, SCOPES };
