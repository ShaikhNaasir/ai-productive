import { api } from '@/lib/api';

export const calendarService = {
  events: (params) => api.get('/calendar', { params }).then((r) => r.data.events),
};

export const scheduleService = {
  list: (params) => api.get('/schedules', { params }).then((r) => r.data.schedules),
  create: (payload) => api.post('/schedules', payload).then((r) => r.data.schedule),
  update: (id, payload) => api.patch(`/schedules/${id}`, payload).then((r) => r.data.schedule),
  remove: (id) => api.delete(`/schedules/${id}`),
};

export const reminderService = {
  list: (params) => api.get('/reminders', { params }).then((r) => r.data.reminders),
  create: (payload) => api.post('/reminders', payload).then((r) => r.data.reminder),
  update: (id, payload) => api.patch(`/reminders/${id}`, payload).then((r) => r.data.reminder),
  remove: (id) => api.delete(`/reminders/${id}`),
};
