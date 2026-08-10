# Getting Started — AI-Powered Personal Productivity Assistant

Everything you need to install, run, and use the app in one place.
For the spec see `README.md`; for the phased build log see `PLAN.md`.

The project is three services:

| Service | Folder | Stack | Port |
|---------|--------|-------|------|
| Client | `client/` | React + Vite + Tailwind + shadcn/ui | 5173 |
| API | `server/` | Node.js + Express + Prisma | 4000 |
| AI service | `ai-service/` | Python + FastAPI + Anthropic | 8000 |

---

## 1. Prerequisites

- **Node.js** ≥ 20 and npm ≥ 10
- **Python** ≥ 3.11
- A **PostgreSQL** database with the **pgvector** extension — easiest is a free [Supabase](https://supabase.com) project
- An **Anthropic API key** — for the AI features ([console.anthropic.com](https://console.anthropic.com))
- *(optional)* a **Voyage AI key** — only for semantic (meaning-based) search

> The app runs without the AI keys: task/note/calendar/reminder CRUD all work, and search falls back to keyword matching. AI buttons will show a friendly "unavailable" message until keys are set.

---

## 2. Configuration

Each service has a `.env.example`. Copy it to `.env` and fill in the values.

### `server/.env`
```
DATABASE_URL="postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true"   # Supabase pooled URI
DIRECT_URL="postgresql://USER:PASS@HOST:5432/postgres"                    # Supabase direct URI (migrations)
JWT_SECRET="a-long-random-string"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
AI_SERVICE_URL="http://localhost:8000"
INTERNAL_API_KEY="pick-any-shared-secret"     # must match ai-service
EMBEDDINGS_ENABLED="false"                      # set true only with a Voyage key + pgvector
```

### `ai-service/.env`
```
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-4-8"
VOYAGE_API_KEY=""                               # optional, semantic search only
EMBEDDING_MODEL="voyage-3"
INTERNAL_API_KEY="pick-any-shared-secret"       # must match server
PORT=8000
```

### `client/.env`
```
VITE_API_URL="http://localhost:4000"
```

`INTERNAL_API_KEY` **must be identical** in `server/.env` and `ai-service/.env` — it is the shared secret that lets only the API call the AI service.

---

## 3. Install & run

Open three terminals.

### Terminal 1 — API (`server/`)
```bash
cd server
npm install
npx prisma migrate dev        # creates tables in your database
npm run dev                   # http://localhost:4000
```
After the first migration, enable semantic-search indexes (only if using pgvector):
```bash
psql "$DIRECT_URL" -f prisma/sql/pgvector_indexes.sql
```

### Terminal 2 — AI service (`ai-service/`)
```bash
cd ai-service
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# Windows Git Bash:    source .venv/Scripts/activate
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # http://localhost:8000
```

### Terminal 3 — Client (`client/`)
```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```

Open **http://localhost:5173** and register an account.

---

## 4. How to use

1. **Register / Sign in** — create an account; the session token is stored in the browser.
2. **Dashboard** — see completed / pending / overdue counts and a weekly-progress chart.
3. **Tasks**
   - Add manually (title, priority, due date), or
   - **AI Add**: type plain English like *"Prepare for my interview next Friday"* — the AI extracts the title, priority, and date and creates the task.
   - **Suggest priorities**: AI ranks your open tasks 🔥/🟡/🟢 with reasons.
   - Complete ✓ or delete 🗑 any task; filter by status.
4. **Notes** — create notes with categories and tags, pin important ones, search, and click ✨ to get an AI **key-points summary**.
5. **Calendar** — add events and reminders; it aggregates task deadlines, events, and reminders by day.
6. **Assistant** — chat: *"What do I need to finish today?"*, *"Which tasks should I prioritize?"*, *"Plan my day."* The assistant answers using your own tasks/notes/schedule.
7. **Reminders** — when a reminder's time arrives, the server pushes a live notification to the 🔔 bell in the header (Socket.IO).
8. **Search** — search by meaning (*"things related to my upcoming interview"*) across notes and tasks. Uses embeddings when configured, keyword matching otherwise.
9. **Settings** — update your name/email or change your password.
10. **Dark mode** — toggle with the moon/sun button in the header.

---

## 5. Running the tests

```bash
cd server     && npm test        # Jest + Supertest  (41 tests)
cd ai-service && .venv/Scripts/python -m pytest      # pytest (9 tests)
cd client     && npm test && npm run build           # Vitest + production build
```

---

## 6. Deployment (summary)

- **Client → Vercel**: `client/vercel.json` is preconfigured (Vite build + SPA rewrites). Set `VITE_API_URL` to your deployed API URL.
- **Server + AI service → Render**: the root `render.yaml` blueprint provisions both, with a generated shared `INTERNAL_API_KEY`. Dockerfiles are also provided for any container host (Railway, Fly, etc.).
- **Database → Supabase**: set `DATABASE_URL` / `DIRECT_URL`; migrations run automatically on deploy (`prisma migrate deploy`).

See the **Running & Deployment** section of `README.md` for the full secrets table.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing required environment variable: JWT_SECRET` | Create `server/.env` from the example. |
| AI buttons say "AI service is unavailable" | Start the ai-service and set `ANTHROPIC_API_KEY`; confirm `INTERNAL_API_KEY` matches on both sides. |
| `prisma migrate` fails to connect | Check `DATABASE_URL` / `DIRECT_URL`; use the Supabase **direct** URI for migrations. |
| Search returns keyword results only | Expected unless `EMBEDDINGS_ENABLED=true` **and** `VOYAGE_API_KEY` is set **and** pgvector indexes exist. |
| Reminders don't pop up | The scheduler polls every 30s; make sure the reminder time has passed and you're signed in (the socket authenticates with your token). |
