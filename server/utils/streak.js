'use strict';

// Habit streak helpers (Roadmap B2). Pure functions — no DB, no side effects.
// A "day key" is the UTC calendar day (YYYY-MM-DD). Streaks are computed from the
// set of days a habit was checked in.

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function keyToUTC(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDaysKey(key, n) {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Given the days a habit was checked in, return { current, longest }.
// - current: length of the consecutive run ending today, or ending yesterday
//   when today has not been checked in yet (0 if neither).
// - longest: the longest consecutive run across all history.
function computeStreaks(dates, today = new Date()) {
  const keys = new Set((dates || []).map(dayKey));
  if (keys.size === 0) return { current: 0, longest: 0 };

  const todayKey = dayKey(today);
  const yesterdayKey = addDaysKey(todayKey, -1);

  // Current streak: start from today if present, else yesterday, then walk back.
  let current = 0;
  let cursor = keys.has(todayKey) ? todayKey : keys.has(yesterdayKey) ? yesterdayKey : null;
  while (cursor && keys.has(cursor)) {
    current += 1;
    cursor = addDaysKey(cursor, -1);
  }

  // Longest streak: sort day keys and measure the longest consecutive run.
  const sorted = [...keys].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    run = prev && addDaysKey(prev, 1) === key ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = key;
  }

  return { current, longest };
}

module.exports = { computeStreaks, dayKey };
