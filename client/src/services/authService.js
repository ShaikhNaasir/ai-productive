import { api, setToken } from '@/lib/api';

export const authService = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  updateProfile: (payload) => api.patch('/auth/profile', payload).then((r) => r.data.user),
  changePassword: (payload) =>
    api.post('/auth/change-password', payload).then((r) => {
      // The server rotates the token on password change; keep this session signed in.
      if (r.data && r.data.token) setToken(r.data.token);
      return r.data;
    }),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }).then((r) => r.data),
  resendVerification: () => api.post('/auth/resend-verification').then((r) => r.data),
};
