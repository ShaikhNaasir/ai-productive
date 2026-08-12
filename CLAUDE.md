# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project

AI-Powered Personal Productivity Assistant — full-stack app for tasks, notes,
schedules, reminders, daily priorities, and AI assistance.

- `README.md` — product spec (source of truth for *what* to build).
- `PLAN.md` — phased build log for the base project (Phases 0–14, complete).
- `ROADMAP.md` — post-launch feature backlog. Work items come from here.

## Stack

- **client/** — React + Vite + Tailwind + shadcn/ui. Tests: Vitest.
- **server/** — Node.js + Express + Prisma (PostgreSQL/Supabase + pgvector) + Socket.IO. Tests: Jest + Supertest.
- **ai-service/** — Python + FastAPI + Anthropic Claude + LangChain. Tests: pytest. Called only server-to-server via `X-Internal-Key`; never from the browser.

## Invariants (never break these)

- Every task/note/schedule/reminder row is scoped to `userId`; queries always filter by the authenticated user.
- AI output is schema-validated before any DB write.
- The app degrades gracefully if `ai-service` is unreachable — core CRUD keeps working; search falls back to keyword.
- Reminders fire via the persistent DB-backed scheduler, not in-memory only.

## Commands

- Server: `cd server && npm test` · `npm run lint` · `npm run dev`
- AI service: `cd ai-service && .venv/Scripts/python -m pytest`
- Client: `cd client && npm test` · `npm run lint` · `npm run build`

## Workflow rules

- Always PLAN before coding. Wait for my approval.
- One slice at a time. Never work ahead in the roadmap.
- Write tests with the feature, not after.
- After coding: run typecheck + lint + tests. Fix before reporting done.
- Never commit failing code.
- Before creating any util/hook/component, grep for an existing one. Reuse.
- Match existing patterns in the codebase. Don't modernize unasked.
- Ask before assuming. If you need to see a file, say so.
