import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(value, opts = {}) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    ...(opts.withTime ? { timeStyle: 'short' } : {}),
  });
}

// Human-readable duration from a count of seconds, e.g. 3720 -> "1h 2m".
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

// mm:ss clock for a countdown, e.g. 65 -> "01:05".
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}
