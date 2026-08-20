-- Recommendations could never go stale, and a dismissal could never stick.
--
-- MENTOR_REVIEW_2026-08-18 §6. `RecommendationsQueryService.getForUser` recomputed only
-- when a user had ZERO rows, and there is no cron. Meanwhile UserProfileUpdatedListener
-- faithfully re-embedded the candidate on every profile / preference / résumé /
-- default-résumé change. The embedding moved; the cached scores did not. A user who
-- uploaded a better CV saw exactly the same matches forever.
--
-- Fixing that surfaced a second problem the dismiss service already documented: a
-- dismissal was represented by the ROW'S ABSENCE, which only worked because recomputes
-- essentially never happened. Make invalidation real and every dismissed job comes back.
-- So dismissal needs a durable representation BEFORE staleness is honoured — these two
-- columns have to land together.
--
-- All three columns are nullable or defaulted, so this is additive and safe to run
-- against a populated table. Existing rows are treated as freshly computed rather than
-- stale: back-filling `computedAt` to now() is a lie about WHEN, but marking every row
-- stale would stampede a recompute for every active user on the first read after deploy.

ALTER TABLE "recommendations"
  -- What CV/profile this score is actually about. Distinct from updatedAt, which any
  -- write bumps.
  ADD COLUMN "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Set when an input to the score changes; the next read recomputes. A MARKER, not a
  -- delete: a recompute that fails must not leave the user with zero recommendations.
  ADD COLUMN "staleAt" TIMESTAMP(3),
  -- "Not interested", surviving recompute. Also gives GET /sync/recommendations a real
  -- `deletes` signal, which it never had (sync.service.ts:16-17).
  ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- Reads are "this user's live recommendations, best first". Dismissed rows stay as
-- tombstones, so skipping them must not cost a scan.
CREATE INDEX "recommendations_userId_dismissedAt_score_idx"
  ON "recommendations" ("userId", "dismissedAt", "score");
