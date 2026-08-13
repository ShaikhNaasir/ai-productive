import { api } from '@/lib/api';

export const aiService = {
  parseTask: (text) => api.post('/ai/parse-task', { text }).then((r) => r.data.task),
  createTaskFromText: (text) => api.post('/ai/tasks', { text }).then((r) => r.data.task),
  breakdown: (taskId) => api.post(`/ai/tasks/${taskId}/breakdown`).then((r) => r.data.subtasks),
  summarize: (payload) => api.post('/ai/summarize', payload).then((r) => r.data),
  planDay: () => api.post('/ai/plan-day').then((r) => r.data.blocks),
  acceptPlan: (blocks) => api.post('/ai/plan-day/accept', { blocks }).then((r) => r.data.schedules),
  prioritize: () => api.post('/ai/prioritize').then((r) => r.data.recommendations),
  chat: (message, history) => api.post('/ai/chat', { message, history }).then((r) => r.data.reply),
  reindex: () => api.post('/ai/reindex').then((r) => r.data),
};
