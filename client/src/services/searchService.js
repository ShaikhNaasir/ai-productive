import { api } from '@/lib/api';

export const searchService = {
  search: (q) => api.get('/search', { params: { q } }).then((r) => r.data),
};
