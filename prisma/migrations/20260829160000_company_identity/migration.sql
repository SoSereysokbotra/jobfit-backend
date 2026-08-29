-- Company name is a display attribute, not an identity.
--
-- `companies.name` was UNIQUE, which asserted that two businesses cannot share a name. They
-- can: "Acme Robotics" in Phnom Penh and "Acme Robotics" in Siem Reap are different
-- companies with different owners and different websites. The constraint meant the second
-- one could not be onboarded at all, and the approve dialog then offered the admin the
-- FIRST one — quietly binding a recruiter to a company that is not theirs.
--
-- Identity moves to `identityKey`, which records WHICH signal it was derived from:
--
--     domain:acme-kh.com     strong — from the website, two rows cannot share one
--     name:acme robotics     weak   — the only signal a scraped company has
--
-- The prefix is what stops the two colliding, so an employer's acme-kh.com never occupies
-- the same key as a scraped "Acme Robotics".
--
-- ⚠️ INGESTION DEPENDS ON THIS BEING UNIQUE. `ingestion.service.ts` upserts a company per
-- scraped job; no source publishes a company website, so those rows dedupe on the weak key
-- exactly as they deduped on `name` before. Dropping the unique index without replacing it
-- would have made every scraped job create a new company.

-- ── 1. New columns, nullable for the backfill ────────────────────────────────
ALTER TABLE "companies"
  ADD COLUMN "domain"      TEXT,
  ADD COLUMN "identityKey" TEXT;

-- ── 2. Backfill the domain from the website ──────────────────────────────────
-- Mirrors normalizeDomain() in src/shared/utils/company-identity.ts: strip protocol, then
-- www., then anything from the first /, ? or #, then lower-case. A value with no dot is not
-- a host and is left NULL rather than guessed at.
UPDATE "companies"
SET "domain" = NULLIF(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim("website")), '^[a-z][a-z0-9+.-]*://', ''),
          '^www\.', ''
        ),
        '[/?#].*$', ''
      ),
      ''
    )
WHERE "website" IS NOT NULL AND btrim("website") <> '';

-- Anything that did not resolve to a host (no dot, or embedded whitespace) is not a domain.
UPDATE "companies" SET "domain" = NULL
WHERE "domain" IS NOT NULL AND ("domain" NOT LIKE '%.%' OR "domain" ~ '\s');

-- ── 3. Backfill identityKey ──────────────────────────────────────────────────
-- Domain wins where present; otherwise the normalized name, matching
-- normalizeCompanyName(): lower-case, punctuation stripped, whitespace collapsed.
UPDATE "companies"
SET "identityKey" = CASE
  WHEN "domain" IS NOT NULL THEN 'domain:' || "domain"
  ELSE 'name:' || btrim(regexp_replace(regexp_replace(lower(btrim("name")), '[.,''`"()]', '', 'g'), '\s+', ' ', 'g'))
END;

-- ⚠️ Two existing rows can now collide: distinct names that normalize to the same weak key
-- ("Acme Co., Ltd" and "Acme Co Ltd"), or two rows sharing a website. Neither could be
-- created going forward, but both may already exist — `name` was unique, `domain` never was.
--
-- Rather than merge them (which would silently move jobs between companies, and merging is
-- exactly the unsafe automatic behaviour this change exists to prevent), the duplicates keep
-- their own identity by having their row id appended. They remain separate companies and an
-- admin can reconcile them deliberately.
WITH ranked AS (
  SELECT "id", "identityKey",
         row_number() OVER (PARTITION BY "identityKey" ORDER BY "createdAt", "id") AS rn
  FROM "companies"
)
UPDATE "companies" c
SET "identityKey" = c."identityKey" || '#' || c."id"
FROM ranked r
WHERE c."id" = r."id" AND r.rn > 1;

-- ── 4. Enforce ───────────────────────────────────────────────────────────────
ALTER TABLE "companies" ALTER COLUMN "identityKey" SET NOT NULL;

-- The name is now free to repeat.
DROP INDEX IF EXISTS "companies_name_key";

CREATE UNIQUE INDEX "companies_identityKey_key" ON "companies" ("identityKey");
CREATE INDEX "companies_domain_idx" ON "companies" ("domain");
