# Roadmap — Post-Launch Features

Base project (Phases 0–14) is complete; see `PLAN.md`. This file is the backlog
of new features. Each item is a small, independently shippable **slice** with its
own tests. Work top-down, one slice at a time, and only after plan approval
(see `CLAUDE.md` → Workflow rules). Nothing here is started until it is planned
and approved.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done.

## Tier A — high value, no external accounts needed

### A1 — Subtasks / AI task breakdown ✅
- [x] Prisma: `parentId` self-relation on `Task` (nullable, indexed, `onDelete: Cascade`).
- [x] Server: list nests subtasks (top-level only), `getOne` includes them; create guards a user-owned, one-level-deep parent; `parentId` in validator.
- [x] AI service: `/breakdown` — task → 3–7 ordered validated subtasks (`task_planner.breakdown`).
- [x] Server: `POST /api/ai/tasks/:id/breakdown` — schema-validates AI output before persisting child tasks.
- [x] Client: expand/collapse subtasks + "AI Break Down" action in `TaskList.jsx`; subtask-count badge.
- [x] Tests: server task (3) + ai breakdown (2) + `fakePrisma` include/cascade support; ai-service (2); client (1). Server 61 green, ai-service 11 green, client green, lint clean, build OK.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

### A2 — Recurring tasks & reminders ✅
- [x] Prisma: `Recurrence` enum (`NONE|DAILY|WEEKLY|MONTHLY`) + field on `Task` and `Reminder`.
- [x] Server: `utils/recurrence.js` (`nextOccurrence`, month-clamp); on task complete spawn next occurrence; user-scoped.
- [x] Scheduler: `reminderScheduler` chains the next unsent reminder on fire.
- [x] Client: recurrence selector on task (`TaskList`) + reminder (`Calendar`) forms; badge on recurring tasks.
- [x] Tests: `recurrence.test.js` (8) + task spawn (4) + scheduler chain (2) + client control (1). Server 56 tests green, client green, lint clean.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

### A3 — Pomodoro focus timer + time tracking ✅
- [x] Prisma: `FocusSession` model (`userId`, `taskId?`, `startedAt`, `endedAt`, `seconds`); task delete `SetNull` keeps tracked time.
- [x] Server: `POST /api/focus/start` (optional owned `taskId` + `startedAt`), `POST /api/focus/:id/stop` (computes seconds from timestamps), `GET /api/focus/stats` (per-task + per-day aggregate), user-scoped.
- [x] Client: `PomodoroTimer` bound to a task (25/15/5 presets, countdown, auto-stop) persisting sessions; mounted on Tasks page.
- [x] Analytics: `summary.focusSecondsToday` + "Focus Today" tile (README "Time Spent" metric).
- [x] Tests: `focus.test.js` (7) + analytics focus (1) + `PomodoroTimer` (2); `fakePrisma` gains `focusSession`. Server 69 green, client green, lint clean, build OK.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

### A4 — AI Daily Planner ("Plan my day") ✅
- [x] AI service: `/plan-day` — time-blocked schedule from open tasks + today's commitments, work-hours aware; blocks validated (title + parseable ISO start/end), invalid dropped.
- [x] Server: `POST /api/ai/plan-day` gathers open tasks + today's schedules (non-persisting); `POST /api/ai/plan-day/accept` zod-validates blocks before persisting them as `Schedule` rows; graceful 503 via `aiClient`.
- [x] Client: `PlanMyDay` panel on Dashboard — generate → review blocks → "Accept & add to calendar".
- [x] Tests: ai-service (2) + server ai plan-day/accept (4) + client `PlanMyDay` (1). ai-service 13 green, server 73 green, client green, lint clean, build OK.

## Tier B — moderate effort

### B1 — Document upload + AI summarization ✅
- [x] Server: `POST /api/documents/upload` — authenticated multipart upload (multer, 2MB, mimetype allowlist); `services/textExtract.js` extracts text (.txt/.md/.csv/.log utf8, .pdf via pdf-parse); stores the document as a user-scoped note (`tags: ['document']`).
- [x] AI service: reuses the existing `summarizer` via `aiClient.summarize` on the extracted text (degrades gracefully — the note is stored even if AI is down).
- [x] Client: "Upload document" card on Notes; shows key points + summary and refreshes the list.
- [x] Tests: `document.test.js` (6 — store+summarize, 503 fallback, unsupported type, size limit, no file, auth); client Notes upload (1). Server 79 green, client green, lint clean, build OK.

### B2 — Habit tracking ✅
- [x] Prisma: `Habit` + `HabitLog` (unique `[habitId, date]`, cascade), user-scoped.
- [x] Server: `/api/habits` CRUD + idempotent `POST /:id/check-in` and `DELETE /:id/check-in` (uncheck); `utils/streak.js` computes current + longest streak.
- [x] Client: `/habits` page (Flame nav) with per-habit check-in toggle + streak badges; "Habits Today X/Y" analytics tile.
- [x] Tests: `streak.test.js` (8) + `habit.test.js` (9, incl. analytics) + client `HabitList` (1); `fakePrisma` gains `habit`/`habitLog`. Server 96 green, client green, lint clean, build OK.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

### B3 — PWA (installable + offline shell) ✅
- [x] Client: `manifest.webmanifest` + SVG icon, hand-rolled `sw.js` (precached shell, network-first navigations with offline fallback, cache-first assets), prod-only registration, `InstallPrompt` button.
- [x] Cache-safe with auth: the SW ignores cross-origin **and** `/api` requests, so no private/API data is ever cached — only the static shell.
- [x] Tests: `registerSW.test.js` (2) + `installPrompt.test.jsx` (2); `npm run build` copies `manifest`/`sw`/`icon` into `dist`. Client 14 green, lint clean, build OK.

### B4 — Voice command capture ✅
- [x] Client: `VoiceInput` mic button (Web Speech API) in the Task "AI Add" form — a spoken phrase fills the NL task box for the existing AI task creation.
- [x] Graceful fallback: renders nothing where speech recognition is unsupported.
- [x] Tests: `voiceInput.test.jsx` (3 — supported/transcript, unsupported fallback, webkit-prefixed API). Client 17 green, lint clean, build OK.

## Tier C — needs external accounts / larger scope

### C1 — Google Calendar sync
- [ ] OAuth (Google), two-way sync of schedules. **Blocked:** Google API credentials.

### C2 — Shared / team tasks
- [ ] Sharing/permission model; invite; shared task views. Larger schema + auth change.

### C3 — AI usage & cost monitoring — skipped
- [ ] Track tokens/cost per AI call; per-user dashboard tile. _Deferred by owner (2026-08-13) — not needed for now._
