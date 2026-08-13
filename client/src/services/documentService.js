import { api } from '@/lib/api';

export const documentService = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};
