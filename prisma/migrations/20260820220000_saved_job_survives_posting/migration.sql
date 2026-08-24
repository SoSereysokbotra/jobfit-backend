-- A saved job died with the posting; a tracked job survived it.
--
-- MENTOR_REVIEW_2026-08-18 sec 16. `saved_jobs.jobId` was `onDelete: Cascade` with no
-- snapshot, so deleting a job erased the user's bookmark without a trace. `tracked_jobs`
-- for the identical posting survived, because JOB_TRACKER_PLAN sec 2 had already made the
-- case that postings vanish ("bongthom returned 404 for 9 of 43 postings during the
-- ingestion work"). Every word of that argument applies here; it was simply never
-- back-ported.
--
-- Verified at b3d6b96: the cascade is LATENT, not firing today. No route deletes a job
-- (`JobService.delete` exists but no controller exposes it) and nothing prunes de-listed
-- postings. That is exactly why this is cheap to fix now -- there are 3 saved_jobs rows
-- and all of them still point at a live job, so the back-fill below is complete.
--
-- It will not stay latent: the corpus is 83% ingested from boards that delist
-- aggressively, a prune job is anticipated by the tracker plan, and out-of-band deletes
-- through the Supabase console are a demonstrated habit in this project (see sec 14).

-- 1. The link becomes optional. The row outlives the posting.
ALTER TABLE "saved_jobs" ALTER COLUMN "jobId" DROP NOT NULL;

-- 2. Snapshot columns, mirroring tracked_jobs.
ALTER TABLE "saved_jobs"
  ADD COLUMN "title"       TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "url"         TEXT;

-- 3. Back-fill from the postings the existing rows still point at. Runs before the FK is
--    relaxed, while every row is still guaranteed to have a job to copy from.
UPDATE "saved_jobs" s
   SET "title"       = j."title",
       "companyName" = c."name",
       "url"         = j."externalUrl"
  FROM "jobs" j
  LEFT JOIN "companies" c ON c."id" = j."companyId"
 WHERE j."id" = s."jobId";

-- 4. Swap CASCADE for SET NULL. Prisma names FKs `<table>_<column>_fkey`.
ALTER TABLE "saved_jobs" DROP CONSTRAINT "saved_jobs_jobId_fkey";
ALTER TABLE "saved_jobs"
  ADD CONSTRAINT "saved_jobs_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
