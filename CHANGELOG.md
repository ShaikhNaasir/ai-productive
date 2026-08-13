# Changelog

All notable post-launch changes to the AI-Powered Personal Productivity Assistant.
The base project (Phases 0–14) is documented in `PLAN.md`; the feature backlog
lives in `ROADMAP.md`.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Shared tasks — client (Roadmap C2.2).** Each owned task gets a Share action
  opening a dialog to share by email with a VIEW or EDIT role, and to list/revoke
  existing shares. A new "Shared" tab loads tasks shared with you, showing the
  owner and enforcing the role: VIEW is read-only, EDIT allows editing and
  completing, while deleting and re-sharing stay owner-only.

- **Shared tasks — backend (Roadmap C2.1).** New `TaskShare` model (VIEW/EDIT
  role, unique per task+user) lets an owner share a task with another registered
  user by email. `services/taskAccess.js` centralizes authorization: a user may
  act on a task they own or that is shared with them, and subtasks inherit their
  parent's shares. Endpoints: `POST /api/tasks/:id/share`, `GET /:id/shares`,
  `DELETE /:id/share/:userId`, and `GET /api/tasks/shared`. EDIT sharees can
  update, complete, and break down a task; deleting stays owner-only. Client UI
  (share dialog + "Shared with me" view) follows in C2.2.

- **Voice command capture (Roadmap B4).** A `VoiceInput` mic button in the Task
  "AI Add" form uses the Web Speech API to transcribe a spoken phrase into the
  natural-language task box, feeding the existing AI task creation. It renders
  nothing where speech recognition is unsupported (graceful fallback) and
  supports the `webkit`-prefixed API.

- **Progressive Web App (Roadmap B3).** The client is now installable and works
  offline as an app shell: a web manifest + SVG icon, a hand-rolled service
  worker (`public/sw.js`) that precaches the shell, serves navigations
  network-first with an offline fallback, and caches static assets cache-first.
  The worker deliberately ignores cross-origin and `/api` requests, so no private
  or API data is ever cached. Registration is production-only, and an
  `InstallPrompt` button appears when the browser offers installation.

- **Habit tracking (Roadmap B2).** New `Habit` and `HabitLog` models (one log per
  habit per UTC day, unique). Endpoints under `/api/habits`: CRUD plus an
  idempotent `POST /:id/check-in` and `DELETE /:id/check-in` (uncheck). Current
  and longest streaks are computed by a pure `utils/streak.js`. A new `/habits`
  page (Flame nav item) lists habits with a check-in toggle and streak badges,
  and the Analytics summary gains a "Habits Today X/Y" tile
  (`habitsCheckedToday` / `habitsTotal`).

- **Document upload & AI summarization (Roadmap B1).** New authenticated endpoint
  `POST /api/documents/upload` accepts a multipart file (`.txt`, `.md`, `.csv`,
  `.log`, `.pdf`; max 2MB). The server extracts the text (`services/textExtract.js`,
  using `pdf-parse` for PDFs), stores it as a user-scoped note tagged `document`,
  and returns an AI summary with key points. Storage still succeeds if the AI
  service is unavailable. A new "Upload document" card on the Notes page surfaces
  the flow.

- **AI daily planner "Plan my day" (Roadmap A4).** `POST /api/ai/plan-day` gathers
  the user's open tasks and today's calendar commitments and asks the AI service
  (`/plan-day`) for a work-hours-aware, time-blocked plan; blocks are validated
  (title + parseable ISO start/end). `POST /api/ai/plan-day/accept` validates and
  persists chosen blocks as schedule entries. A "Plan my day" panel on the
  Dashboard lets users generate, review, and accept a plan.

- **Pomodoro focus timer & time tracking (Roadmap A3).** New `FocusSession` model
  and endpoints: `POST /api/focus/start` (optional owned task + real start
  instant), `POST /api/focus/:id/stop` (computes elapsed seconds from the
  timestamps), and `GET /api/focus/stats` (per-task and per-day aggregates). The
  Analytics summary now reports `focusSecondsToday` ("Focus Today" tile), and a
  `PomodoroTimer` component (25/15/5 presets, countdown, auto-stop) is mounted on
  the Tasks page.

- **Subtasks & AI task breakdown (Roadmap A1).** `Task` gained a self-relation
  (`parentId`, cascade on parent delete). The task list returns top-level tasks
  with their subtasks nested; creating a subtask validates a user-owned,
  one-level-deep parent. `POST /api/ai/tasks/:id/breakdown` turns a task into
  3–7 ordered subtasks (schema-validated before persisting). The task list gained
  an expand/collapse control and an "AI Break Down" action.

- **Recurring tasks & reminders (Roadmap A2).** `Recurrence` enum
  (`NONE|DAILY|WEEKLY|MONTHLY`) on tasks and reminders. Completing a recurring
  task spawns the next occurrence; the reminder scheduler chains the next unsent
  reminder. Recurrence selectors on the task and reminder forms; badge on
  recurring tasks.

### Notes

- All new rows remain scoped to `userId`; AI output is schema-validated before any
  DB write; the app degrades gracefully when the AI service is unreachable.
- Deployment applies schema changes via `prisma db push` (see `render.yaml`), so
  the new `Task.parentId` column and `focus_sessions` table are created on deploy
  without migration files.
