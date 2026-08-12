# Roadmap — Post-Launch Features

Base project (Phases 0–14) is complete; see `PLAN.md`. This file is the backlog
of new features. Each item is a small, independently shippable **slice** with its
own tests. Work top-down, one slice at a time, and only after plan approval
(see `CLAUDE.md` → Workflow rules). Nothing here is started until it is planned
and approved.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done.

## Tier A — high value, no external accounts needed

### A1 — Subtasks / AI task breakdown
- [ ] Prisma: add `parentId` self-relation to `Task` (nullable, indexed, cascade on parent delete).
- [ ] Server: nest subtasks in task read; guard against cross-user parent; validation.
- [ ] AI service: `/breakdown` — turn one task into an ordered list of validated subtasks.
- [ ] Client: expand/collapse subtasks under a task; "AI Break Down" action in `TaskList.jsx`.
- [ ] Tests: server (Jest) + ai-service (pytest) + client (Vitest).

### A2 — Recurring tasks & reminders ✅
- [x] Prisma: `Recurrence` enum (`NONE|DAILY|WEEKLY|MONTHLY`) + field on `Task` and `Reminder`.
- [x] Server: `utils/recurrence.js` (`nextOccurrence`, month-clamp); on task complete spawn next occurrence; user-scoped.
- [x] Scheduler: `reminderScheduler` chains the next unsent reminder on fire.
- [x] Client: recurrence selector on task (`TaskList`) + reminder (`Calendar`) forms; badge on recurring tasks.
- [x] Tests: `recurrence.test.js` (8) + task spawn (4) + scheduler chain (2) + client control (1). Server 56 tests green, client green, lint clean.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

### A3 — Pomodoro focus timer + time tracking
- [ ] Prisma: `FocusSession` model (`userId`, `taskId?`, `startedAt`, `endedAt`, `seconds`).
- [ ] Server: start/stop session endpoints, user-scoped; aggregate per task/day.
- [ ] Client: Pomodoro timer component bound to a task; persists sessions.
- [ ] Analytics: surface "Time Spent" (currently omitted — this unblocks the README metric).
- [ ] Tests: server + client.

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
