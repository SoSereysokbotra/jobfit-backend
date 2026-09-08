-- Two-dimensional matching (Approach C): capability and logistics are scored separately,
-- and `recommendations.score` becomes the gated composite of the two.
--
-- All three columns are NULLABLE with no default and no backfill, on purpose. A NULL
-- `roleFitScore` is the honest marker for "this row was scored by the old linear sum";
-- filling it with a derived number would invent a measurement that was never taken. Rows
-- refresh on the next recompute (staleness already triggers one whenever the profile,
-- preferences or resume change), and a client must treat the two-dimensional fields as
-- optional until then.
ALTER TABLE "recommendations" ADD COLUMN "roleFitScore" DOUBLE PRECISION;
ALTER TABLE "recommendations" ADD COLUMN "preferenceFitScore" DOUBLE PRECISION;
ALTER TABLE "recommendations" ADD COLUMN "matchFlags" JSONB;

-- Every cached row is now stale BY DEFINITION: `score` means something different from
-- what it meant when these rows were written, so serving them next to freshly computed
-- ones would mix two scales in one sorted list.
--
-- A MARKER, NOT A DELETE — the same judgement the column was added for. Stale rows keep
-- serving (a user is never left staring at an empty list), the API already tells clients
-- they are stale, and the next read recomputes them properly. Dismissals are untouched:
-- `staleAt` says nothing about them.
UPDATE "recommendations" SET "staleAt" = NOW() WHERE "staleAt" IS NULL;
