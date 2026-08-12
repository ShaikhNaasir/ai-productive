'use strict';

// Recurrence helpers for repeating tasks and reminders (Roadmap A2).
// Pure functions — no DB, no side effects. Computes the next fire/due instant
// from a base date and a recurrence rule. UTC-based so results are independent
// of the server's local timezone (dates are stored as UTC instants).

const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

function addDaysUTC(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Add whole months while clamping the day-of-month so that e.g. Jan 31 + 1 month
// lands on Feb 28/29 instead of overflowing into March. Time-of-day is preserved.
function addMonthsClampedUTC(date, n) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

// Returns the next occurrence Date after `date`, or null when the rule does not
// repeat (NONE / unknown / missing base date).
function nextOccurrence(date, recurrence) {
  if (!date || !recurrence || recurrence === 'NONE') return null;
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  switch (recurrence) {
    case 'DAILY':
      return addDaysUTC(base, 1);
    case 'WEEKLY':
      return addDaysUTC(base, 7);
    case 'MONTHLY':
      return addMonthsClampedUTC(base, 1);
    default:
      return null;
  }
}

module.exports = { RECURRENCES, nextOccurrence };
