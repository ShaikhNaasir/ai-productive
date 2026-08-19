# Roadmap — Post-Launch Features

Base project (Phases 0–14) is complete; see `PLAN.md`. This file is the backlog
of new features. Each item is a small, independently shippable **slice** with its
own tests. Work top-down, one slice at a time, and only after plan approval
(see `CLAUDE.md` → Workflow rules). Nothing here is started until it is planned
and approved.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done.

## Current status (resume here) — updated 2026-08-18

**Shipped & pushed to `main`** (latest deploy commit `31c5416`): all of **Tier A
(A1–A4)**, **Tier B (B1–B4)**, **C2**, **C3**, plus **multi-provider LLM**
(Anthropic / OpenAI / Gemini — bring any one key). Every suite green:
server (Jest), ai-service (pytest), client (Vitest) + build; lint clean.

**`C1 — Google Calendar sync` is now complete** (C1.1 OAuth connect + token
storage, C1.2 two-way event sync, C1.3 client UI). It needs an OAuth 2.0 Client
(ID/secret) + `GOOGLE_REDIRECT_URI` set on the API service to activate; unset,
the integration stays disabled and core CRUD is unaffected. **Nothing else is
pending in the backlog.**

**Post-launch hardening (2026-08-18):** a security review (P1–P3) and an automated
24-item bug audit (`bug_remediation_plan.md`) have both shipped to `main` (PR #1).
The audit closed latent defects across access control, realtime auth, Google
Calendar sync, schedulers, cost/performance, and the client — see `CHANGELOG.md`
for the full list. Suites after remediation: server Jest 187, client Vitest 40,
ai-service pytest 35; lint clean; both packages 0 npm vulnerabilities.

**Deploy / ops notes:**
- Render applies schema via `prisma db push` (`render.yaml`), so all deferred
  `[~]` migrations (Task.parentId, focus_sessions, habits/habit_logs,
  task_shares, ai_usage, `Schedule.allDay`, and the three new composite indexes on
  Reminder / AiUsage / FocusSession) apply automatically on deploy — no migration
  files.
- Render env (productivity-ai): set **any one** of `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` / `GEMINI_API_KEY`; optional `LLM_PROVIDER` (default `auto`).
  These are `sync: false` placeholders in `render.yaml` — add real values in the
  dashboard and Manual Sync / redeploy (blueprint env changes are not auto-applied
  to a running service). Confirm via `GET /health` → `provider`.
- `VOYAGE_API_KEY` optional (semantic search); without it, search falls back to
  keyword. Embeddings are Voyage-only (DB vector column is 1024-dim).

**Where things live:** product spec `README.md`, phased base log `PLAN.md`,
change history `CHANGELOG.md`, agent rules `CLAUDE.md`.

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
Split into slices. Owner supplied OAuth 2.0 Client credentials (C1 unblocked).
- [x] **C1.1 — OAuth connect + token storage (backend).** `googleapis` dep; `GoogleAccount`
  model (per-user refresh token, `calendarId`, reserved `syncToken`); `config.google`
  (client id/secret/redirect URI — absent ⇒ integration disabled, endpoints 503);
  `services/googleCalendar.js` (OAuth2 client, auth URL, code exchange); routes
  `/api/google` — `GET /auth-url` (state = signed JWT of userId), `GET /callback`
  (session-less; verifies state, stores refresh token, redirects to client),
  `GET /status`, `DELETE /disconnect`. All user-scoped; degrades if Google is off.
  Migration deferred (`db push`).
- [x] **C1.2 — Two-way event sync.** `Schedule.googleEventId` + `GoogleAccount.lastSyncedAt`;
  `services/googleCalendar.js` event ops (list/insert/update/delete, incremental
  `syncToken`, 410 reset); `services/googleSync.js` `syncUser` (pull-then-push,
  Google-wins conflict, cancel⇒delete) + `deleteRemoteForSchedule` (best-effort,
  wired into `schedule.controller.remove`); DB-backed `googleSyncScheduler`
  (`GOOGLE_SYNC_INTERVAL_MS`, default 5 min, started only when configured) +
  on-demand `POST /api/google/sync`. Tests: `googleSync.test.js` (9) + sync
  endpoints in `google.test.js` (2). Migration deferred (`db push`).
- [x] **C1.3 — Client UI.** `googleService` (status/auth-url/sync/disconnect); Settings
  "Google Calendar" card (Connect → OAuth redirect, connected state, Sync now,
  Disconnect; reads `?google=connected`); "Synced" badge on Google-linked schedule
  events in the Calendar (server `/calendar` now returns `googleEventId` in meta).
  Tests: `googleCalendar.test.jsx` (4). Client 24 green, lint clean, build OK.

### C2 — Shared / team tasks ✅
Split into two slices.
- [x] **C2.1 — Sharing model + backend.** `TaskShare` (VIEW/EDIT, unique per task+user); `services/taskAccess.js` grants owner-or-shared access (subtasks inherit parent shares); endpoints `POST /api/tasks/:id/share`, `GET /:id/shares`, `DELETE /:id/share/:userId`, `GET /api/tasks/shared`; EDIT sharees can update/complete/break down, delete stays owner-only. Server 106 tests green, lint clean. Migration deferred (`db push`).
- [x] **C2.2 — Client.** Per-task Share dialog (email + VIEW/EDIT role, list/revoke shares) + a "Shared" tab loading tasks shared with me; VIEW is read-only, EDIT can edit/complete, delete/share stay owner-only; owner badge shown. Client 19 tests green, lint clean, build OK.

### C3 — AI usage & cost monitoring ✅
- [x] AI service reports token usage per call via response headers (`llm.py` ContextVar; `X-AI-Input/Output-Tokens`, `X-AI-Model`).
- [x] Server attributes usage to the user via `AsyncLocalStorage` and records an `AiUsage` row per call (`utils/aiCost.js` estimates USD from an env-overridable price table); best-effort, never breaks a call.
- [x] `GET /api/ai/usage` — per-user totals, per-endpoint breakdown, last-7-days spend; "AI usage & cost" card on Analytics.
- [x] Tests: pytest usage headers (2) + `aiCost`/usage aggregation (Jest, 6) + Analytics card (Vitest, 1); `fakePrisma` gains `aiUsage`. ai-service 15 green, server 112 green, client 20 green, lint clean, build OK.
- [~] DB migration: schema validates + `prisma generate` OK offline. `prisma migrate dev` deferred — needs live Supabase `DATABASE_URL` (standing blocker; Render uses `db push`).

## Tier D — Admin panel (in progress)

Custom, in the existing stack (role-gated Express API + React `/admin` pages) —
not a library, so admins see **metadata + aggregates only**, never private user
content (task titles, note bodies). One sanctioned exception to per-user scoping,
centralized behind `requireAdmin` and audited. Bootstrap admins via an
`ADMIN_EMAILS` env allowlist (kept out of this public repo — real value lives only
in `.env` / the host env; `render.yaml` uses `sync: false`). Anticipates a future
free/paid SaaS tier (`User.plan` scaffold; billing is a separate later epic).

- [x] **D1 — Roles + guard foundation.** `Role` (USER/ADMIN) + `UserStatus`
  (ACTIVE/DISABLED) on `User`; `requireAdmin` middleware; `requireAuth` now loads
  the role and locks out DISABLED accounts (403 everywhere, and at login);
  `ADMIN_EMAILS` allowlist bootstraps admins on register and promotes them on
  login (never auto-demotes). `/api/admin/ping` is the first guarded route. Auth
  responses carry `user.role`. Tests: `admin.test.js` (5) — bootstrap, 403 for
  non-admins, login promotion, disabled lockout, unauth 401. Server 196 green,
  lint clean. Migration deferred (`db push`): `users.role`, `users.status`.
- [x] **D2 — Metrics + users read API.** `GET /api/admin/metrics` (user totals +
  7/30d signups + active-today + disabled, plan breakdown, content counts, AI spend
  via `aiUsage.aggregate`), `GET /api/admin/users` (paginated, `search`/`role`/
  `status`/`plan` filters, metadata-only projection), `GET /api/admin/users/:id`
  (per-user counts + AI aggregate). No private content anywhere. Added `User.plan`
  (FREE/PAID) + `planRenewsAt` + `lastActiveAt` (stamped throttled in `requireAuth`).
  `fakePrisma` gained `skip` + a minimal `aggregate`. Tests: `admin.test.js` +5
  (metrics/list/search/drill-down/gating, all asserting no content leak). Server 201
  green, lint clean. Migration deferred (`db push`): `users.plan/planRenewsAt/lastActiveAt`.
- [x] **D3 — Moderation + audit.** `POST /users/:id/{disable,enable,force-logout,role,plan}`
  and `DELETE /users/:id` (soft by default → `status=DELETED`; `hard:true` cascades) +
  `GET /audit`. Disable/delete/force-logout bump `tokenVersion` + `disconnectUser`.
  Guards: no self-disable/delete/self-revoke, and can't remove the last active admin.
  Every mutation writes an `AdminAuditLog` row (no FK, survives hard-deletes).
  `UserStatus` gains `DELETED`; auth blocklists DISABLED/DELETED. Tests: `admin.test.js`
  +8. Server 209 green, lint clean. `db push`: `admin_audit_logs` table, `UserStatus.DELETED`.
- [x] **D4 — Admin client.** `adminService` + `AdminRoute` (role-gated) + admin-only
  `Shield` nav link. Pages: `/admin` dashboard (metric tiles), `/admin/users`
  (table, search + status filter, pagination, row → detail), `/admin/users/:id`
  (metadata + counts + moderation buttons with confirms: disable/enable, force-logout,
  grant/revoke admin, set plan, soft/hard delete), `/admin/audit` (paginated trail).
  Tests: `adminPanel.test.jsx` (4). Client 45 green, lint clean, build OK.
- [x] **D5 — SaaS billing (Razorpay).** `config/plans.js` entitlements (single
  source of truth: FREE vs PAID caps for AI monthly spend, AI rate, tasks, notes,
  doc size) + `isPaid`/`effectivePlan` (expired PAID → FREE). Gating: plan-aware
  `aiLimiter` + `enforceAiBudget` (month-to-date LLM spend → 402), task/note create
  + doc upload quota (402). `services/razorpay.js` (REST via axios + `crypto`;
  off-unless-keys-set → 503). `/api/billing/{status,checkout,verify,cancel}` +
  raw-body HMAC-verified idempotent `POST /webhook` (mounted before `express.json`;
  `BillingEvent` ledger dedupes redeliveries). Client: `billingService` + Settings
  "Plan & billing" card (usage bars, Razorpay Checkout upgrade, cancel); admin gains
  a plan filter + subscription status. Schema: `User.razorpay*`/`subscriptionStatus`,
  `billing_events`. Tests: server +13 (`plans`,`billing`), client +3 (`billing`).
  Server Jest 221, client Vitest 48 green; lint + build OK. **Owner:** create a
  Razorpay Plan + webhook, set `RAZORPAY_*` on Render (`db push` applies the schema).

## Tier E — Account security

- [x] **E1 — Email verification.** New accounts start unverified; a hashed, expiring
  token is emailed (`services/mailer.js` Resend via axios, no dep;
  `services/emailVerification.js` issue/send/verify). `POST /auth/verify-email`
  (public) + `POST /auth/resend-verification`. `requireVerified` middleware hard-blocks
  key actions (AI, task share, billing checkout, doc upload, Google connect/sync) with
  403 `EMAIL_UNVERIFIED` — but only when email is configured (can't require what you
  can't deliver), and admins are exempt. Client: `/verify-email` page + a persistent
  Layout "Verify your account" banner (resend / refresh). Pre-existing accounts are
  grandfathered verified on boot. Schema: `User.emailVerified`/`emailVerifyTokenHash`/
  `emailVerifyExpires`. Tests: server +9, client +5. Server Jest 231, client Vitest 53
  green; lint + build OK. **Owner:** set `RESEND_API_KEY` on Render to turn it on.
- [x] **E2 — Two-factor auth (TOTP).** Optional per-user 2FA. `services/totp.js`
  (RFC 6238 on Node `crypto`, no dep) + `services/twoFactor.js` (hashed single-use
  backup codes). Two-step enroll: `POST /auth/2fa/setup` (pending secret + `qrcode`
  data-URI + otpauth URI) → `POST /auth/2fa/enable` (confirm code → enable + 10 backup
  codes shown once); `POST /auth/2fa/disable` (code required). Login is now two-step:
  password → `{ twoFactorRequired, challengeToken }` (short-lived) → `POST /auth/2fa/login`
  (TOTP or backup code) → session token. Client: Settings "Two-factor authentication"
  card (QR enroll, backup codes) + a second-factor step on the login page. Schema:
  `User.twoFactorEnabled`/`twoFactorSecret`/`twoFactorPendingSecret`/`twoFactorBackupCodes`.
  New dep: `qrcode` (server, QR only). Tests: server +9, client +2. Server Jest 240,
  client Vitest 55 green; lint + build OK.

## Tier F — Hardening & polish

- [x] **F1 — Global rate limiting + Calendar edit/delete.** A coarse per-client
  `apiLimiter` (default 200 req/min, keyed by user id or IP) now fronts every `/api/*`
  route, not just auth + AI (webhook exempt). Calendar schedules/reminders gained
  inline edit + delete (the API already supported it; only the UI was read-only);
  reminder `recurrence` is now surfaced in the calendar feed so it can be edited.
  Tests: server +1, client +2. Server Jest 241, client Vitest 57 green; lint + build OK.
- [x] **F2 — Auth hardening.** Email change (`PATCH /auth/profile`) now resets
  `emailVerified` (unless the new address is an allowlisted admin) and re-sends the
  verification link — closing a gap where a verified user could switch to an unowned
  address and stay verified. `POST /auth/resend-verification` enforces a 60s per-user
  cooldown (429). `POST /auth/2fa/login` gained a per-account failed-attempt throttle
  (5 / 15 min → 429), on top of the IP + global limiters. The TOTP secret is now
  encrypted at rest (AES-256-GCM, `services/secretCrypto.js`, key derived from
  `JWT_SECRET` or `TWO_FACTOR_ENC_KEY`; legacy plaintext still readable). Tests:
  server +3. Server Jest 244 green; lint clean.
- [ ] **F3 — Cleanup.** One-time gate on the email-verify grandfather backfill;
  backfill missing tests (verify-expired, billing webhook downgrade, 2FA disable via
  backup, challenge-purpose rejection); register "check your email" confirmation UI.
