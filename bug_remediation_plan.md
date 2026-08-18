# Bug Remediation Plan

**Generated:** 2026-08-17 · **Branch:** `claude/beautiful-einstein-r9hm2f` · **Base commit:** `fe64219`

Automated audit of the AI-Powered Personal Productivity Assistant repository.

> ## ✅ ALL 24 ITEMS IMPLEMENTED — 2026-08-18
>
> Every bug below has been fixed, tested, and committed across seven slices
> (`173f14f`, `3cc83ac`, `07971fe`, `c867fa8`, `ec7ca68`, `6e67cca`, `4a28cbd`).
> The remediation text in each section is preserved as written; where the delivered
> fix went beyond or differed from the plan, a **Delivered** note records it.
>
> | Check | Before | After |
> | --- | --- | --- |
> | server Jest | 148 passing | **187 passing** (23 suites) |
> | client Vitest | 34 passing | **40 passing** (17 files) |
> | ai-service pytest | not runnable (no venv) | **35 passing** |
> | server / client lint | clean | clean |
> | server `npm audit --omit=dev` | 0 vulns | 0 vulns |
> | client `npm audit` | 1 critical, 1 high, 3 moderate | **0 vulnerabilities** |
> | client production build | OK | OK (Vite 8, chunking intact) |
> | Prisma schema | valid | valid (3 new indexes, `Schedule.allDay`) |
>
> **Deploy note:** the schema gained `Schedule.allDay` and three composite indexes.
> Render applies these via `prisma db push`, per the existing convention in
> `ROADMAP.md` — no migration files were added.

## Baseline health (at audit time)

Everything in the repo was green when the audit ran. **None of the issues below was a
test failure** — they were latent defects the existing suites did not cover.

