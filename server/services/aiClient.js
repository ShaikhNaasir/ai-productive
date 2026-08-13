'use strict';

const axios = require('axios');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

const client = axios.create({
  baseURL: config.aiService.url,
  timeout: 30000,
  headers: { 'X-Internal-Key': config.aiService.internalKey },
});

// Translates transport/AI errors into a clean 503 so the app degrades gracefully.
async function call(path, body) {
  try {
    const res = await client.post(path, body);
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
