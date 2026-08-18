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

// Broadcast so AuthContext can drop the user. Clearing the token alone leaves the
// app rendering the authenticated shell — with every request failing — until a
// manual reload, because ProtectedRoute reads `user`, not the token.
export const SESSION_EXPIRED_EVENT = 'pa:session-expired';

// On 401, clear the token and tell the app the session is gone.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(error, fallback = 'Something went wrong') {
  // A 503 usually means a Render free-tier service is cold-starting; the request
  // typically succeeds a few seconds later, so show a friendly retry hint.
  if (error?.response?.status === 503) {
    return 'The service is waking up — please try again in a few seconds.';
  }
  const data = error?.response?.data?.error;
  // Surface the first field-level validation message instead of a generic
  // "Validation failed", so the user sees exactly what went wrong.
  if (data?.details?.length) {
    return data.details[0].message || data.message || fallback;
  }
  return data?.message || error?.message || fallback;
}
