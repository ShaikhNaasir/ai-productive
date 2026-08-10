-- Run once after `prisma migrate deploy` to add approximate-nearest-neighbor
-- indexes for semantic search. Requires the pgvector extension (created by the
-- migration via `extensions = [vector]`).
--
--   psql "$DIRECT_URL" -f prisma/sql/pgvector_indexes.sql
--
-- HNSW with cosine distance matches the `<=>` operator used in search.controller.js.

CREATE INDEX IF NOT EXISTS notes_embedding_idx
  ON "notes" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS tasks_embedding_idx
  ON "tasks" USING hnsw (embedding vector_cosine_ops);
