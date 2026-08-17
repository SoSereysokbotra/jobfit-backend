-- RECONSTRUCTED 2026-08-13. This migration was recorded as applied in `_prisma_migrations`
-- but its folder was missing from the repository, so a fresh clone could not rebuild the
-- database — `migrate deploy` would stop at the gap.
--
-- The statements below were read back OUT of the live database (information_schema,
-- pg_indexes, pg_constraint) rather than written from memory, so replaying them produces
-- the table that actually exists: all TEXT columns, timestamp(3), and the same three
-- indexes and one foreign key.
--
-- The table is currently unused by any code. It came from a saved-external-jobs feature
-- whose application code was discarded; the job-tracker feature deliberately uses its own
-- `tracked_jobs` table instead (see docs/JOB_TRACKER_PLAN.md). This file exists to make
-- history replayable, NOT as an endorsement of the table — dropping it is a separate,
-- deliberate decision.

CREATE TABLE "saved_external_jobs" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "externalId"  TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "company"     TEXT,
    "description" TEXT,
    "url"         TEXT,
    "salary"      TEXT,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_external_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_external_jobs_userId_source_externalId_key"
    ON "saved_external_jobs"("userId", "source", "externalId");

CREATE INDEX "saved_external_jobs_userId_idx" ON "saved_external_jobs"("userId");

ALTER TABLE "saved_external_jobs"
    ADD CONSTRAINT "saved_external_jobs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
