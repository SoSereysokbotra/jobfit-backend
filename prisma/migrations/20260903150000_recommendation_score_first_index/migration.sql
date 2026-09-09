-- Recommendations are read "best match first, location-known as a tiebreaker", not
-- "location-known first". The composite index exists to serve that ORDER BY, so its
-- column order has to follow it: score before locationKnown.
--
-- Sorting by locationKnown first ranked on a property of the LISTING ("did this posting
-- state a place?") rather than of the MATCH, which is why a user who moved country kept
-- seeing the old country's tidily-formatted postings at the top.
DROP INDEX IF EXISTS "recommendations_userId_dismissedAt_locationKnown_score_idx";

CREATE INDEX IF NOT EXISTS "recommendations_userId_dismissedAt_score_locationKnown_idx"
  ON "recommendations" ("userId", "dismissedAt", "score", "locationKnown");
