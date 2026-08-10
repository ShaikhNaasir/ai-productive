import { api } from '@/lib/api';

export const noteService = {
  list: (params) => api.get('/notes', { params }).then((r) => r.data.notes),
  get: (id) => api.get(`/notes/${id}`).then((r) => r.data.note),
  create: (payload) => api.post('/notes', payload).then((r) => r.data.note),
  update: (id, payload) => api.patch(`/notes/${id}`, payload).then((r) => r.data.note),
  togglePin: (id) => api.post(`/notes/${id}/pin`).then((r) => r.data.note),
  remove: (id) => api.delete(`/notes/${id}`),
};
