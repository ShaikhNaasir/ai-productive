# Implementation Plan — AI-Powered Personal Productivity Assistant

Source of truth: `README.md`. This plan divides that spec into small, ordered phases.
Nothing here adds requirements beyond the README.

## Stack decisions (locked)

| Concern | Choice | Notes |
|---------|--------|-------|
| Database | **Supabase (managed PostgreSQL)** | Accessed from Express via connection string + Prisma ORM. |
| Auth | **Custom JWT + bcrypt in Express** | Per README. Supabase used as the DB host only, *not* Supabase Auth. |
| ORM | **Prisma** | Migrations, typed models. |
| Vector store | **pgvector** | Postgres extension enabled in Supabase — one DB for data + embeddings. |
| AI provider | **Anthropic Claude** | `claude-opus-4-8` for reasoning, `claude-haiku-4-5` for cheap/fast calls; embeddings via a supported embeddings model. |
| Frontend | React + shadcn/ui + Vite | Per README. |
| Backend | Node.js + Express | Per README. |
| AI service | Python + FastAPI + LangChain | Separate service. Called by Express, never directly by the browser. |
| Realtime | Socket.IO | Reminder/notification push. |

## Architecture

```
React (shadcn/ui)
   |  REST + JWT
   v
Express API  <---- source of truth, owns auth + all DB access
   |  \
   |   \__ Socket.IO (live reminders) --> browser
   |
   |  server-to-server (internal, keyed)
   v
FastAPI ai-service --> Anthropic Claude
                   --> pgvector (embeddings / semantic search)
```

Rules enforced across every phase:
- Every task/note/schedule/reminder row is scoped to a `userId`; queries always filter by the authenticated user (README challenges 6, 7).
- AI output is parsed and validated (schema) before any DB write (challenge 2).
- App degrades gracefully if `ai-service` is unreachable — core CRUD still works (challenge 9).
- Reminders fire reliably via a persistent scheduler, not in-memory only (challenge 3).

## Folder layout (from README, extended)

```
productivity-assistant/
├── client/        # React + shadcn/ui (Vite)
├── server/        # Express API, Prisma, auth, Socket.IO
├── ai-service/    # FastAPI: assistant, summarizer, task_planner
├── PLAN.md
└── README.md
```

## Phases

Each phase is small, independently reviewable, and leaves the app in a working state.

### Phase 0 — Scaffold & tooling
- [x] `git init`, root `.gitignore`, root README pointer.
- [x] Create `client/`, `server/`, `ai-service/` skeletons.
- [x] `.env.example` in each service (no secrets committed).
- [x] Document local run commands (`DEV.md`).

### Phase 1 — Database & Express boot
- [x] Prisma init against Supabase connection string (schema + `datasource`).
- [x] Enable `pgvector` extension (`extensions = [vector]`, embedding columns).
- [x] Schema: `User`, `Task`, `Note`, `Schedule`, `Reminder` (+ embedding columns). Validated.
- [~] First migration. **BLOCKED**: needs live `DATABASE_URL`/`DIRECT_URL` (Supabase credentials). Schema validates + `prisma generate` succeeds offline; run `npx prisma migrate dev` once creds provided.
- [x] Express server boots, health route, error/404 middleware. Tests green.

### Phase 2 — Authentication ✅
- [x] bcrypt password hashing.
- [x] JWT issue/verify, auth middleware.
- [x] Routes: register, login, logout, `GET /me`, `PATCH /profile`, `POST /change-password`. 11 tests green.

### Phase 3 — Task & Note CRUD (REST, user-scoped) ✅
- [x] Task CRUD: create/edit/delete/complete, priority, status, dueDate, tags. Case-insensitive priority/status input.
- [x] Note CRUD: create/edit/delete, categories, tags, pin toggle, keyword search.
- [x] All endpoints require auth and filter by `userId` (cross-user access test green).

### Phase 4 — Schedule / Calendar & Reminders (REST) ✅
- [x] Schedule/event CRUD (start/end validation).
- [x] Reminder CRUD with fire-time (`remindAt`, `sent`, `upcoming` filter).
- [x] Calendar aggregation endpoint `/api/calendar` (tasks + schedules + reminders, sorted). 29 tests green.

### Phase 5 — Frontend shell ✅
- [x] React + Vite + Tailwind + shadcn/ui primitives (button/input/card/label/textarea/badge), dark-mode via ThemeProvider.
- [x] Auth pages (login/register), JWT token storage, axios interceptors, protected routes.
- [x] Dashboard layout shell + sidebar navigation. Build + 3 tests + lint green.

### Phase 6 — Core feature UI ✅
- [x] `TaskList.jsx` wired to task API (create/filter/complete/delete, priority badges).
- [x] `Notes.jsx` wired to note API (create/search/pin/delete, tags, categories).
- [x] `Calendar.jsx` wired to calendar API (grouped by day, add event).
- [x] Responsive `.task-card` styling per README. Build + lint + tests green.

