-- Record what the automated domain check found, without letting it block anyone.
--
-- Phase 4 of docs/EMPLOYER_ONBOARDING_PLAN.md composes two verification signals that used
-- to be alternatives: an admin reading a business registration, and the email-domain match
-- in EmployerCompanyService.verifyEmail.
--
-- The domain check cannot be authoritative for an admin-approved employer. It answers
-- 400 "no website" for the many seeded and ingested company rows that have none, and
-- MISMATCH for a recruiter whose address sits on a subsidiary or regional domain. Either
-- would refuse an employer a human has already verified against documents.
--
-- So it becomes a soft signal. It still runs, and its answer is stored here, because
-- "approved AND the domain matched" and "approved but the domain did not" are different
-- facts and an audit should not have to guess which one happened. companies.verificationMethod
-- already records WHICH signal verified the company (ADMIN_REVIEW vs EMAIL_DOMAIN); this
-- records what the other one thought.
--
-- Separate from 20260828120000 on purpose: that migration may already have been applied,
-- and editing an applied migration would put the schema and its history out of step.
-- Additive and safe on a populated table — two nullable columns and one new enum.

CREATE TYPE "DomainCheckResult" AS ENUM ('MATCH', 'MISMATCH', 'NO_WEBSITE');

ALTER TABLE "employer_requests"
  ADD COLUMN "domainCheck"     "DomainCheckResult",
  ADD COLUMN "domainCheckedAt" TIMESTAMP(3);

-- Left NULL for existing rows rather than back-filled. The check runs once, at first-login
-- claim; a row that has not reached that point has no result, and inventing one would be
-- exactly the unfounded claim this column exists to avoid.
