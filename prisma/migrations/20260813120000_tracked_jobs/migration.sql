-- The Job Tracker board: jobs a user is following themselves.
--
-- WHY A NEW TABLE RATHER THAN `applications`. An Application records what an EMPLOYER
-- decided, and the lifecycle enforces that: EMPLOYER_SETTABLE_STATUSES is
-- SCREENING/INTERVIEW/OFFER/REJECTED, and the transition chokepoint REFUSES a candidate
-- asserting any of them. A drag-and-drop board is the opposite — the user moves their own
-- card, and the stage means "this is where I think I am", not "this is what the employer
-- recorded". Reusing ApplicationStatus would either refuse every drag or let a candidate
-- write into an employer's pipeline. That is the mistake ARCHIVED was, before it became a
-- per-actor column.
--
-- Applications also cannot exist for these jobs at all: the server refuses an in-app
-- application to an EXTERNAL posting, because it would go nowhere.

CREATE TYPE "TrackedJobStage" AS ENUM ('SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED');

CREATE TABLE "tracked_jobs" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,

    -- Set when the card came from a posting we hold; NULL for anything saved from the
    -- extension or typed in by hand.
    "jobId"       TEXT,

    -- SNAPSHOT, not a view through jobId. A tracked card must survive the posting being
    -- taken down, re-ingested, or never having been in our database.
    "title"       TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "url"         TEXT,
    "location"    TEXT,

    "stage"       "TrackedJobStage" NOT NULL DEFAULT 'SAVED',
    -- Order within a column; rewritten on every drag.
    "position"    INTEGER NOT NULL DEFAULT 0,

    "minSalary"   INTEGER,
    "maxSalary"   INTEGER,
    "notes"       TEXT,

    -- When the USER says they applied. Not derived from `stage`: a card can be dragged
    -- straight to INTERVIEW for a job applied to weeks ago outside the product.
    "appliedAt"   TIMESTAMP(3),
    -- Hidden from the board without being deleted (the "Archived" view).
    "archivedAt"  TIMESTAMP(3),

    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_jobs_pkey" PRIMARY KEY ("id")
);

-- One card per known posting per user. NULLs are distinct in Postgres, so any number of
-- hand-entered cards coexist — the same property Job relies on for (source, externalId).
CREATE UNIQUE INDEX "tracked_jobs_userId_jobId_key" ON "tracked_jobs"("userId", "jobId");

-- The board query is always "this user's cards, by stage, in order".
CREATE INDEX "tracked_jobs_userId_stage_position_idx"
    ON "tracked_jobs"("userId", "stage", "position");
CREATE INDEX "tracked_jobs_userId_archivedAt_idx" ON "tracked_jobs"("userId", "archivedAt");

ALTER TABLE "tracked_jobs"
    ADD CONSTRAINT "tracked_jobs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: losing the posting must not delete the user's card. The snapshot
-- is what the card renders from, so it keeps working with the link gone.
ALTER TABLE "tracked_jobs"
    ADD CONSTRAINT "tracked_jobs_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
