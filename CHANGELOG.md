# Changelog

All notable post-launch changes to the AI-Powered Personal Productivity Assistant.
The base project (Phases 0–14) is documented in `PLAN.md`; the feature backlog
lives in `ROADMAP.md`.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

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
