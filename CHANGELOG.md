# Changelog

All notable post-launch changes to the AI-Powered Personal Productivity Assistant.
The base project (Phases 0–14) is documented in `PLAN.md`; the feature backlog
lives in `ROADMAP.md`.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Security

- **Security hardening (P1–P3).** A security review (no critical vulnerabilities
  found — userId scoping / IDOR clean, raw SQL safe, secrets gitignored) drove
  three slices:
  - *P1* — per-user rate limit on `/api/ai/*` (`aiLimiter`, `AI_RATE_LIMIT_MAX`
    default 60 / 15 min); fail-fast in production when `INTERNAL_API_KEY` is missing
    or left at `dev-internal-key` (server + ai-service, gated on the `RENDER` env);
    a login open-redirect guard.
  - *P2* — parameterized the pgvector raw SQL (vector / limit bound as `$2` / `$3`,
    table name allow-listed); password policy `min 10` / `max 128`; ai-service
    internal-key comparison via constant-time `hmac.compare_digest`.
  - *P3* — **JWT revocation** via `User.tokenVersion` (embedded as the `ver` claim;
    `requireAuth` loads the user and checks the version on every request). Logout
    bumps the version server-side; change-password bumps it and rotates the token so
    the active session survives. Client logout now calls the server. `react-router-dom`
    upgraded to 7.18.2 (client `npm audit` → 0 vulnerabilities).

