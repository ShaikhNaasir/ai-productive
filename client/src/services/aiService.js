import { api } from '@/lib/api';

export const aiService = {
  parseTask: (text) => api.post('/ai/parse-task', { text }).then((r) => r.data.task),
  createTaskFromText: (text) => api.post('/ai/tasks', { text }).then((r) => r.data.task),
  summarize: (payload) => api.post('/ai/summarize', payload).then((r) => r.data),
  prioritize: () => api.post('/ai/prioritize').then((r) => r.data.recommendations),
  chat: (message, history) => api.post('/ai/chat', { message, history }).then((r) => r.data.reply),
};
