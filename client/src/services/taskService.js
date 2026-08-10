import { api } from '@/lib/api';

export const taskService = {
  list: (params) => api.get('/tasks', { params }).then((r) => r.data.tasks),
  get: (id) => api.get(`/tasks/${id}`).then((r) => r.data.task),
  create: (payload) => api.post('/tasks', payload).then((r) => r.data.task),
  update: (id, payload) => api.patch(`/tasks/${id}`, payload).then((r) => r.data.task),
  complete: (id) => api.post(`/tasks/${id}/complete`).then((r) => r.data.task),
  remove: (id) => api.delete(`/tasks/${id}`),
};