- **Bug audit remediation — 24 items.** An automated audit (`bug_remediation_plan.md`)
  found 24 latent defects the existing suites did not cover; all are now fixed,
  tested, and merged (PR #1):
  - *Access control.* Task update no longer accepts `parentId` without an
    owner-and-depth check (closing an EDIT-sharee → cross-user cascade-delete path);
    reminder `taskId` is ownership-checked; login burns an equivalent bcrypt compare
    on the miss path, removing a user-enumeration timing side channel.
  - *Realtime.* The Socket.IO handshake now verifies `tokenVersion`, and live sockets
    are disconnected on logout / password change — a revoked JWT can no longer stream.
  - *Google Calendar.* Event sync pages through `nextPageToken` (was silently
    dropping everything past the first 250 events); all-day events round-trip as
    `date` instead of being rewritten to midnight-UTC (new `Schedule.allDay`); the
    watermark is stamped after the last local write so pulled events are no longer
    echoed back to Google.
  - *Schedulers.* Overdue recurring reminders collapse to a single upcoming fire
    instead of a burst; both schedulers guard against overlapping ticks (a
    `setTimeout` chain plus a re-entrancy flag); focus `start` closes orphaned open
    sessions; the server drains cleanly on `SIGTERM` / `SIGINT`.
  - *Cost & performance.* Extracted document text is capped before it reaches the
    LLM; analytics / AI-usage / focus-stats reads are windowed and column-projected
    (no longer dragging the 1024-dim `embedding`); the AI client caps total
    wall-clock across retries. Three composite indexes added for the hot
    scheduler / usage queries.
  - *Client.* The Pomodoro timer counts wall-clock time (surviving background-tab
    throttling); a 401 now clears auth state and redirects to login; the service
    worker cache name is build-stamped so stale assets evict.
  - *Search & misc.* Keyword search interleaves tasks and notes (was starving
    tasks); semantic relevance score is floored at 0; habit check-in is an
    idempotent `upsert`; the ai-service internal-key header handles non-ASCII bytes
    (clean 401, not 500).
  - Dev-toolchain advisories cleared by upgrading to Vite 8 / Vitest 4
    (client `npm audit` → 0 vulnerabilities).

  Suites after remediation: server Jest **187**, client Vitest **40**, ai-service
  pytest **35**; lint clean; both packages report 0 npm vulnerabilities. New schema
  applied via `prisma db push` on deploy: `Schedule.allDay` plus three composite
  indexes.

### Added

- **Admin panel (Roadmap Tier D).** A role-gated admin surface for monitoring all
  registered users — **metadata and aggregate counts only, never private content**
  (task titles, note bodies, etc.). Built custom in the existing stack (a library
  such as AdminJS / react-admin would auto-expose row content and violate that
  invariant). Four slices:
  - *D1 — Roles + guard.* `Role` (USER/ADMIN) and `UserStatus` (ACTIVE/DISABLED) on
    `User`; a `requireAdmin` middleware; `requireAuth` loads the role and blocks
    disabled accounts (403 everywhere, including login). Admins are bootstrapped from
    an `ADMIN_EMAILS` env allow-list (promote-on-login / on-register; never
    auto-demote). Auth responses now carry `user.role`.
  - *D2 — Read API.* `GET /api/admin/metrics` (user totals, 7/30-day signups,
    active-today, disabled, plan split, content counts, AI spend), `GET /api/admin/users`
    (paginated, filterable by search / role / status / plan, metadata-only projection),
    and `GET /api/admin/users/:id` (per-user counts + AI aggregate). Adds `User.plan`
    (FREE/PAID scaffold), `planRenewsAt`, and a throttled `lastActiveAt` stamp.
  - *D3 — Moderation + audit.* `POST /users/:id/disable|enable|force-logout|role|plan`
    and `DELETE /users/:id` (soft by default → `status=DELETED` retaining data; `hard:true`
    removes the row and cascades). Disable / delete / force-logout bump `tokenVersion`
    and drop live sockets. Guards prevent self-disable / self-delete / self-revoke and
    removing the last active admin. Every mutation writes an `AdminAuditLog` row (no FK,
    survives hard-deletes); `GET /audit` lists the trail. `UserStatus` gains `DELETED`;
    auth blocklists DISABLED/DELETED.
  - *D4 — Admin client.* An `/admin` React surface behind an `AdminRoute` role guard
    with an admin-only nav link: a dashboard of metric tiles, a users table (search +
    status filter, pagination, row → detail), a per-user drill-down (metadata + counts +
    moderation buttons with confirmations), and a paginated audit log.

  Suites: server Jest **209**, client Vitest **45**; lint clean; client build OK. New
  schema applied via `prisma db push` on deploy: `users.role` / `status` / `plan` /
  `planRenewsAt` / `lastActiveAt`, the `admin_audit_logs` table, and `UserStatus.DELETED`.
  **Ops:** set `ADMIN_EMAILS` on the `productivity-api` Render service (the repo is
  public, so the real admin email lives only in the untracked env, never in source).
- **Focus timer robustness.** The Pomodoro timer now supports **pause/resume**
  and **custom durations** (1–180 min) alongside the 25/15/5 presets, and
  **recovers a running session** after a reload or navigating away: sessions
  store their planned duration (`FocusSession.plannedSeconds`) and a new
  `GET /api/focus/active` returns the open session. Stop accepts the client's
  active seconds (pauses excluded); the server clamps it to the wall-clock
  elapsed and to the planned duration, so an orphaned open session can never
  inflate tracked time.
- **Google Calendar sync (Roadmap C1).** Two-way sync between local schedules and
  a user's Google Calendar, added in three slices:
  - *C1.1 — Connect + token storage.* OAuth 2.0 (Authorization Code) flow:
    `GET /api/google/auth-url` (state = signed JWT of the user), a session-less
    `GET /api/google/callback` that stores the refresh token on a per-user
    `GoogleAccount`, plus `GET /api/google/status` and `DELETE /api/google/disconnect`.
    Absent credentials disable the integration (endpoints return 503); tokens are
    never exposed to the browser.
  - *C1.2 — Two-way event sync.* `services/googleSync.js` pulls changed Google
    events into `Schedule` rows and pushes local schedules back, keyed by
    `Schedule.googleEventId`. Incremental via `syncToken` (resets on 410); a remote
    edit wins a conflict (Google-wins); a cancelled event deletes the local
    schedule and a local delete best-effort removes the remote event. Runs on a
    DB-backed interval scheduler (`GOOGLE_SYNC_INTERVAL_MS`, default 5 min, started
    only when configured) and on demand via `POST /api/google/sync`.
  - *C1.3 — Client UI.* A "Google Calendar" card in Settings (connect, status,
    Sync now, disconnect) and a "Synced" badge on Google-linked events in the
    Calendar view.

### Fixed

- **Semantic search index no longer silently drops records.** `reindex` fired one
  embed call per record (`Promise.all` over every row). On the free-tier AI service
  that storms the provider; a slice of the calls rate-limit and, because
  `indexRecord` swallows failures, those rows keep a `NULL` embedding and become
  unfindable by semantic search — notes were not returned for their own content.
  Reindex now batches every text into a single `aiClient.embed` call, persists each
  vector, and returns the real `indexed` / `failed` / `total` counts instead of the
  attempted count. (Found by `/qa` deep pass.)
- **Search queries are embedded as queries, not documents.** The `/embed` endpoint
  always used Voyage `input_type="document"`, so a search query was encoded the same
  way as the notes/tasks it was compared against; Voyage's asymmetric encoding
  retrieves worse that way. An optional `input_type` now threads through
  `aiClient.embed` → `/embed` → `embeddings.embed` (validated `query|document`,
  default `document`), and query embedding passes `"query"`.
- **All-day calendar events no longer show a misleading clock time.** All-day
  schedule events are stored as midnight UTC, so the agenda rendered them with a
  local time (e.g. "Conference day — 5:30 AM" in IST). All-day schedule events now
  render the date only; timed events keep their time.
- **Focus timer "Validation failed" on start.** `POST /api/focus/start` rejected
  any `startedAt` in the future, so a device whose clock ran even slightly fast
  could never start a session. The server now clamps a future `startedAt` to now
  instead of rejecting it, and the client surfaces the specific field-level
  validation message rather than a generic "Validation failed".
- **Gemini failures now degrade gracefully instead of surfacing as "invalid".**
  `_gemini_complete` no longer uses Gemini's throwing `response.text` accessor,
  which raised whenever a candidate's `finish_reason` wasn't `STOP` (e.g.
  `MAX_TOKENS` or `SAFETY`) — making long/edge generations fail intermittently
  while short ones worked. A new `_gemini_text` helper joins the response's answer
  parts (skipping thinking-summary parts), returns partial output on truncation,
  and otherwise raises an error naming the finish/block reason. Provider API
  errors (invalid key, unknown model, quota) from all three providers are now
  caught and re-raised as `LLMUnavailable`, so the server degrades to a 503 with a
  clear message rather than an opaque 500.

### Changed

- **Migrated Gemini to the `google-genai` SDK and tuned it for Gemini 3.x.**
  `_gemini_complete` now uses the unified `google-genai` client
  (`client.models.generate_content`). Because Gemini 3.x are thinking models
  whose reasoning tokens consume the output budget, the AI service now sends
  `thinking_level` (env `GEMINI_THINKING_LEVEL`, default `minimal`) to keep that
  cost low, right-sizes `max_output_tokens` per endpoint (scaling with item count
  for prioritize/plan-day) instead of blanket caps, and folds `thoughts_token_count`
  into reported output tokens so cost monitoring stays accurate. Each call logs
  its `finish_reason` and thinking-token count. Dep `google-generativeai` →
  `google-genai`; default `GEMINI_MODEL` is now `gemini-3.6-flash`.

- **Strict JSON + structured output cuts wasted tokens.** `complete_json` now
  requests native JSON where the provider supports it — Gemini `response_mime_type:
  application/json`, OpenAI `response_format: {type: json_object}` — and passes a
  `response_schema` (the endpoint's Pydantic response model) to Gemini so output is
  constrained to the exact shape. Responses arrive without code fences or prose,
  trimming output tokens and making parsing reliable (the `_extract_json` fence
  fallback remains as a safety net). Anthropic is unchanged (no JSON-mode flag).

### Added

- **Multi-provider LLM (Anthropic / OpenAI / Gemini).** The AI service's
  generation features now work with any one of an Anthropic, OpenAI, or Google
  Gemini API key. `config.active_provider` selects the provider: `LLM_PROVIDER`
  (default `auto`) tries anthropic → openai → gemini by whichever key is present,
  or forces one. `llm.py` dispatches `complete_text`/`complete_json` to the active
  provider (each SDK lazily imported), and each records token usage for cost
  monitoring (C3). Embeddings/semantic search stay on Voyage (the DB vector column
  is fixed at 1024 dimensions). New deps: `openai`, `google-genai`.

- **AI usage & cost monitoring (Roadmap C3).** The AI service now reports each
  call's token usage on response headers (captured in `llm.py` via a ContextVar,
  no schema change). The server attributes usage to the requesting user with
  `AsyncLocalStorage` and records one `AiUsage` row per call, estimating USD cost
  from an env-overridable per-model price table (`utils/aiCost.js`); recording is
  best-effort and never breaks an AI call. `GET /api/ai/usage` returns per-user
  totals, a per-endpoint breakdown, and the last 7 days of spend, surfaced as an
  "AI usage & cost" card on the Analytics page.

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
