-- Show postings that state where the work is BEFORE postings that don't.
--
-- WHY A COLUMN AND NOT JUST `score`: an unresolvable location is excluded from the
-- weighted average and the remaining weights are rescaled (see blendMeasured), which
-- slightly RAISES the total. So ordering by score alone lets a job that hides its
-- location outrank one that states it — the opposite of what a job seeker wants.
--
-- The same fact already lives inside `breakdown` as `location: null`, but Postgres
-- cannot usefully index or sort on a JSON field, and this ordering must happen in SQL:
-- sorting in memory after LIMIT would only reorder one page.
--
-- This is a LISTING-QUALITY flag, not a claim about fit. Jobs without a location are
-- still returned, just after the ones with it.

ALTER TABLE "recommendations"
  ADD COLUMN "locationKnown" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the breakdown that is already stored, so existing rows sort correctly
-- without waiting for a recompute. `breakdown->>'location'` yields SQL NULL both when
-- the key is absent and when its value is JSON null — which is exactly the condition.
UPDATE "recommendations"
   SET "locationKnown" = (breakdown->>'location') IS NOT NULL
 WHERE breakdown IS NOT NULL;

-- Reads are "this user's live recommendations, located ones first, then best first".
CREATE INDEX "recommendations_userId_dismissedAt_locationKnown_score_idx"
  ON "recommendations"("userId", "dismissedAt", "locationKnown", "score");

DROP INDEX IF EXISTS "recommendations_userId_dismissedAt_score_idx";
