-- RAG plan Phase A: hand-labeled retrieval ground truth.
-- Additive only: two enums + the match_labels table. Nothing existing is touched.

CREATE TYPE "MatchLabelValue" AS ENUM ('GREAT', 'OK', 'BAD');
CREATE TYPE "MatchLabelSource" AS ENUM ('HUMAN', 'FEEDBACK');

CREATE TABLE "match_labels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "label" "MatchLabelValue" NOT NULL,
    "reason" TEXT,
    "source" "MatchLabelSource" NOT NULL DEFAULT 'HUMAN',
    "category" TEXT,
    "seniority" TEXT,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "match_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_labels_userId_jobId_key" ON "match_labels" ("userId", "jobId");
CREATE INDEX "match_labels_userId_idx" ON "match_labels" ("userId");

ALTER TABLE "match_labels"
    ADD CONSTRAINT "match_labels_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_labels"
    ADD CONSTRAINT "match_labels_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
