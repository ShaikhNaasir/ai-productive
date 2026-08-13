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

### A4 — AI Daily Planner ("Plan my day")
- [ ] AI service: `/plan-day` — build a time-blocked schedule from open tasks + calendar + priorities; schema-validated blocks.
- [ ] Server: `/api/ai/plan-day` gathers context, returns/persists suggested blocks; graceful 503 fallback.
- [ ] Client: "Plan my day" panel (accept → creates schedule entries).
- [ ] Tests: ai-service + server + client.

## Tier B — moderate effort

### B1 — Document upload + AI summarization
- [ ] Server: authenticated file upload (size/type limits), text extraction, user-scoped storage.
- [ ] AI service: reuse `summarizer` on extracted text.
- [ ] Client: upload UI on Notes; show key points + summary.
- [ ] Tests: upload + extraction + summarize path.

### B2 — Habit tracking
- [ ] Prisma: `Habit` + `HabitLog` models (streaks), user-scoped.
- [ ] Server: CRUD + check-in; streak calc.
- [ ] Client: habits page with streak view; analytics tile.
- [ ] Tests: server + client.

### B3 — PWA (installable + offline shell)
- [ ] Client: manifest, service worker, offline app shell, install prompt.
- [ ] Cache-safe with auth (no stale private data).
- [ ] Tests: build + basic SW registration check.

### B4 — Voice command capture
- [ ] Client: Web Speech API mic input feeding existing NL task creation.
- [ ] Graceful fallback where unsupported.
- [ ] Tests: component + fallback.

## Tier C — needs external accounts / larger scope

### C1 — Google Calendar sync
- [ ] OAuth (Google), two-way sync of schedules. **Blocked:** Google API credentials.

### C2 — Shared / team tasks
- [ ] Sharing/permission model; invite; shared task views. Larger schema + auth change.

### C3 — AI usage & cost monitoring
- [ ] Track tokens/cost per AI call; per-user dashboard tile.
