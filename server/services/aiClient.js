'use strict';

const axios = require('axios');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const prisma = require('../models/prisma');
const { getUserId } = require('../middleware/requestContext');
const { costUsd } = require('../utils/aiCost');

const client = axios.create({
  baseURL: config.aiService.url,
  timeout: 30000,
  headers: { 'X-Internal-Key': config.aiService.internalKey },
});

// Best-effort: record token usage + estimated cost for the current user from the
// AI service's response headers. Never throws — monitoring must not break a call.
function recordUsage(path, headers) {
  try {
    const userId = getUserId();
    if (!userId || !headers) return;
    const inputTokens = Number(headers['x-ai-input-tokens']);
    const outputTokens = Number(headers['x-ai-output-tokens']);
    const model = headers['x-ai-model'];
    if (!model || Number.isNaN(inputTokens) || Number.isNaN(outputTokens)) return;
    prisma.aiUsage
      .create({
        data: {
          userId,
          endpoint: path.replace(/^\//, ''),
          model,
          inputTokens,
          outputTokens,
          costUsd: costUsd(model, inputTokens, outputTokens),
        },
      })
      .catch(() => {});
  } catch {
    // Ignore — usage tracking is best-effort.
  }
}

// Translates transport/AI errors into a clean 503 so the app degrades gracefully.
async function call(path, body) {
  try {
    const res = await client.post(path, body);
    recordUsage(path, res.headers);
    return res.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const message = err.response.data?.detail || 'AI service error';
      // 502/503 from the AI service (LLM unavailable / bad output) bubble up as 503.
      throw new ApiError(status === 401 ? 500 : 503, `AI unavailable: ${message}`);
    }
    // Connection refused / timeout — service down.
    throw new ApiError(503, 'AI service is unavailable. Please try again later.');
  }
}

const aiClient = {
  summarize: (text) => call('/summarize', { text }),
  parseTask: (text, now) => call('/parse-task', { text, now }),
  breakdown: (title, description, now) => call('/breakdown', { title, description, now }),
  planDay: (payload) => call('/plan-day', payload),
  prioritize: (tasks, now) => call('/prioritize', { tasks, now }),
  chat: (message, context, history) => call('/chat', { message, context, history }),
  embed: (input) => call('/embed', { input }),
};

module.exports = aiClient;