| Check | Result |
| --- | --- |
| `server && npm test` (Jest) | ✅ 21 suites, 148 tests passing |
| `client && npm test` (Vitest) | ✅ 16 files, 34 tests passing |
| `server && npm run lint` | ✅ clean |
| `client && npm run lint` | ✅ clean |
| `server && npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `client && npm audit` | ⚠️ 5 (1 critical, 1 high, 3 moderate) — all dev-only, see BUG-12 |

`ai-service` was not executed at audit time: no `.venv` existed in the container and
`requirements.txt` was not installed, so its findings were from code reading only.
**The environment has since been created and its suite runs: 35 tests passing**,
including two new cases covering BUG-22.

## Summary

All items are ✅ **Fixed**. "Commit" is the slice each landed in.

| ID | Severity | Area | Issue | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| [BUG-01](#bug-01) | 🔴 High | server/tasks | `parentId` accepted on update with no ownership check → cross-user cascade delete | ✅ | `173f14f` |
| [BUG-02](#bug-02) | 🔴 High | server/realtime | Socket.IO ignores `tokenVersion`; revoked JWTs keep streaming | ✅ | `173f14f` |
| [BUG-03](#bug-03) | 🔴 High | server/google | Calendar sync silently drops everything past the first 250 events | ✅ | `3cc83ac` |
| [BUG-04](#bug-04) | 🟠 Medium | server/google | All-day Google events rewritten as midnight-UTC timed events | ✅ | `3cc83ac` |
| [BUG-05](#bug-05) | 🟠 Medium | server/google | Every pulled event is echoed back to Google on the next sync | ✅ | `3cc83ac` |
| [BUG-06](#bug-06) | 🟠 Medium | server/scheduler | Overdue recurring reminder fires a burst of duplicates | ✅ | `07971fe` |
| [BUG-07](#bug-07) | 🟠 Medium | server/scheduler | `setInterval` over async work → overlapping ticks | ✅ | `07971fe` |
| [BUG-08](#bug-08) | 🟠 Medium | server/documents | Untruncated document text sent to the LLM | ✅ | `c867fa8` |
| [BUG-09](#bug-09) | 🟠 Medium | client/focus | Pomodoro counts interval ticks, not wall clock | ✅ | `ec7ca68` |
| [BUG-10](#bug-10) | 🟠 Medium | client/auth | 401 clears the token but not the auth state | ✅ | `ec7ca68` |
| [BUG-11](#bug-11) | 🟠 Medium | server/perf | Unbounded full-table reads in analytics / usage / focus stats | ✅ | `c867fa8` |
| [BUG-12](#bug-12) | 🟠 Medium | client/deps | `vitest`/`vite` advisories (dev-only) | ✅ | `4a28cbd` |
| [BUG-13](#bug-13) | 🟡 Low | server/search | Keyword search starves tasks | ✅ | `6e67cca` |
| [BUG-14](#bug-14) | 🟡 Low | server/search | Semantic relevance score can go negative | ✅ | `6e67cca` |
| [BUG-15](#bug-15) | 🟡 Low | server/habits | Check-in race returns 500 instead of being idempotent | ✅ | `6e67cca` |
| [BUG-16](#bug-16) | 🟡 Low | server/reminders | `taskId` never ownership-checked | ✅ | `173f14f` |
| [BUG-17](#bug-17) | 🟡 Low | server/auth | Login timing side channel enables user enumeration | ✅ | `173f14f` |
| [BUG-18](#bug-18) | 🟡 Low | server/focus | Concurrent open sessions accumulate as orphans | ✅ | `07971fe` |
| [BUG-19](#bug-19) | 🟡 Low | client/pwa | Static SW cache name never evicts old assets | ✅ | `ec7ca68` |
| [BUG-20](#bug-20) | 🟡 Low | server/ops | No graceful shutdown on SIGTERM | ✅ | `07971fe` |
| [BUG-21](#bug-21) | 🟡 Low | server/db | Missing composite indexes for the hot scheduler/usage queries | ✅ | `c867fa8` |
| [BUG-22](#bug-22) | 🟡 Low | ai-service | Non-ASCII internal key header raises 500 instead of 401 | ✅ | `6e67cca` |
| [BUG-23](#bug-23) | 🟡 Low | client/tests | `act()` warnings from `PomodoroTimer` | ✅ | `ec7ca68` |
| [BUG-24](#bug-24) | 🟡 Low | server/ai | Worst-case 121.5 s AI request with no response deadline | ✅ | `ec7ca68`¹ |

¹ BUG-24 landed in `c867fa8` alongside the other cost/performance work.

### Where the delivered fix differed from the plan

Five items needed more than the plan specified. Each is detailed in its section:

- **BUG-01** — the plan's guard covered re-parenting *under* a bad parent. It missed
  the mirror case: re-parenting a task that already *has* subtasks, which also
  produces two-level nesting. Added a child-count check.
- **BUG-05** — the plan put the watermark immediately after the pull. That still
  leaves step 2's `googleEventId` writes past the watermark, so freshly-pushed events
  were re-pushed once. Moved it after the last local write of the run instead.
- **BUG-11** — narrowing the reads changes `total` / `totalCostUsd` from all-time to
  windowed. Rather than leave that ambiguous, the endpoints now report `windowDays`
  and the Analytics card labels the window in the UI.
- **BUG-12** — Vite 8 bundles with rolldown, which rejects the object form of
  `manualChunks`, and its native config loader drops the CJS globals. Both needed
  migrating beyond the dependency bump.
- **BUG-22** — the plan's test sent a non-ASCII header as a `str`; httpx refuses to
  encode that client-side. The test sends raw bytes, matching how Starlette actually
  receives and latin-1 decodes a real request.

### Test-helper work this required

`server/tests/helpers/fakePrisma.js` was missing query surface the fixes depend on.
Added, so the new behaviour is genuinely exercised rather than silently ignored:

- **UUID-shaped ids** (was a bare counter) — the `.uuid()` body validators now behave
  in tests as they do against Prisma's real `@default(uuid())`.
- **`select`** — column projections are verified; a controller reading an unselected
  field now fails in tests the way it would in production.
- **`take`**, **`upsert`** (with compound-unique `where`), **`updateMany`**.

---

## 🔴 High

### BUG-01

#### `parentId` is accepted on task update with no ownership or depth check

**Files:** `server/controllers/task.controller.js:98-118` · `server/validators/task.schema.js:19-25` · `server/prisma/schema.prisma:84`

**Root cause.** `updateTaskSchema` is `createTaskSchema.partial()`, so it inherits
`parentId`. `create()` guards it via `assertValidParent()`; `update()` does not — it
passes the parsed body straight to Prisma:

```js
// task.controller.js:98-118  (update)
const data = updateTaskSchema.parse(req.body);          // data may contain parentId
const prior = await getAccessibleTask(req.user.id, req.params.id, { edit: true });
...
const task = await prisma.task.update({ where: { id: req.params.id }, data });
```

Meanwhile the self-relation cascades on delete:

```prisma
// schema.prisma:84
parent Task? @relation("Subtasks", fields: [parentId], references: [id], onDelete: Cascade)
```

**Impact.**

1. **Privilege escalation → cross-user deletion.** Deleting a task is owner-only by
   design (`remove()` calls `getOwnedTask`). But a user holding only an **EDIT share**
   on someone else's task `T` can `PATCH /api/tasks/T { "parentId": "<their own task X>" }`,
   then delete `X`. The DB cascade destroys `T` — a task they were never authorized to
   delete. This defeats the owner-only delete rule in `CLAUDE.md`'s invariants.
2. **Unbounded nesting.** `assertValidParent` and `breakdownTask` both assume subtasks
   are one level deep; update can build arbitrary depth, or point a task at itself.
3. **Silent disappearance.** `list()` filters `parentId: null`, so re-parenting a task
   under any arbitrary UUID removes it from the owner's own list with no error.

**Remediation.** Reuse the existing guard, and restrict re-parenting to the task owner
(an EDIT sharee has no business restructuring someone else's tree).

```js
// server/controllers/task.controller.js — in update(), after parsing
async function update(req, res) {
  const data = updateTaskSchema.parse(req.body);
  const prior = await getAccessibleTask(req.user.id, req.params.id, { edit: true });

  // Re-parenting is owner-only and must stay one level deep within the same user.
  if ('parentId' in data) {
    if (prior.userId !== req.user.id) {
      throw ApiError.forbidden('Only the owner can move this task');
    }
    if (data.parentId === prior.id) {
      throw ApiError.badRequest('A task cannot be its own parent');
    }
    await assertValidParent(req.user.id, data.parentId);  // already defined at :45
  }
  ...
}
```

`assertValidParent` already calls `getOwnedTask` (404s on another user's task) and
rejects a parent that is itself a subtask, so this one guard closes all three holes.

> **Delivered** (`173f14f`). Implemented as written, plus one case the plan missed:
> the guard above rejects nesting *under* a subtask, but not nesting a task that
> already *has* subtasks — equally a route to two-level depth. Added:
>
> ```js
> if (data.parentId) {
>   const childCount = await prisma.task.count({ where: { parentId: prior.id } });
>   if (childCount > 0) {
>     throw ApiError.badRequest('Cannot nest a task that has subtasks of its own');
>   }
> }
> ```
>
> Six tests added across `task.test.js` and `share.test.js`, including the full
> escalation path: an EDIT sharee attempting the re-parent gets 403 and the owner's
> task is verified still top-level.

**Tests to add** (`server/tests/task.test.js`):
- update with a `parentId` owned by another user → 404
- EDIT sharee sending `parentId` → 403
- `parentId` equal to the task's own id → 400
- `parentId` pointing at an existing subtask → 400 (`Cannot nest a subtask under a subtask`)

**Difficulty:** Easy (~30 min incl. tests)

---

### BUG-02

#### Socket.IO handshake never checks `tokenVersion` — revoked JWTs keep streaming

**File:** `server/realtime.js:17-27`

**Root cause.** Commit `fe64219` added JWT revocation: `requireAuth` compares the
token's `ver` claim against `user.tokenVersion` on every HTTP request. The realtime
handshake was never updated and only verifies the signature:

```js
// realtime.js:17-27
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = verifyToken(token);
    socket.userId = payload.sub;      // no tokenVersion check
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});
```

**Impact.** After logout or a password change, a stolen token can still open a
websocket and receive that user's reminder payloads (message text, `remindAt`,
`taskId`) for the full 7-day JWT lifetime. Already-open sockets are never
disconnected either, so revocation has no effect on the realtime channel at all.

**Remediation.** Mirror `requireAuth`, and disconnect live sockets on revocation.

```js
// server/realtime.js
const prisma = require('./models/prisma');

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new Error('Invalid token'));
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      return next(new Error('Session expired'));
    }
    socket.userId = user.id;
    return next();
  } catch (err) {
    return next(err);
  }
});

