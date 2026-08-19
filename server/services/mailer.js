'use strict';

const axios = require('axios');
const config = require('../config/env');

const RESEND_API = 'https://api.resend.com/emails';

// Email delivery via Resend (Roadmap E1). Optional: with no API key the mailer is
// dark — callers fall back to dev-mode (surface the link instead of sending). REST
// over axios, no new dependency (mirrors services/razorpay.js).
function isConfigured() {
  return Boolean(config.resend.apiKey);
}

async function send({ to, subject, html }) {
  if (!isConfigured()) {
    throw new Error('Email is not configured (RESEND_API_KEY missing)');
  }
  await axios.post(
    RESEND_API,
    { from: config.resend.from, to, subject, html },
    { headers: { Authorization: `Bearer ${config.resend.apiKey}` }, timeout: 15000 }
  );
}

function verificationHtml(name, link) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
      <h2>Verify your email</h2>
      <p>${hi}</p>
      <p>Confirm your email address to finish setting up your Productivity Assistant account.</p>
      <p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${link}</p>
      <p style="color:#666;font-size:13px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
    </div>`;
}

async function sendVerificationEmail(to, name, link) {
  await send({ to, subject: 'Verify your email', html: verificationHtml(name, link) });
}

module.exports = { isConfigured, send, sendVerificationEmail };
