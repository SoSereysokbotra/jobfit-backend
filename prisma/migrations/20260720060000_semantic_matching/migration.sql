-- Phase 3: semantic job matching (pgvector).
-- Adds BGE-M3 (1024-dim) embedding columns to jobs + profiles, HNSW cosine
-- indexes for fast nearest-neighbour search, and a seeker-facing recommendations
-- table keyed by (userId, jobId).

-- pgvector extension (available on Supabase Postgres).
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding columns (nullable: populated asynchronously on publish / profile change).
ALTER TABLE "jobs" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "profiles" ADD COLUMN "embedding" vector(1024);

-- Approximate-NN indexes (cosine distance). HNSW builds instantly on empty columns.
CREATE INDEX "jobs_embedding_hnsw_idx" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "profiles_embedding_hnsw_idx" ON "profiles" USING hnsw ("embedding" vector_cosine_ops);

-- Recommendations (one row per candidate/job pair the batch scored).
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB,
    "reasonExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recommendations_userId_jobId_key" ON "recommendations" ("userId", "jobId");
CREATE INDEX "recommendations_userId_score_idx" ON "recommendations" ("userId", "score");

ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
