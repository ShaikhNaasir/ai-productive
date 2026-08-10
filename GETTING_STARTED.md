# Getting Started — AI-Powered Personal Productivity Assistant

Install, run (development **and** production), and use the app — all in one place.
For the spec see `README.md`; for the phased build log see `PLAN.md`.

Three services:

| Service | Folder | Stack | Dev port | Prod port |
|---------|--------|-------|:--------:|:---------:|
| Client | `client/` | React + Vite + Tailwind + shadcn/ui | 5173 | 4173 (preview) / 80 (nginx) |
| API | `server/` | Node.js + Express + Prisma | 4000 | 4000 |
| AI service | `ai-service/` | Python + FastAPI + Anthropic | 8000 | 8000 |

---

## 1. Prerequisites

- **Node.js** ≥ 20 and npm ≥ 10
- **Python** ≥ 3.11
- A **PostgreSQL** database with the **pgvector** extension. Pick one:
  - **Supabase** (cloud, free) — pgvector is built in, or
  - **Docker** — `docker compose up` brings up a bundled `pgvector/pgvector` Postgres (see §5), or
  - a **local Postgres** — see §2b for step-by-step (with or without pgvector).
- *(optional)* **Anthropic API key** — for AI features
- *(optional)* **Voyage AI key** — for semantic (meaning-based) search

> The app degrades gracefully: without AI keys, task/note/calendar/reminder CRUD all work and search falls back to keyword matching.

---

## 2. One-time setup

From the repo root:

```bash
npm install        # installs the root orchestrator (concurrently)
npm run setup      # installs server + client deps, creates the Python venv, installs ai-service deps
```

`npm run setup` runs the Windows venv path. On macOS/Linux run `npm run setup:ai:unix` instead of the ai step.

**Environment files** — ready-to-edit `.env` files already exist in each service (gitignored). Edit these two values before running:

- `server/.env` → set `DATABASE_URL` and `DIRECT_URL` to your Postgres.
- `ai-service/.env` → set `ANTHROPIC_API_KEY` (optional; leave blank to run without AI).

`INTERNAL_API_KEY` is pre-set to the same value (`dev-internal-key`) in both — keep them matching.

**Create the database tables** (once your `DATABASE_URL` points at a real DB):

```bash
npm --prefix server run db:push      # fast: pushes the schema directly (best for dev)
# or, to use versioned migrations:
npm --prefix server run prisma:migrate   # creates prisma/migrations and applies them
```

---

## 2b. Local PostgreSQL (no Supabase, no Docker)

Install Postgres on your machine and point the app at it.

### Install (Windows)

1. Download the installer from <https://www.postgresql.org/download/windows/> (EDB, PostgreSQL 16).
2. Run it. Set a password for the `postgres` superuser and keep port **5432**. (pgAdmin is included and optional.)
3. Open **SQL Shell (psql)** from the Start menu (or `"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres`) and create the database:

   ```sql
   CREATE DATABASE productivity;
   ```

4. Set the connection strings in `server/.env` (replace `YOURPASS`):

   ```
   DATABASE_URL="postgresql://postgres:YOURPASS@localhost:5432/productivity"
   DIRECT_URL="postgresql://postgres:YOURPASS@localhost:5432/productivity"
   ```

> macOS: `brew install postgresql@16 && brew services start postgresql@16`.
> Linux: `sudo apt install postgresql` then `sudo -u postgres createdb productivity`.

### The pgvector requirement — two options

The Prisma schema declares vector columns (for semantic search), so a **plain** Postgres will reject `db push` until pgvector exists. Choose one:

**Option A — Install pgvector (keeps semantic search available).**
Enable it once per database:

```sql
\c productivity
CREATE EXTENSION IF NOT EXISTS vector;
```

If that errors with *"extension 'vector' is not available"*, install the extension first:

