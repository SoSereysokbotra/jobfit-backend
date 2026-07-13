-- Employer module (Employer Phase 2): additive-only migration.
-- Adds 1 enum, extends companies/jobs/applications, and creates application_stage_history.
-- No columns are dropped and no existing enums are altered.

-- CreateEnum
CREATE TYPE "CompanyVerificationMethod" AS ENUM ('EMAIL_DOMAIN', 'ADMIN_REVIEW');

-- AlterTable (companies): ownership verification
ALTER TABLE "companies" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationMethod" "CompanyVerificationMethod",
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable (jobs): posted-by-employer
ALTER TABLE "jobs" ADD COLUMN     "postedByEmployerId" TEXT;

-- AlterTable (applications): pipeline review
ALTER TABLE "applications" ADD COLUMN     "employerNotes" TEXT,
ADD COLUMN     "reviewedByEmployerId" TEXT;

-- CreateTable
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

-- CreateIndex
CREATE INDEX "companies_isVerified_idx" ON "companies"("isVerified");

-- CreateIndex
CREATE INDEX "jobs_postedByEmployerId_idx" ON "jobs"("postedByEmployerId");

-- CreateIndex
CREATE INDEX "applications_reviewedByEmployerId_idx" ON "applications"("reviewedByEmployerId");

-- CreateIndex
CREATE INDEX "application_stage_history_applicationId_idx" ON "application_stage_history"("applicationId");

-- CreateIndex
CREATE INDEX "application_stage_history_createdAt_idx" ON "application_stage_history"("createdAt");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_postedByEmployerId_fkey" FOREIGN KEY ("postedByEmployerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewedByEmployerId_fkey" FOREIGN KEY ("reviewedByEmployerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
