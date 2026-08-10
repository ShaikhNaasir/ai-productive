import { api } from '@/lib/api';

export const authService = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  updateProfile: (payload) => api.patch('/auth/profile', payload).then((r) => r.data.user),
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => r.data),
};
