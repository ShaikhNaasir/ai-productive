import { api } from '@/lib/api';

// Admin panel API (Roadmap D). All endpoints require an ADMIN and return metadata
// + aggregates only — never other users' private content.
export const adminService = {
  metrics: () => api.get('/admin/metrics').then((r) => r.data),
  users: (params) => api.get('/admin/users', { params }).then((r) => r.data),
  user: (id) => api.get(`/admin/users/${id}`).then((r) => r.data),
  disable: (id) => api.post(`/admin/users/${id}/disable`).then((r) => r.data.user),
  enable: (id) => api.post(`/admin/users/${id}/enable`).then((r) => r.data.user),
  forceLogout: (id) => api.post(`/admin/users/${id}/force-logout`).then((r) => r.data.user),
  setRole: (id, role) => api.post(`/admin/users/${id}/role`, { role }).then((r) => r.data.user),
  setPlan: (id, plan) => api.post(`/admin/users/${id}/plan`, { plan }).then((r) => r.data.user),
  remove: (id, hard = false) => api.delete(`/admin/users/${id}`, { data: { hard } }).then((r) => r.data),
  audit: (params) => api.get('/admin/audit', { params }).then((r) => r.data),
};
