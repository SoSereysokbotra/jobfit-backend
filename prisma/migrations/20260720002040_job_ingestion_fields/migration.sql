-- Job ingestion (FR-JOBS-001): external-source tracking + dedup.
-- NULLs are distinct in Postgres, so existing employer jobs (source/externalId NULL)
-- never collide on the new unique index.

ALTER TABLE "jobs"
  ADD COLUMN "source"      TEXT,
  ADD COLUMN "externalId"  TEXT,
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "lastSeenAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX "jobs_source_externalId_key" ON "jobs"("source", "externalId");
CREATE INDEX "jobs_source_idx" ON "jobs"("source");
