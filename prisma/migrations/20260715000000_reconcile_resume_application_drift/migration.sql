-- ============================================================================
-- Reconcile resume/application schema drift (clean rebuild).
--
-- Context: schema.prisma redesigned the Resume and Application models (+ 3 child
-- tables and the ApplicationStatus enum) but no migration was ever generated, so
-- the live DB still had the original init-migration shape. Verified live state
-- before writing this migration: `resumes` = 0 rows, `applications` = 0 rows,
-- `application_stage_history` = 0 rows (empty via CASCADE), and no
-- applications.status values in use. Because the tables are empty this is a safe
-- DROP + CREATE rebuild — no production data is destroyed.
--
-- Design notes:
--  * The ApplicationStatus enum is recreated cleanly (DROP TYPE + CREATE TYPE),
--    NOT extended with ALTER TYPE ... ADD VALUE — so there is no "cannot add and
--    use an enum value in the same transaction" hazard.
--  * All foreign keys are preserved/recreated: the inbound
--    application_stage_history -> applications FK, the outbound
--    applications -> jobs / users(reviewedByEmployer) FKs, and the new
--    resumes -> users, applications -> users/resumes, and child-table FKs.
--  * DDL below is Prisma's own canonical output (prisma migrate diff
--    --from-empty --to-schema-datamodel), so the end state matches schema.prisma
--    exactly (a subsequent `migrate dev` reports no drift).
-- ============================================================================

-- ── 1. Drop drifted objects (children first, then the enum) ─────────────────
-- application_stage_history depends on applications + the ApplicationStatus enum.
DROP TABLE IF EXISTS "application_stage_history";
DROP TABLE IF EXISTS "applications";
DROP TABLE IF EXISTS "resumes";
-- Nothing references ApplicationStatus anymore; drop so it can be recreated clean.
DROP TYPE IF EXISTS "ApplicationStatus";

-- ── 2. Recreate enums (new values) ──────────────────────────────────────────
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SCREENING', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'NEGOTIATING', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');
CREATE TYPE "ResumeParsingStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- ── 3. Recreate tables to match schema.prisma ───────────────────────────────
CREATE TABLE "resumes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "title" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "parsingStatus" "ResumeParsingStatus" NOT NULL DEFAULT 'PENDING',
    "parsingError" TEXT,
    "atsScore" INTEGER,
    "qualityScore" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parsed_resume_data" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "experiences" TEXT,
    "educations" TEXT,
    "skills" TEXT,
    "certifications" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parsed_resume_data_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resumeId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "coverLetter" TEXT,
    "employerNotes" TEXT,
    "reviewedByEmployerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_stage_history" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "previousStatus" "ApplicationStatus",
    "newStatus" "ApplicationStatus" NOT NULL,
    "movedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_timelines" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_timelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_persons" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("id")
);

-- ── 4. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX "resumes_userId_idx" ON "resumes"("userId");
CREATE INDEX "resumes_isDefault_idx" ON "resumes"("isDefault");
CREATE INDEX "resumes_parsingStatus_idx" ON "resumes"("parsingStatus");
CREATE UNIQUE INDEX "parsed_resume_data_resumeId_key" ON "parsed_resume_data"("resumeId");
CREATE INDEX "applications_userId_idx" ON "applications"("userId");
CREATE INDEX "applications_status_idx" ON "applications"("status");
CREATE INDEX "applications_reviewedByEmployerId_idx" ON "applications"("reviewedByEmployerId");
CREATE UNIQUE INDEX "applications_userId_jobId_key" ON "applications"("userId", "jobId");
CREATE INDEX "application_stage_history_applicationId_idx" ON "application_stage_history"("applicationId");
CREATE INDEX "application_stage_history_createdAt_idx" ON "application_stage_history"("createdAt");
CREATE INDEX "application_timelines_applicationId_idx" ON "application_timelines"("applicationId");
CREATE UNIQUE INDEX "contact_persons_applicationId_key" ON "contact_persons"("applicationId");

-- ── 5. Foreign keys (all preserved / recreated) ─────────────────────────────
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parsed_resume_data" ADD CONSTRAINT "parsed_resume_data_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewedByEmployerId_fkey" FOREIGN KEY ("reviewedByEmployerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_timelines" ADD CONSTRAINT "application_timelines_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
