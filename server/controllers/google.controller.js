'use strict';

const prisma = require('../models/prisma');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { signToken, verifyToken } = require('../utils/jwt');
const googleCalendar = require('../services/googleCalendar');

function ensureConfigured() {
  if (!googleCalendar.isConfigured()) {
    throw new ApiError(503, 'Google Calendar integration is not configured');
  }
}

// Returns the Google consent URL. `state` is a short signed token binding the flow
// to the authenticated user so the (session-less) callback can attribute the tokens.
async function authUrl(req, res) {
  ensureConfigured();
  const state = signToken({ sub: req.user.id, purpose: 'google-oauth' });
  res.json({ url: googleCalendar.getAuthUrl(state) });
}

// OAuth redirect target. No bearer token — the user is identified from `state`.
// Exchanges the code, stores the refresh token, and redirects back to the client.
async function callback(req, res) {
  ensureConfigured();
  const { code, state } = req.query;
  if (!code || !state) throw ApiError.badRequest('Missing code or state');

  let userId;
  try {
    const payload = verifyToken(state);
    if (payload.purpose !== 'google-oauth') throw new Error('bad purpose');
    userId = payload.sub;
  } catch {
    throw ApiError.badRequest('Invalid or expired OAuth state');
  }

  const tokens = await googleCalendar.exchangeCode(code);
  if (!tokens.refresh_token) {
    // Without a refresh token we can't sync long-term. prompt=consent should force
    // one, but guard anyway (e.g. a prior grant that Google won't re-issue).
    throw ApiError.badRequest('Google did not return a refresh token; revoke access and retry');
  }

  const data = {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token || null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
  const existing = await prisma.googleAccount.findUnique({ where: { userId } });
  if (existing) {
    await prisma.googleAccount.update({ where: { id: existing.id }, data });
  } else {
    await prisma.googleAccount.create({ data: { userId, ...data } });
  }

  res.redirect(`${config.clientOrigin}/settings?google=connected`);
}

async function status(req, res) {
  const account = await prisma.googleAccount.findUnique({ where: { userId: req.user.id } });
  res.json({
    configured: googleCalendar.isConfigured(),
    connected: Boolean(account),
    calendarId: account ? account.calendarId : null,
  });
}

async function disconnect(req, res) {
  const account = await prisma.googleAccount.findUnique({ where: { userId: req.user.id } });
  if (account) {
    await prisma.googleAccount.delete({ where: { id: account.id } });
  }
  res.status(204).send();
}

module.exports = { authUrl, callback, status, disconnect };
