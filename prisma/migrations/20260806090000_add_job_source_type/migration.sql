-- Whether a job can be applied to inside JobFits.
--
-- Before this column existed a user could click "Apply" on all 51 published jobs, but 43 of
-- them were ingested from TheMuse: no employer exists in JobFits to receive the application
-- and the real posting lives on another site. Those applications went nowhere while the user
-- believed they had applied.
--
-- Defaults to INTERNAL so employer-posted jobs remain applicable.
CREATE TYPE "JobSourceType" AS ENUM ('INTERNAL', 'EXTERNAL');

ALTER TABLE "jobs" ADD COLUMN "sourceType" "JobSourceType" NOT NULL DEFAULT 'INTERNAL';

-- Backfill: anything carrying ingestion provenance is external. Both conditions are checked
-- rather than `source` alone, so a partial import that recorded a URL but no source name is
-- still classified correctly.
UPDATE "jobs"
SET "sourceType" = 'EXTERNAL'
WHERE "source" IS NOT NULL
   OR "externalUrl" IS NOT NULL;

-- Applications are filtered by this on every submit, and job lists are filtered by it in the UI.
CREATE INDEX "jobs_sourceType_idx" ON "jobs" ("sourceType");
