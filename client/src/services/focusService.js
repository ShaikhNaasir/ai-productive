import { api } from '@/lib/api';

export const focusService = {
  start: (taskId, startedAt, plannedSeconds) =>
    api
      .post('/focus/start', { taskId: taskId || null, startedAt, plannedSeconds })
      .then((r) => r.data.session),
  stop: (id, seconds) =>
    api
      .post(`/focus/${id}/stop`, seconds != null ? { seconds } : {})
      .then((r) => r.data.session),
  active: () => api.get('/focus/active').then((r) => r.data.session),
  stats: () => api.get('/focus/stats').then((r) => r.data),
};
