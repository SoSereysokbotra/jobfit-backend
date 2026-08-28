-- Employer onboarding: the front door to a product that already exists.
--
-- Every employer feature — company claim, job posting, the applicant pipeline, analytics,
-- the offer round-trip — was built and unreachable. There was no runtime path to an
-- EMPLOYER account at all: the public signup DTO has no role field, the admin panel has no
-- create-user or role-change endpoint, and nothing in src/ assigns role = EMPLOYER. Every
-- employer in existence came from prisma/seed.ts.
--
-- This migration adds the onboarding ticket that path runs through
-- (docs/employer_logic.md v2.1, docs/EMPLOYER_ONBOARDING_PLAN.md Phase 1).
--
-- Additive and safe on a populated table: one new table, one new column with a default,
-- and two new enums. Nothing existing is dropped or rewritten.

-- ── Account lifecycle ────────────────────────────────────────────────────────
-- `isActive: boolean` cannot distinguish "suspended for a policy violation" from "closed
-- permanently", so an admin had no way to record WHY an account was off.
--
-- ⚠️ NOT YET AUTHORITATIVE. The login path still enforces `isActive`
-- (auth/infrastructure/persistence/user.repository.ts:151). Both columns are written
-- together until Phase 7 switches that refusal over and collapses them. Splitting that
-- change out keeps a schema migration from touching the login path.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Back-fill from the two columns that already encode this, in precedence order: a deleted
-- account is DEACTIVATED regardless of its isActive flag.
UPDATE "users" SET "status" = 'SUSPENDED'   WHERE "isActive" = false;
UPDATE "users" SET "status" = 'DEACTIVATED' WHERE "deletedAt" IS NOT NULL;

-- ── The onboarding ticket ────────────────────────────────────────────────────
-- Deliberately NOT part of UserStatus. This row is created by an unauthenticated stranger
-- before any account exists, and it must survive rejection — a rejected request has to
-- leave no account behind, so the two cannot share a state machine.
CREATE TYPE "EmployerRequestStatus" AS ENUM ('SUBMITTED', 'REVIEWING', 'PENDING_INFO', 'APPROVED', 'REJECTED');

CREATE TABLE "employer_requests" (
    "id"                   TEXT NOT NULL,

    -- What the employer submitted
    "companyName"          TEXT NOT NULL,
    "contactName"          TEXT NOT NULL,
    "contactRole"          TEXT NOT NULL,
    -- Becomes the login address. NOT unique on purpose: a rejected request must not
    -- permanently block an address, and the real conflict check is the unique index on
    -- users.email, applied inside the approval transaction where it can be atomic.
    "companyEmail"         TEXT NOT NULL,
    "companyWebsite"       TEXT,
    "description"          TEXT NOT NULL,
    "supportingDocsUrl"    TEXT,

    -- Review
    "status"               "EmployerRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "adminNotes"           TEXT,
    "reviewedByAdminId"    TEXT,
    "reviewedAt"           TIMESTAMP(3),

    -- The account created on approval. NULL until then, and forever on a rejection.
    "approvedUserId"       TEXT,
    -- WHICH company the admin approved this request for. Without it, first-login claim is
    -- a free-text search and an employer approved for one company could claim another.
    "approvedCompanyId"    TEXT,

    -- Activation. Mirrors the 6-digit code columns already on users rather than inventing
    -- a second mechanism. Cleared once used.
    "activationCode"       TEXT,
    "activationCodeExpiry" TIMESTAMP(3),

    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_requests_pkey" PRIMARY KEY ("id")
);

-- One ticket per created account.
CREATE UNIQUE INDEX "employer_requests_approvedUserId_key" ON "employer_requests" ("approvedUserId");

-- The admin queue reads by status, oldest first — that is also what the 48-hour SLA scans.
CREATE INDEX "employer_requests_status_createdAt_idx" ON "employer_requests" ("status", "createdAt");
-- Finding prior requests for an address, when an employer re-applies or an admin checks.
CREATE INDEX "employer_requests_companyEmail_idx" ON "employer_requests" ("companyEmail");

-- SetNull throughout: losing the reviewing admin, the created account, or the company must
-- never delete the audit trail of the decision itself.
ALTER TABLE "employer_requests"
  ADD CONSTRAINT "employer_requests_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employer_requests"
  ADD CONSTRAINT "employer_requests_approvedUserId_fkey"
  FOREIGN KEY ("approvedUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employer_requests"
  ADD CONSTRAINT "employer_requests_approvedCompanyId_fkey"
  FOREIGN KEY ("approvedCompanyId") REFERENCES "companies" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Audit trail for the new admin actions ────────────────────────────────────
-- Approval CREATES a user account, which is the most consequential action an admin can
-- take in this flow. It must be attributable, and so must a rejection and a resend.
ALTER TYPE "AuditActionType" ADD VALUE 'EMPLOYER_REQUEST_APPROVED';
ALTER TYPE "AuditActionType" ADD VALUE 'EMPLOYER_REQUEST_REJECTED';
ALTER TYPE "AuditActionType" ADD VALUE 'EMPLOYER_ACTIVATION_RESENT';
ALTER TYPE "AuditResourceType" ADD VALUE 'EMPLOYER_REQUEST';