// Export so auth.controller can evict live sockets when tokenVersion is bumped.
function disconnectUser(userId) {
  if (io) io.in(userId).disconnectSockets(true);
}
```

Then call `disconnectUser(user.id)` from `logout()` and `changePassword()` in
`server/controllers/auth.controller.js` (best-effort, wrapped in try/catch).

**Tests to add** (`server/tests/auth.test.js` or a new `realtime.test.js`): handshake
middleware rejects a token whose `ver` no longer matches.

**Difficulty:** Easy (~45 min)

---

### BUG-03

#### Google Calendar sync silently drops every event past the first page

**Files:** `server/services/googleCalendar.js:71-90` · `server/services/googleSync.js:110-113`

**Root cause.** `listEvents` requests one page and ignores `nextPageToken`:

```js
// googleCalendar.js:71-90
const params = { calendarId: account.calendarId, singleEvents: true, maxResults: 250 };
if (account.syncToken) params.syncToken = account.syncToken;
else params.timeMin = new Date().toISOString();
const res = await calendar.events.list(params);
return { events: res.data.items || [], nextSyncToken: res.data.nextSyncToken || null };
```

The Google Calendar API returns `nextSyncToken` **only on the final page** of a
result set. When results are paginated it returns `nextPageToken` and omits
`nextSyncToken`. The caller then falls back to the old token:

```js
// googleSync.js:110-113
data: { syncToken: nextSyncToken || account.syncToken, lastSyncedAt: syncStart },
```

**Impact.** For any account with more than 250 events in the window:

- **Initial sync never completes.** `account.syncToken` starts `null`, so
  `nextSyncToken` is `null`, so it stays `null` — forever. Every 5-minute tick redoes
  the same full forward listing of the first 250 upcoming events. Events 251+ are
  **never** synced into the app.
- **Incremental sync stalls the same way** whenever a delta exceeds one page: the
  stale token is retained and the same page is replayed indefinitely.

This is silent — no error, no log, no failing test. The user just sees a partial calendar.

**Remediation.** Page through until Google hands back a sync token.

```js
// server/services/googleCalendar.js
async function listEvents(account) {
  const calendar = getCalendarClient(account);
  const base = { calendarId: account.calendarId, singleEvents: true, maxResults: 250 };
  if (account.syncToken) base.syncToken = account.syncToken;
  else base.timeMin = new Date().toISOString();

  const events = [];
  let pageToken;
  let nextSyncToken = null;
  // Bounded so a pathological calendar can't spin forever in one tick.
  for (let page = 0; page < 20; page += 1) {
    let res;
    try {
      res = await calendar.events.list({ ...base, ...(pageToken ? { pageToken } : {}) });
    } catch (err) {
      const status = err.code || err.response?.status;
      if (status === 410) {
        const gone = new Error('Sync token expired');
        gone.code = 410;
        throw gone;
      }
      throw err;
    }
    events.push(...(res.data.items || []));
    nextSyncToken = res.data.nextSyncToken || null;
    pageToken = res.data.nextPageToken || null;
    if (!pageToken) break;
  }
  return { events, nextSyncToken };
}
```

> Note: `pageToken` and `syncToken` are mutually exclusive per-request in the Google
> API only in the sense that the page token already encodes the sync context — passing
> both as above is the documented pagination pattern and is what `googleapis` expects.

**Tests to add** (`server/tests/googleSync.test.js`): mock `events.list` to return a
`nextPageToken` on call 1 and a `nextSyncToken` on call 2; assert both pages' events
are processed and the new sync token is persisted.

**Difficulty:** Medium (~1.5 h incl. tests)

---

## 🟠 Medium

### BUG-04

#### All-day Google events are rewritten as midnight-UTC timed events

**Files:** `server/services/googleCalendar.js:55-65` · `server/services/googleSync.js:8-18, 99-107`

**Root cause.** The pull direction handles all-day events (`start.date`), but the push
direction has no matching branch — it always emits `dateTime`:

```js
// googleSync.js:9  (pull — handles both shapes)
const start = ev.start && (ev.start.dateTime || ev.start.date);

