-- Somewhere to keep a job saved from the browser extension.
--
-- SEPARATE FROM saved_jobs ON PURPOSE. That table's "jobId" is a foreign key to our own
-- "jobs" rows and a LinkedIn posting has none. Inserting fake job rows would feed
-- invented postings into recommendations and the matching batch; making "jobId" nullable
-- would break its (userId, jobId) uniqueness, since Postgres treats every NULL as
-- distinct and the same posting could then be saved twice.
--
-- PRIVACY: the user's own bookmark, captured on their click, scoped to their row. Not a
-- job board — nothing reads across users and no background job writes here.

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

-- Re-saving the same posting updates it rather than making a duplicate.
CREATE UNIQUE INDEX "saved_external_jobs_userId_source_externalId_key"
  ON "saved_external_jobs"("userId", "source", "externalId");

-- Every read is "this user's saved jobs, newest first".
CREATE INDEX "saved_external_jobs_userId_idx" ON "saved_external_jobs"("userId");

ALTER TABLE "saved_external_jobs"
  ADD CONSTRAINT "saved_external_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
