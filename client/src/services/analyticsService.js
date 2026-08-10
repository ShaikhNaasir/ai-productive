import { api } from '@/lib/api';

export const analyticsService = {
  summary: () => api.get('/analytics/summary').then((r) => r.data),
  trends: () => api.get('/analytics/trends').then((r) => r.data),
};
