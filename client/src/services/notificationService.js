import { api } from '@/lib/api';

// Persisted notifications (Roadmap G1). The catch-up list is fetched on load so
// reminders that fired while the user was offline still surface in the bell.
export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
  markAllRead: () => api.post('/notifications/read').then((r) => r.data),
};
