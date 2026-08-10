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
