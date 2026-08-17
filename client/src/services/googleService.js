import { api } from '@/lib/api';

export const googleService = {
  status: () => api.get('/google/status').then((r) => r.data),
  authUrl: () => api.get('/google/auth-url').then((r) => r.data.url),
  sync: () => api.post('/google/sync').then((r) => r.data),
  disconnect: () => api.delete('/google/disconnect'),
};
