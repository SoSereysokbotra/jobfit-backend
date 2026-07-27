-- Phase B (hybrid retrieval): add a full-text (BM25-style) search vector to jobs.
-- Generated STORED column = auto-maintained from title + description, computed for
-- all existing rows at ALTER time (no backfill needed). GIN index for fast @@ search.

ALTER TABLE "jobs" ADD COLUMN "searchTsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX "jobs_searchTsv_idx" ON "jobs" USING GIN ("searchTsv");
