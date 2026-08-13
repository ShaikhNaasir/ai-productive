import { api } from '@/lib/api';

export const habitService = {
  list: () => api.get('/habits').then((r) => r.data.habits),
  create: (payload) => api.post('/habits', payload).then((r) => r.data.habit),
  update: (id, payload) => api.patch(`/habits/${id}`, payload).then((r) => r.data.habit),
  remove: (id) => api.delete(`/habits/${id}`),
  checkIn: (id) => api.post(`/habits/${id}/check-in`).then((r) => r.data.habit),
  uncheck: (id) => api.delete(`/habits/${id}/check-in`).then((r) => r.data.habit),
};
