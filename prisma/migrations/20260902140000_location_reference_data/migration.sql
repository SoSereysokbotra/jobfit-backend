-- Location reference data — the vocabulary location matching resolves into.
--
-- WHY: `scoreLocation` compared two free-text strings with a regex, so a user's score
-- depended on how they happened to spell their own city. "Phnom Penh" matched a job
-- listed as "Toul Kork, Phnom Penh"; "PP" or Khmer script did not, and scored the same
-- as a job in Bangkok. See docs/LOCATION_MATCHING_ROOT_PROBLEM.md.
--
-- This table is one half of the fix: both a profile and a job posting get resolved to a
-- row here, after which "same city / same province / same country" is a checkable
-- question rather than a string coincidence.
--
-- REFERENCE DATA, NOT USER DATA. Owned by scripts/import-geonames.ts (GeoNames
-- cities15000, CC BY 4.0), keyed on `geonameId` so re-running the import is idempotent.
-- No application code writes here. Dropping this table loses nothing a re-import cannot
-- rebuild.
--
-- Verified against the real dataset on 2026-09-02: 34,129 cities, 252 countries,
-- 3,865 admin1 codes; Phnom Penh carries 72 alternate names, 4 of them in Khmer script.

CREATE TABLE "locations" (
    "id"             TEXT             NOT NULL,
    -- GeoNames' own id: the natural key the importer upserts on.
    "geonameId"      INTEGER          NOT NULL,
    "name"           TEXT             NOT NULL,
    "asciiName"      TEXT             NOT NULL,
    -- Other languages, scripts and abbreviations for the same place. This column is the
    -- whole reason the dataset is worth importing — it is what makes Khmer script and
    -- "Phnom Penh" resolve to one row instead of scoring differently.
    "alternateNames" TEXT[]           DEFAULT ARRAY[]::TEXT[],
    "countryCode"    TEXT             NOT NULL,
    "countryName"    TEXT             NOT NULL,
    -- ⚠️ admin1 is legitimately EMPTY for city-states (verified: Singapore). Two rows
    -- with no admin1 are NOT in the same province — consumers must treat blank as
    -- "unknown", never as a match.
    "admin1Code"     TEXT,
    "admin1Name"     TEXT,
    -- Tie-breaker for ambiguous names (there are many Springfields): most populous wins.
    "population"     INTEGER          NOT NULL DEFAULT 0,
    -- Recorded because the import is free. NOT read by the hierarchy scorer; it exists
    -- for a possible future distance-based scorer (option C in the root-problem doc).
    "latitude"       DOUBLE PRECISION,
    "longitude"      DOUBLE PRECISION,
    "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- The importer's upsert target. Also what makes a re-run idempotent.
CREATE UNIQUE INDEX "locations_geonameId_key" ON "locations"("geonameId");

-- Lookup is always "this ascii name, optionally within this country".
CREATE INDEX "locations_asciiName_idx" ON "locations"("asciiName");
CREATE INDEX "locations_countryCode_idx" ON "locations"("countryCode");
CREATE INDEX "locations_countryCode_admin1Code_idx" ON "locations"("countryCode", "admin1Code");

-- Array containment (`alternateNames @> ARRAY[...]`) needs GIN; a btree index cannot
-- serve it. Used by the city typeahead endpoint (phase 3). The scorer itself resolves
-- from an in-memory index and does not touch this.
CREATE INDEX "locations_alternateNames_idx" ON "locations" USING GIN ("alternateNames");
