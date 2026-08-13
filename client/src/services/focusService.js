import { api } from '@/lib/api';

export const focusService = {
  start: (taskId, startedAt) =>
    api.post('/focus/start', { taskId: taskId || null, startedAt }).then((r) => r.data.session),
  stop: (id) => api.post(`/focus/${id}/stop`).then((r) => r.data.session),
  stats: () => api.get('/focus/stats').then((r) => r.data),
};
