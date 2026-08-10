import axios from 'axios';

// Render's blueprint injects a bare hostname for VITE_API_URL; add https:// if missing.
const raw = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const baseURL = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;

export const api = axios.create({
  baseURL: `${baseURL}/api`,
});

const TOKEN_KEY = 'pa_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Attach bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the token so the app redirects to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
    }
    return Promise.reject(error);
  }
);

export function apiError(error, fallback = 'Something went wrong') {
  return error?.response?.data?.error?.message || error?.message || fallback;
}