// googleCalendar.js:55-65  (push — always timed)
return {
  summary: schedule.title,
  start: { dateTime: new Date(schedule.startTime).toISOString() },
  end:   { dateTime: new Date(schedule.endTime || schedule.startTime).toISOString() },
};
```

**Impact.** A pulled all-day event becomes `2026-08-17T00:00:00Z` locally. When it is
pushed back (which BUG-05 makes routine), the user's real Google Calendar entry is
converted from an all-day event into a zero-length midnight event — visible corruption
of data the app doesn't own. Worse for users east of UTC, where midnight UTC lands on
the previous day.

**Remediation.** Persist all-day-ness and round-trip it. Add a boolean to the model:

```prisma
// server/prisma/schema.prisma — model Schedule
allDay Boolean @default(false)
```

```js
// server/services/googleSync.js — fromGoogleEvent
const allDay = Boolean(ev.start && !ev.start.dateTime && ev.start.date);
return { title: ..., allDay, startTime: ..., endTime: ... };
```

```js
// server/services/googleCalendar.js — toGoogleEvent
function toGoogleEvent(schedule) {
  const startDate = new Date(schedule.startTime);
  const endDate = new Date(schedule.endTime || schedule.startTime);
  const body = { summary: schedule.title, description: ..., location: ... };
  if (schedule.allDay) {
    const day = (d) => d.toISOString().slice(0, 10);
    body.start = { date: day(startDate) };
    body.end = { date: day(endDate) };   // Google treats `end.date` as exclusive
  } else {
    body.start = { dateTime: startDate.toISOString() };
    body.end = { dateTime: endDate.toISOString() };
  }
  return body;
}
```

Fixing BUG-05 first sharply reduces the blast radius of this one.

**Tests to add:** `toGoogleEvent` emits `date` for `allDay: true` and `dateTime`
otherwise; `fromGoogleEvent` sets `allDay` from a `start.date` payload.

**Difficulty:** Medium (~1 h; touches the Prisma schema, applied via `db push`)

---

### BUG-05

#### Every pulled event is echoed straight back to Google on the next sync

**File:** `server/services/googleSync.js:71-113`

**Root cause.** `syncStart` is captured **before** the pull, but the pull's own writes
bump each row's `@updatedAt` to a later instant:

```js
// googleSync.js:71
const syncStart = new Date();          // T0
...
await pull(account);                   // prisma.schedule.update(...) → updatedAt = T1 > T0
...
data: { syncToken: ..., lastSyncedAt: syncStart },   // stores T0
```

On the next run, the "locally changed" query (`updatedAt > lastSyncedAt`) matches every
row the previous pull wrote:

```js
// googleSync.js:75-83
const locallyChanged = await prisma.schedule.findMany({
  where: { userId, googleEventId: { not: null }, updatedAt: { gt: account.lastSyncedAt } },
});
```

Those rows aren't in this run's `pulledIds` (nothing changed remotely), so step 3 pushes
them back.

**Impact.** One redundant `events.update` per pulled event on the sync immediately after
each pull — wasted Google API quota, and a genuine correctness hole: a remote edit made
in the window between the two runs is overwritten by the app's stale copy, inverting the
documented "Google wins" policy. It is also the mechanism that turns BUG-04 from
theoretical into routine.

**Remediation.** Stamp `lastSyncedAt` after the pull completes, so the pull's own writes
fall before the watermark.

```js
// server/services/googleSync.js — syncUser
const { nextSyncToken, pulledIds } = await pull(account);
const pullCompletedAt = new Date();     // everything the pull wrote is <= this
...
await prisma.googleAccount.update({
  where: { id: account.id },
  data: { syncToken: nextSyncToken || account.syncToken, lastSyncedAt: pullCompletedAt },
});
```

`locallyChanged` is still snapshotted *before* the pull against the previous watermark,
so real local edits made before this run are unaffected.

> **Delivered** (`3cc83ac`), with the watermark placed later than the plan specified.
> Stamping it right after the pull still leaves step 2's `googleEventId` writes on the
> far side of it, so every freshly-pushed event was re-pushed once on the following
> run. It is now taken after step 2 — the last local write of the run, since step 3
> only reads and calls Google:
>
> ```js
> const localWritesCompletedAt = new Date();
> ```
>
> Three tests: a pulled event is not echoed back, a just-pushed event is not
> re-pushed, and a genuine local edit *is* still pushed (guarding against the
> over-correction of suppressing real edits).

**Difficulty:** Easy (~30 min)

---

### BUG-06

#### An overdue recurring reminder fires a burst of duplicates

**File:** `server/services/reminderScheduler.js:26-54`

**Root cause.** The chained occurrence is computed from the *previous* fire time, not
from now:

```js
const next = nextOccurrence(reminder.remindAt, reminder.recurrence);   // remindAt + 1 day
if (next) { await prisma.reminder.create({ data: { ..., remindAt: next, sent: false } }); }
```

**Impact.** If the server is down for a week (Render free tier spins down), a DAILY
reminder's chain is `T+1d`, still in the past → the next 30-second tick fires it again,
creates `T+2d`, and so on. The user is hit with seven notifications in ~3.5 minutes.
A monthly outage on a daily reminder produces ~30. Each also writes a row.

**Remediation.** Advance past `now` before persisting the next occurrence.

```js
// server/services/reminderScheduler.js
function nextFutureOccurrence(from, recurrence, now) {
  let next = nextOccurrence(from, recurrence);
  // Skip occurrences already in the past (e.g. after downtime) so a backlog
  // collapses into a single upcoming reminder instead of a burst.
  let guard = 0;
  while (next && next <= now && guard < 1000) {
    next = nextOccurrence(next, recurrence);
    guard += 1;
  }
  return next;
}
```

Call it as `nextFutureOccurrence(reminder.remindAt, reminder.recurrence, now)`. The
`guard` bounds a pathological base date; `nextOccurrence` itself stays pure.

**Tests to add** (`server/tests/scheduler.test.js`): a DAILY reminder five days overdue
fires once and chains exactly one future occurrence.

**Difficulty:** Easy (~30 min)

---

### BUG-07

#### `setInterval` over async work lets ticks overlap

**Files:** `server/services/reminderScheduler.js:57-64` · `server/services/googleSyncScheduler.js:19-27`

**Root cause.** Both schedulers fire on a fixed interval regardless of whether the
previous invocation finished:

```js
timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
```

**Impact.** `reminderScheduler` emits over Socket.IO *before* marking `sent: true`
(`:27` then `:34`), so an overlapping tick re-reads the same unsent rows and emits
duplicate notifications. `googleSync` is worse — a slow sync (now slower still once
BUG-03's pagination lands) can run concurrently with itself, double-inserting events
that haven't had `googleEventId` written back yet. The same reasoning applies to running
more than one server instance; that needs a DB-level claim, out of scope here.

**Remediation.** Add a re-entrancy guard and chain with `setTimeout` in both files.

```js
let running = false;
let timer = null;

async function guardedTick() {
  if (running) return;                     // previous tick still in flight
  running = true;
  try { await tick(); } catch { /* schedulers never throw */ }
  finally { running = false; }
}

