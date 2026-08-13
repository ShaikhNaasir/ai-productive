'use strict';

// AI cost estimation (Roadmap C3). Per-model prices in USD per 1M tokens.
// Overridable via AI_PRICES env (JSON: { "model": { "in": n, "out": n } }).
// Defaults are Anthropic list prices as of 2026-08.
const DEFAULT_PRICES = {
  // Anthropic
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  // OpenAI
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  // Google Gemini
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
};

function loadPrices() {
  if (!process.env.AI_PRICES) return DEFAULT_PRICES;
  try {
    return { ...DEFAULT_PRICES, ...JSON.parse(process.env.AI_PRICES) };
  } catch {
    return DEFAULT_PRICES;
  }
}

const PRICES = loadPrices();
// Fallback rate for unknown models (Opus-tier) so cost is never silently zero.
const FALLBACK = { in: 5, out: 25 };

// Estimated USD cost for a call, rounded to 6 decimals.
function costUsd(model, inputTokens, outputTokens) {
  const rate = PRICES[model] || FALLBACK;
  const cost = ((inputTokens || 0) * rate.in + (outputTokens || 0) * rate.out) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

module.exports = { costUsd, PRICES };