- *Prebuilt (easiest on Windows):* download a pgvector Windows build matching your PG version, then copy `vector.dll` into `C:\Program Files\PostgreSQL\16\lib\` and `vector.control` + `vector--*.sql` into `C:\Program Files\PostgreSQL\16\share\extension\`, then re-run `CREATE EXTENSION vector;`.
- *Build from source (x64 Native Tools Command Prompt for VS):*
  ```bat
  set "PGROOT=C:\Program Files\PostgreSQL\16"
  git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
  cd pgvector
  nmake /F Makefile.win
  nmake /F Makefile.win install
  ```
- *macOS/Linux:* `sudo apt install postgresql-16-pgvector` (Debian/Ubuntu) or `brew install pgvector`.

Then push the schema:

```bash
npm --prefix server run db:push
```

**Option B — Skip pgvector (fastest; semantic search stays in keyword mode).**
Semantic search is off by default (`EMBEDDINGS_ENABLED=false`), so you lose nothing for normal testing. Temporarily remove the vector bits from `server/prisma/schema.prisma`:

1. In the `datasource db` block, delete the line `extensions = [vector]`.
2. Comment out the two `embedding Unsupported("vector(1024)")?` lines (in `model Task` and `model Note`).

Then:

```bash
npm --prefix server run db:push
```

Everything works; the **Search** page uses keyword matching (its default). Revert those three lines whenever you install pgvector.

---

## 3. Development mode  ▶ (what you asked for)

**Start all three services with one command** (hot reload on all):

```bash
npm run dev
```

- Client → http://localhost:5173
- API → http://localhost:4000
- AI service → http://localhost:8000

Output from all three is interleaved and color-tagged (`server`/`ai`/`client`). Ctrl-C stops them all.

Run one service at a time if you prefer:

```bash
npm run dev:server     # nodemon (auto-restart)
npm run dev:client     # vite dev server
npm run dev:ai         # uvicorn --reload   (Windows; use dev:ai:unix on macOS/Linux)
```

Open http://localhost:5173 and register an account.

---

## 4. Production mode (run the prod build locally)

```bash
npm run build          # builds the client (dist/) + generates the Prisma client
npm start              # runs all three in production mode
```

`npm start` does:
- **server**: `prisma migrate deploy` then `NODE_ENV=production node server.js` on :4000
- **ai**: `uvicorn` (no reload) on :8000
- **client**: `vite preview` serving the built `dist/` on :4173

> Production uses versioned migrations (`migrate deploy`), so generate them once with
> `npm --prefix server run prisma:migrate` (needs DB access) and commit `server/prisma/migrations/`.
> For a quick prod-style run without migrations, use `npm --prefix server run db:push` first.

Production env: copy `server/.env.production.example` and `client/.env.production.example`
and set the real hosts/secrets (strong `JWT_SECRET`, deployed `CLIENT_ORIGIN`, `VITE_API_URL`, etc.).

---

## 5. Docker (self-contained local stack, incl. database)

If you have Docker, this is the zero-config way to run everything **with a real pgvector Postgres** — no Supabase needed:

```bash
cp .env.docker.example .env.docker    # add ANTHROPIC_API_KEY if you want AI
docker compose up
```

Brings up: `db` (pgvector Postgres on :5432), `server` (:4000, auto `prisma db push`), `ai` (:8000), `client` (:5173), all with hot reload. Data persists in a named volume.

---

## 6. How to use

1. **Register / Sign in** — the session token is stored in the browser.
2. **Dashboard** — completed / pending / overdue counts + weekly-progress chart.
3. **Tasks** — add manually, or **AI Add** a plain-English task (*"Prepare for my interview next Friday"*); **Suggest priorities** ranks open tasks 🔥/🟡/🟢; complete/delete/filter.
4. **Notes** — categories, tags, pin, search; ✨ button = AI key-points summary.
5. **Calendar** — add events and reminders; aggregates deadlines + events + reminders by day.
6. **Assistant** — chat grounded in your own data: *"What do I need to finish today?"*, *"Plan my day."*
7. **Reminders** — fire as live 🔔 notifications (Socket.IO) when their time arrives.
8. **Search** — search by meaning across notes and tasks (keyword fallback without a Voyage key).
9. **Settings** — update name/email or change password.
10. **Dark mode** — moon/sun toggle in the header.

---

## 7. Tests

```bash
npm test                                            # server (Jest) + client (Vitest)
cd ai-service && .venv/Scripts/python -m pytest     # ai-service (pytest)
```

Server: 41 · AI service: 9 · Client: 3 + production build.

---

## 8. Deployment (cloud)

- **Client → Vercel**: `client/vercel.json` (Vite build + SPA rewrites). Set `VITE_API_URL`.
- **Server + AI service → Render**: root `render.yaml` blueprint (Node + Python, shared `INTERNAL_API_KEY`). Dockerfiles provided for any container host (also a client `Dockerfile` + `nginx.conf`).
- **Database → Supabase**: set `DATABASE_URL`/`DIRECT_URL`; `prisma migrate deploy` runs on deploy. After the first deploy, run `server/prisma/sql/pgvector_indexes.sql` for semantic-search indexes.

Full secrets table is in the **Running & Deployment** section of `README.md`.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing required environment variable: JWT_SECRET` | It's already set in `server/.env`; make sure you didn't delete it. |
| `prisma db push` / `migrate` can't connect | Fix `DATABASE_URL`/`DIRECT_URL`; ensure Postgres has the `vector` extension (Supabase does; local needs `CREATE EXTENSION vector`). |
| AI buttons say "AI service is unavailable" | Set `ANTHROPIC_API_KEY` in `ai-service/.env`; confirm `INTERNAL_API_KEY` matches on both sides. |
| `dev:ai` fails: uvicorn not found | Run `npm run setup:ai` (creates the venv). On macOS/Linux use `npm run dev:ai:unix`. |
| Search only returns keyword results | Expected unless `EMBEDDINGS_ENABLED=true` + `VOYAGE_API_KEY` set + pgvector indexes exist. |
| Reminders don't pop up | Scheduler polls every 30s; the reminder time must have passed and you must be signed in. |