function startScheduler(intervalMs = 30000) {
  if (timer) return timer;
  const loop = () => {
    timer = setTimeout(async () => { await guardedTick(); loop(); }, intervalMs);
    if (timer.unref) timer.unref();
  };
  loop();
  return timer;
}
```

Also reorder `reminderScheduler.tick` to mark `sent: true` **before** `emitToUser`, so a
crash between the two drops a reminder rather than duplicating it.

Both modules export `tick` directly and the existing tests call it, so the tests keep
working unchanged.

**Difficulty:** Easy (~45 min for both)

---

### BUG-08

#### Document upload sends untruncated extracted text to the LLM

**File:** `server/controllers/document.controller.js:22-37`

**Root cause.** Stored content is capped, the summarization input is not:

```js
const text = await extractText(req.file.buffer, req.file.mimetype);
const note = await prisma.note.create({
  data: { ..., content: text.slice(0, MAX_STORED_CHARS) },   // capped at 100 000
});
...
const result = await aiClient.summarize(text);               // full extraction
```

**Impact.** A 2 MB PDF can extract to well over a million characters (~250 k+ tokens).
That exceeds most model context windows outright, and where it doesn't it produces a
single request costing orders of magnitude more than intended — with a per-user AI rate
limit of 60 calls / 15 min, this is a cheap way to run up the bill. It also pushes the
request toward the 60 s `AI_TIMEOUT_MS` and its retry (see BUG-24).

**Remediation.** Summarize what was actually stored, and make the cap explicit.

```js
// server/controllers/document.controller.js
const MAX_STORED_CHARS = 100000;
// Cap what we hand the LLM independently: a long document must not blow the
// model's context window or the user's AI budget.
const MAX_SUMMARY_CHARS = 40000;

const stored = text.slice(0, MAX_STORED_CHARS);
const note = await prisma.note.create({ data: { ..., content: stored } });
...
const result = await aiClient.summarize(stored.slice(0, MAX_SUMMARY_CHARS));
```

**Tests to add** (`server/tests/document.test.js`): upload a file larger than the cap and
assert the mocked `aiClient.summarize` receives at most `MAX_SUMMARY_CHARS`.

**Difficulty:** Easy (~20 min)

---

### BUG-09

#### Pomodoro counts interval ticks instead of wall-clock time

**File:** `client/src/components/PomodoroTimer.jsx:63-71`

**Root cause.** Elapsed time is incremented once per timer callback:

```js
intervalRef.current = setInterval(() => {
  elapsedRef.current += 1;                   // assumes exactly 1 s per tick
  const left = plannedRef.current - elapsedRef.current;
  ...
}, 1000);
```

**Impact.** Browsers throttle background-tab timers to roughly once per minute. A user
who starts a 25-minute focus session and switches tabs sees the countdown crawl, and on
return `elapsedRef` may read ~25 s for 25 real minutes. Since `stop()` posts that value
and the server clamps it downward only (`Math.min(clientSeconds, wallClock)`), the
session is recorded as ~25 seconds. Focus analytics — a headline README metric — silently
under-report, and the timer never auto-completes while backgrounded.

**Remediation.** Track a monotonic start instant and derive elapsed from it, keeping the
interval purely as a repaint trigger.

```js
const runStartRef = useRef(0);       // Date.now() when the current run segment began
const bankedRef  = useRef(0);        // active seconds accumulated across prior segments

const beginInterval = useCallback(() => {
  clearTick();
  runStartRef.current = Date.now();
  intervalRef.current = setInterval(() => {
    const live = Math.round((Date.now() - runStartRef.current) / 1000);
    elapsedRef.current = bankedRef.current + live;
    const left = plannedRef.current - elapsedRef.current;
    setSecondsLeft(left > 0 ? left : 0);
    if (left <= 0) stop();
  }, 1000);
}, [stop]);

const pause = () => {
  bankedRef.current += Math.round((Date.now() - runStartRef.current) / 1000);
  clearTick();
  setPaused(true);
};
```

`start()` resets `bankedRef.current = 0`; the mount-time recovery path already computes
elapsed from `session.startedAt`, so set `bankedRef.current` there instead of
`elapsedRef.current` and the two paths converge.

**Tests to add** (`client/src/test/pomodoro.test.jsx`): with fake timers, advance
`Date.now()` by 60 s while firing only one interval callback; assert the countdown
dropped by ~60 s.

**Difficulty:** Medium (~1 h — the pause/resume/recover interaction needs care)

---

### BUG-10

#### A 401 clears the token but leaves the app in a logged-in state

**File:** `client/src/lib/api.js:32-40`

**Root cause.** The interceptor drops the token but nothing tells `AuthContext`:

```js
api.interceptors.response.use((res) => res, (error) => {
  if (error.response?.status === 401) { setToken(null); }
  return Promise.reject(error);
});
```

`AuthContext.user` stays populated, and `ProtectedRoute` only reads `user`.

**Impact.** After a token is revoked server-side (logout elsewhere, password change, or
the 7-day expiry), the user keeps seeing the full authenticated shell while every request
fails. There is no redirect to login until a manual reload.

**Remediation.** Broadcast the session loss and have `AuthProvider` listen.

```js
// client/src/lib/api.js
export const SESSION_EXPIRED_EVENT = 'pa:session-expired';

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);
```

```jsx
// client/src/context/AuthContext.jsx — inside AuthProvider
useEffect(() => {
  const onExpired = () => setUser(null);
  window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
}, []);
```

`ProtectedRoute` then redirects on the next render, and `NotificationContext`'s effect
(keyed on `user`) tears the socket down for free.

**Tests to add** (`client/src/test/apiError.test.js` or `app.test.jsx`): dispatching the
event clears `user` and renders the login route.

**Difficulty:** Easy (~30 min)

---

### BUG-11

#### Analytics, AI usage, and focus stats read whole tables per request

**Files:** `server/controllers/analytics.controller.js:9-15, 50` · `server/controllers/ai.controller.js:209` · `server/controllers/focus.controller.js:71`

**Root cause.** Each endpoint pulls every row the user has ever created and aggregates
in JS:

```js
// analytics.controller.js:9-15
prisma.task.findMany({ where: { userId: req.user.id } }),         // no take, no select
prisma.focusSession.findMany({ where: { userId: req.user.id } }),
prisma.habit.findMany({ where: { userId: req.user.id } }),
prisma.habitLog.findMany({ where: { userId: req.user.id } }),

