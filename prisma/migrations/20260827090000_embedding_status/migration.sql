-- Embedding failures were invisible, and therefore permanent.
--
-- MatchingEmbeddingService catches an AiServiceError, logs a warning and returns nulls.
-- A job ingested during an AI outage never got a vector; a profile edited during one kept
-- a stale vector. There was no status column, no queue, no backfill trigger and no
-- user-facing signal — so that row was silently unmatchable forever, and the only symptom
-- was an empty recommendations page indistinguishable from "no jobs match you"
-- (docs/AI_DEGRADATION_PLAN.md §5, §7).
--
-- These columns make the failure a fact the system can see, report and act on.
--
-- Additive and safe on a populated table. Existing rows are back-filled by inspecting the
-- vector itself, which is the only honest source: a row WITH an embedding is SUCCESS, a
-- row without one has simply never been embedded (PENDING). Nothing is marked FAILED,
-- because we have no evidence any past attempt failed — inventing that would be exactly
-- the kind of unfounded claim this column exists to prevent.

CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

ALTER TABLE "profiles"
  ADD COLUMN "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "embeddedAt"      TIMESTAMP(3),
  ADD COLUMN "embeddingError"  TEXT;

ALTER TABLE "jobs"
  ADD COLUMN "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "embeddedAt"      TIMESTAMP(3),
  ADD COLUMN "embeddingError"  TEXT;

-- Back-fill from the vector that is already there. `embeddedAt` is left NULL rather than
-- guessed: we know the embedding exists, not when it was written, and a fabricated
-- timestamp would be worse than an absent one.
UPDATE "profiles" SET "embeddingStatus" = 'SUCCESS' WHERE "embedding" IS NOT NULL;
UPDATE "jobs"     SET "embeddingStatus" = 'SUCCESS' WHERE "embedding" IS NOT NULL;

-- The queries this exists to serve are "what still needs embedding?" and "what failed?",
-- both of which scan by status.
CREATE INDEX "profiles_embeddingStatus_idx" ON "profiles" ("embeddingStatus");
CREATE INDEX "jobs_embeddingStatus_idx"     ON "jobs"     ("embeddingStatus");
