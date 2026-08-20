-- Re-opening the same job posting spent a full AI call, every time.
--
-- MENTOR_REVIEW_2026-08-18 §11. `POST /match-report` runs requirement extraction over up
-- to 20,000 caller-supplied characters with no cap and no dedupe. Re-opening a posting is
-- the COMMON case -- a user compares a few roles, closes the tab, comes back -- and each
-- visit paid for the same extraction again. Since `job_requirements` routes to DeepSeek
-- by default, that is a metered third-party call, not just GPU time.
--
-- The cache key is (userId, source, externalId, descriptionHash). The hash is what makes
-- it correct rather than merely cheap: a posting that was EDITED must not serve the old
-- report, and comparing 20,000 characters on every request to find out is worse than
-- comparing 64.
--
-- Nullable on purpose. Rows written before this migration have no hash and are therefore
-- never reused -- they fall through to a fresh generation, which is the safe direction.
-- A NOT NULL default would have to invent a hash that matches nothing anyway.

ALTER TABLE "match_reports"
  ADD COLUMN "descriptionHash" TEXT;

-- The lookup is "this user's report for this exact posting text, newest first". Ordering
-- lives in the index so the freshness check never sorts a user's whole report history.
CREATE INDEX "match_reports_userId_source_externalId_descriptionHash_idx"
  ON "match_reports" ("userId", "source", "externalId", "descriptionHash", "createdAt");