// ai.controller.js:209 — every AiUsage row, to report the last 7 days
const rows = await prisma.aiUsage.findMany({ where: { userId: req.user.id } });

// focus.controller.js:71 — every session ever, to report a 7-day chart
const sessions = await prisma.focusSession.findMany({ where: { userId: req.user.id } });
```

**Impact.** Cost grows without bound in row count and in row *width* — `task.findMany`
with no `select` also drags the 1024-dimension `embedding` column (~4 KB/row) across the
wire for a query that only needs `status`, `dueDate`, `completedAt`, and `tags`. The
Dashboard hits `/analytics/summary` on every mount. A year-old account makes this the
slowest endpoint in the app.

**Remediation.** Bound the window and narrow the projection. Lowest-risk first pass:

```js
// analytics.controller.js — summary()
const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
const [tasks, sessions, habits, habitLogs] = await Promise.all([
  prisma.task.findMany({
    where: { userId },
    select: { status: true, dueDate: true, completedAt: true, tags: true },  // never `embedding`
  }),
  prisma.focusSession.findMany({
    where: { userId, startedAt: { gte: since } },
    select: { startedAt: true, seconds: true, taskId: true },
  }),
  prisma.habit.findMany({ where: { userId }, select: { id: true } }),
  prisma.habitLog.findMany({ where: { userId, date: { gte: since } }, select: { habitId: true, date: true } }),
]);
```

Apply the same `{ createdAt: { gte: since } }` bound in `ai.controller.usage` and
`{ startedAt: { gte: since } }` in `focus.controller.stats`. Note that this changes the
semantics of the `total` / `totalCostUsd` fields from all-time to windowed — either
rename them or compute the all-time figure with a separate `prisma.*.aggregate()` call,
which pushes the sum into Postgres.

**Tests to add:** existing analytics/usage/focus tests cover the shape; add one asserting
rows outside the window are excluded from `perDay` but still counted in the aggregate
total (whichever semantics you pick).

> **Delivered** (`c867fa8`). The contract question the plan flagged was resolved in
> favour of **windowed, explicitly labelled** rather than a silent semantic change:
>
> - `GET /api/ai/usage` takes an optional `?days=` (clamped 7–365, default 30) and
>   returns `windowDays`; the Analytics card renders "last 30 days" beside the title
>   so windowed totals cannot be misread as all-time.
> - `GET /api/focus/stats` scopes `total` and `perTask` to the same 7 days it charts,
>   and returns `windowDays`.
> - Task counts in `summary`/`trends` are all-time *by definition*, so those reads
>   stay unbounded — but are now projected to four columns, which also stops the
>   1024-dimension `embedding` (~4KB/row) being dragged along.
>
> `fakePrisma` gained `select` support so the projections are actually verified.

**Difficulty:** Medium (~1.5 h — decide the all-time vs. windowed contract first)

---

### BUG-12

#### `vitest` / `vite` dependency advisories

**File:** `client/package.json`

**Root cause.** `npm audit` in `client/` reports 5 advisories, all reached through the
Vite/Vitest dev toolchain:

| Package | Severity | Advisory |
| --- | --- | --- |
| `vitest` | critical | arbitrary file read/execute when the Vitest UI server is listening |
| `vite` | high | path traversal in optimized-deps `.map` handling; `server.fs.deny` bypass on Windows |
| `esbuild` | moderate | any website can send requests to the dev server and read the response |
| `@vitest/mocker`, `vite-node` | moderate | transitive on `vite` |

**Impact.** These are **dev-only** — nothing here ships in `dist/`, and the server has 0
production vulnerabilities. Exposure is limited to developers running `npm run dev` or
`vitest --ui` on an untrusted network. Not a production incident, but it should not sit
in the audit output indefinitely.

**Remediation.** `npm audit fix --force` proposes `vite@8`, a major bump that will also
drag `vitest` to a new major. Do this deliberately, not as part of a bug-fix batch:

```bash
cd client
npm i -D vite@^8 vitest@^4 @vitejs/plugin-react@latest
npm test && npm run build && npm run lint
```

Expect churn in `vite.config.js` (Vitest config moved out of `defineConfig`'s `test` key
in recent majors) and in `src/test/setup.js`. Worth its own commit and its own slice.

> **Delivered** (`4a28cbd`) — `vite@8.2.1`, `vitest@4.1.10`, `@vitejs/plugin-react@6`,
> `jsdom@latest`. **`npm audit` now reports 0 vulnerabilities.**
>
> Config migration needed three changes, two of which the plan did not anticipate:
> - `defineConfig` imported from `vitest/config` so the `test` block is still honoured
>   *(anticipated)*.
> - Vite 8 bundles with **rolldown**, which rejects the object form of `manualChunks`
>   — rewritten as a function; the `react` and `charts` chunks still split as before.
> - `__dirname` → `import.meta.dirname`; Vite 8's native config loader does not
>   provide the CJS globals.
>
> `src/test/setup.js` needed no change, and no test required modification. Verified:
> 40 tests green on Vitest 4, production build clean with chunking intact, SW
> build-id stamping still applied in `dist/sw.js`, dev server serves HTTP 200.

**Difficulty:** Medium (~2 h — major-version upgrade with config migration)

---

## 🟡 Low

### BUG-13

#### Keyword search starves tasks when notes fill the limit

**File:** `server/controllers/search.controller.js:43-58`

Both queries use `take: limit`, then the concatenation is truncated notes-first:

```js
return [...notes.map(...), ...tasks.map(...)].slice(0, limit);
```

With `limit` at its default 10, eleven matching notes mean **no task ever appears**.
Interleave instead of concatenating, or query `take: limit` from each and round-robin:

```js
const merged = [];
for (let i = 0; i < Math.max(noteResults.length, taskResults.length); i += 1) {
  if (noteResults[i]) merged.push(noteResults[i]);
  if (taskResults[i]) merged.push(taskResults[i]);
}
return merged.slice(0, limit);
```

**Difficulty:** Easy (~20 min)

---

### BUG-14

#### Semantic relevance score can be negative

**File:** `server/controllers/search.controller.js:39`

```js
.map((r) => ({ ..., score: 1 - Number(r.distance) }))
```

pgvector's `<=>` is cosine *distance* in `[0, 2]`, so `score` lands in `[-1, 1]`. Any
result more than 90° from the query renders as a negative relevance. Use
`score: Math.max(0, 1 - Number(r.distance))`, or normalise as `1 - distance / 2` for a
true `[0, 1]` scale. The client doesn't display `score` today, so this is latent.

**Difficulty:** Easy (~10 min)

---

### BUG-15

#### Habit check-in race returns 500 instead of being idempotent

**File:** `server/controllers/habit.controller.js:78-86`

`checkIn` does find-then-create against the `@@unique([habitId, date])` constraint. Two
concurrent requests (double-tap, or a retry over a flaky connection) both see no row,
both insert, and the loser gets a Prisma `P2002` surfaced as a 500 — despite the comment
promising idempotency. Replace with an atomic upsert:

```js
await prisma.habitLog.upsert({
  where: { habitId_date: { habitId: habit.id, date } },
  update: {},
  create: { habitId: habit.id, userId: req.user.id, date },
});
```

`server/tests/helpers/fakePrisma.js` will need `habitLog.upsert` support.

**Difficulty:** Easy (~30 min incl. the fake-Prisma helper)

---

### BUG-16

#### Reminder `taskId` is never ownership-checked

**Files:** `server/controllers/reminder.controller.js` · `server/validators/reminder.schema.js:12, 21`

`create` and `update` accept any UUID as `taskId` and write it straight through. There's
no FK on `Reminder.taskId` in the schema, so nothing rejects another user's task id. The
value is echoed back to the client and into the Socket.IO reminder payload. Low impact —
the attacker learns nothing they didn't supply — but it violates the user-scoping
invariant and will bite when someone adds a join. Mirror the `focus.controller.start`
check:

```js
if (data.taskId) {
  const task = await prisma.task.findFirst({ where: { id: data.taskId, userId: req.user.id } });
  if (!task) throw ApiError.notFound('Task not found');
}
```

**Difficulty:** Easy (~20 min)

---

### BUG-17

#### Login timing side channel enables user enumeration

**File:** `server/controllers/auth.controller.js:40-54`

An unknown email returns immediately; a known one costs a bcrypt round (~100 ms at 10
rounds). The response body is correctly identical, but the timing is not, so an attacker
can enumerate registered addresses. `authLimiter` (30 attempts / 15 min / IP) slows but
doesn't prevent this. Burn an equivalent compare on the miss path:

```js
// Compare against a dummy hash so a missing user costs the same as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('unused-placeholder-password', SALT_ROUNDS);