### Phase 7 — AI service foundation ✅
- [x] FastAPI boot, `main.py`, internal auth key (`X-Internal-Key`) on all feature routes.
- [x] Anthropic client wrapper (`llm.py`) with JSON extraction + graceful `LLMUnavailable` → 503.
- [x] `summarizer.py` → `/summarize` (note → key points + summary).
- [x] `task_planner.py` → `/parse-task` (NL → validated structured task) + `/prioritize`, `assistant.py` → `/chat`, `embeddings.py` → `/embed` scaffolded. 9 pytest green.

### Phase 8 — AI assistant wiring ✅
- [x] Express proxies to ai-service (`aiClient.js`) with graceful 503 fallback. Tested.
- [x] `/chat`: Express gathers tasks/notes/schedules/reminders as context, AI answers.
- [x] `ChatAssistant.jsx` chat UI (suggestions, history, error states).
- [x] NL task creation end-to-end: `/api/ai/tasks` parses + persists; "AI Add" in TaskList; note "Summarize" button. 34 server tests green.

### Phase 9 — AI prioritization ✅
- [x] `/api/ai/prioritize` endpoint (deadline, importance, effort, dependencies, workload).
- [x] `PriorityPanel.jsx` surfaces 🔥/🟡/🟢 High/Medium/Low recommendations with reasons. Build+lint green.

### Phase 10 — Semantic search ✅
- [x] Generate embeddings on note/task create/update, store in pgvector (`embeddingService`, gated by `EMBEDDINGS_ENABLED`).
- [x] `/api/search` endpoint: semantic (pgvector `<=>`) with keyword fallback, user-scoped. HNSW index SQL provided.
- [x] Search UI (`Search.jsx`) shows meaning-based/keyword results. 37 server tests green.

### Phase 11 — Realtime reminders ✅
- [x] Socket.IO server (JWT-authed handshake, per-user rooms) + client connection.
- [x] Persistent DB-backed reminder scheduler → emits at fire-time, marks sent. 39 server tests green; server boot-smoke OK.
- [x] In-app notification bell + dropdown (`NotificationContext`, socket.io-client).

### Phase 12 — Productivity dashboard & analytics ✅
- [x] Metrics: completed, pending, overdue, completion rate, weekly progress. (Time-spent omitted — no time-tracking field in the data model; noted, not invented.)
- [x] Charts (recharts): per-day completed, category workload, status breakdown; dashboard weekly bar. 41 server tests green.

### Phase 13 — Polish ✅
- [x] Full responsive pass (`@media max-width:768px`, `.task-card` width, mobile nav row added).
- [x] Dark mode toggle (persisted, `.dark` class).
- [x] Loading/empty/error states across pages; AI-failure UX (503 → friendly messages). Chunk-split build.

### Phase 14 — Deployment ✅ (configs) / ⛔ (live deploy blocked)
- [x] Client → Vercel (`client/vercel.json`).
- [x] Server + ai-service → Render (`render.yaml` blueprint + Dockerfiles).
- [~] Supabase Postgres (prod), migrations applied. **BLOCKED**: needs live `DATABASE_URL` + host access. `prisma migrate deploy` command wired in Dockerfile/render.yaml.
- [x] Env/secret config + deploy docs in README (`## Running & Deployment`).
- [~] Actual cloud deploy. **BLOCKED**: needs Vercel/Render/Supabase/Anthropic/Voyage accounts + keys.

## Out of base scope (README "Bonus" / "Enhancement")

Voice commands, document upload + summarization, multi-language, PWA, calendar sync, shared/team tasks, Pomodoro, habit tracking, AI cost monitoring. Deferred until Phases 0–14 complete.

## Progress

Status: **Phases 0–14 complete.** All code-buildable work done and verified offline.

Verification (final):
- Server: 41 Jest tests passing, ESLint clean, `prisma validate` OK, boot-smoke OK.
- AI service: 9 pytest passing.
- Client: Vitest passing, `vite build` OK, ESLint clean.

Outstanding blockers (external credentials only — cannot be resolved in-repo):
1. `prisma migrate dev/deploy` — needs live Supabase `DATABASE_URL`/`DIRECT_URL`.
2. Live LLM calls — need `ANTHROPIC_API_KEY` (unit tests mock the LLM).
3. Semantic search at runtime — needs `VOYAGE_API_KEY` + `EMBEDDINGS_ENABLED=true` (keyword fallback works + tested).
4. Cloud deploy — needs Vercel/Render/Supabase accounts. All config committed.

## Post-launch improvements

- **UI**: minimalist black & white theme (grayscale tokens, theme-aware charts).
- **Editing**: inline edit for tasks (title/priority/due) and notes (title/content/category/tags) — closed a real gap (previously create/delete only).
- **Task status**: per-task Pending / In Progress / Completed dropdown.
- **Search UX**: debounced notes search; delete confirmation on tasks/notes.
- **Auth UX**: password show/hide toggle on login/register.
- **Backend hardening**: `helmet` (security headers), `compression` (gzip), `express-rate-limit` on `/api/auth` (brute-force throttle, disabled in tests), `trust proxy` for Render.
- **Semantic search**: keyword fallback when semantic returns empty; `POST /api/ai/reindex` + "Rebuild search index" button to backfill embeddings.
- **Render**: one-click blueprint with managed pgvector Postgres + `db push` (no migration files needed) + auto-wired URLs.