const user = await prisma.user.findUnique({ where: { email: data.email } });
if (!user) {
  await bcrypt.compare(data.password, DUMMY_HASH);
  throw ApiError.unauthorized('Invalid email or password');
}
```

**Difficulty:** Easy (~20 min)

---

### BUG-18

#### Concurrent open focus sessions accumulate as orphans

**File:** `server/controllers/focus.controller.js:19-39`

`start` never checks for an already-open session. Two tabs, or a start after a crashed
client, leave rows with `endedAt: null` forever; `active()` returns only the newest
(`orderBy: { startedAt: 'desc' }`), so the rest are invisible and permanently stuck at
`seconds: 0`. Close any dangling session on start:

```js
// Close any session left open by another tab or a crashed client, capping it at
// its planned duration so orphaned time can't be inflated.
await prisma.focusSession.updateMany({
  where: { userId: req.user.id, endedAt: null },
  data: { endedAt: now },
});
```

For an exact `seconds` value on the closed rows, fetch and update them individually
reusing the clamping logic in `stop`.

**Difficulty:** Easy (~30 min)

---

### BUG-19

#### Service-worker cache name is static, so old assets are never evicted

**File:** `client/public/sw.js:7`

`const CACHE = 'pa-shell-v1';` never changes, so the `activate` handler's cleanup
(`keys.filter((k) => k !== CACHE)`) has nothing to delete. Vite emits content-hashed
filenames, so every deploy adds a fresh set of entries and the old ones accumulate in
Cache Storage indefinitely. Stamp the cache name at build time (e.g. inject the package
version or a build hash), or prune entries not in the current asset manifest during
`activate`.

**Difficulty:** Easy (~30 min)

---

### BUG-20

#### No graceful shutdown on SIGTERM

**File:** `server/server.js`

Render sends `SIGTERM` on redeploy and scale-down. Nothing handles it, so in-flight
requests are cut and the Prisma pool is never drained.

```js
// server/server.js
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(async () => {
      const { stopScheduler } = require('./services/reminderScheduler');
      stopScheduler();
      await require('./models/prisma').$disconnect();
      process.exit(0);
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
```

**Difficulty:** Easy (~20 min)

---

### BUG-21

#### Missing composite indexes on the hot scheduler and usage queries

**File:** `server/prisma/schema.prisma:265-267, 247-248`

`Reminder` indexes `userId`, `remindAt`, and `sent` separately, but the scheduler's
30-second query filters on the pair:

```js
prisma.reminder.findMany({ where: { sent: false, remindAt: { lte: now } }, take: 100 });
```

Postgres can only use one of the single-column indexes (or a bitmap-and), and the `sent`
index is near-useless on its own — it is a two-value boolean that becomes overwhelmingly
`true` over time. Same story for `AiUsage` once BUG-11's date bound lands.

```prisma
// model Reminder — replace @@index([sent])
@@index([sent, remindAt])

// model AiUsage — replace @@index([createdAt])
@@index([userId, createdAt])

// model FocusSession — supports both active() and the windowed stats query
@@index([userId, startedAt])
```

Render applies these via `prisma db push` on deploy — no migration file needed, matching
the pattern noted in `ROADMAP.md`.

**Difficulty:** Easy (~20 min)

---

### BUG-22

#### Non-ASCII internal-key header raises 500 instead of 401

**File:** `ai-service/main.py:42-46`

`hmac.compare_digest` raises `TypeError` when either `str` argument contains non-ASCII
characters. A caller sending `X-Internal-Key: café` gets an unhandled 500 rather than a
clean 401 — an error-shape inconsistency and a small information leak in the traceback.

```python
def require_internal_key(x_internal_key: str = Header(default="")):
    settings = get_settings()
    # Compare as bytes: compare_digest rejects non-ASCII str inputs with TypeError.
    if not hmac.compare_digest(
        x_internal_key.encode("utf-8"), settings.internal_api_key.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid internal key")
```

Byte comparison keeps the constant-time property. Add a case to
`ai-service/tests/test_config_security.py`.

> **Delivered** (`6e67cca`), with a corrected test. The plan's version sends the
> header as a `str`, but httpx refuses to encode a non-ASCII str header client-side —
> the request never reaches the app. Real HTTP headers are bytes, which Starlette
> decodes as latin-1, so the test sends `b"caf\xe9"` and the dependency receives
> `'café'`. Confirmed the bug and the fix directly:
>
> ```
> hmac.compare_digest('café', 'dev-internal-key')  → TypeError  (this was the 500)
> hmac.compare_digest(b'caf\xc3\xa9', b'dev-...')  → False      (clean 401)
> ```
>
> The new test was verified to **fail against the previous implementation** and pass
> against this one. Landed in `tests/test_ai.py` (alongside the existing
> `test_requires_internal_key`) rather than `test_config_security.py`, since it
> exercises the endpoint dependency rather than config validation.

**Difficulty:** Easy (~15 min)

---

### BUG-23

#### `act()` warnings from `PomodoroTimer` in the client suite

**File:** `client/src/components/PomodoroTimer.jsx:20` (via `client/src/test/pomodoro.test.jsx`)

The suite passes but logs `An update to PomodoroTimer inside a test was not wrapped in
act(...)`. The mount effect's three unawaited promise chains (`taskService.list`,
`loadToday`, `focusService.active`) resolve after the test's synchronous body. Wrap the
render's settle in `await waitFor(...)` / `await act(...)` in the test. Worth clearing
alongside BUG-09, which touches the same component — real regressions currently hide in
this noise.

**Difficulty:** Easy (~20 min)

---

### BUG-24

#### Worst-case 121.5 s AI request with no server-side deadline

**File:** `server/services/aiClient.js:12-14, 60-85`

`TIMEOUT_MS` defaults to 60 s, `MAX_RETRIES` is 1, `RETRY_DELAY_MS` is 1.5 s — so a
fully hung AI service holds an Express worker and the browser connection for just over
two minutes before the graceful 503 is returned. That is far past any reasonable user
patience and past most proxy idle timeouts, so the client typically sees a proxy error
rather than the friendly "service is waking up" message `apiError` was written for.

The 60 s budget is a deliberate accommodation for Render free-tier cold starts
(commit `e5fcff1`), so don't simply lower it. Instead cap the *total* wall clock across
attempts, and leave headroom under the platform's own timeout:

```js
// Total budget across all attempts, so a hung AI service can't pin a request
// past the proxy's idle timeout.
const TOTAL_BUDGET_MS = parseInt(process.env.AI_TOTAL_BUDGET_MS || '75000', 10);

async function call(path, body) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const res = await client.post(path, body, { timeout: Math.min(TIMEOUT_MS, remaining) });
      recordUsage(path, res.headers);
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err) && Date.now() + RETRY_DELAY_MS < deadline) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }
  ...
}
```

`server/tests/aiClient.test.js` already covers the retry paths and should keep passing.

**Difficulty:** Easy (~30 min)

---

## Sequencing (as executed)

Each group shipped as an independently verified slice with its own tests, per `CLAUDE.md`.

| # | Slice | Items | Commit |
| --- | --- | --- | --- |
| 1 | Security | BUG-01, 02, 16, 17 | `173f14f` |
| 2 | Google Calendar sync | BUG-03, 05, 04 | `3cc83ac` |
| 3 | Schedulers & background work | BUG-06, 07, 18, 20 | `07971fe` |
| 4 | Cost & performance | BUG-08, 11, 21, 24 | `c867fa8` |
| 5 | Client correctness | BUG-09, 10, 23, 19 | `ec7ca68` |
| 6 | Search polish | BUG-13, 14, 15, 22 | `6e67cca` |
| 7 | Dependency upgrade | BUG-12 | `4a28cbd` |

## Verification

Run after every slice; all green at `4a28cbd`:

```bash
cd server     && npm run lint && npm test          # 23 suites, 187 tests
cd client     && npm run lint && npm test && npm run build   # 17 files, 40 tests
cd ai-service && .venv/bin/python -m pytest        # 35 tests
```

Beyond the suites, these fixes were verified by direct observation rather than by
test assertion alone:

- **BUG-20** — sent a real `SIGTERM` to a running server: logged the graceful path
  and exited 0, without hitting the 10s force-exit fallback.
- **BUG-19** — inspected `dist/sw.js` after a build; `__BUILD_ID__` is substituted.
- **BUG-22** — the new test fails against the pre-fix `main.py` and passes after.
- **BUG-12** — dev server booted on Vite 8 and served HTTP 200.
- **Schema** — `prisma validate` passes; `prisma generate` succeeds.

> **Note on `ai-service`:** the plan recorded its findings as code-reading only,
> because no `.venv` existed. The environment has since been created
> (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`) and the suite
> runs clean. Note the command differs from `CLAUDE.md`, which documents the Windows
> path `.venv/Scripts/python`; on Linux it is `.venv/bin/python`.

---

## Status: complete

All 24 items implemented, tested, and committed on `claude/beautiful-einstein-r9hm2f`.
Every suite green, all lint clean, 0 npm vulnerabilities in both packages.

The one thing needing a human decision is the **deploy**: the Prisma schema gained
`Schedule.allDay` and three composite indexes, which Render applies via
`prisma db push` on the next deploy.
