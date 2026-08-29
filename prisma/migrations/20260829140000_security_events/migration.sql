-- Authentication and account-security history (Phase 7, audit half).
--
-- A SIBLING of audit_logs rather than an extension of it. Two reasons, both from the code
-- rather than preference:
--
--  1. audit_logs.adminId is NOT NULL with an FK to users. Widening that table to accept a
--     non-admin actor means dropping the NOT NULL, which destroys the single thing it
--     guarantees: every row has an accountable admin behind it.
--  2. Volume and retention differ by orders of magnitude. Every failed login against every
--     address, versus a handful of admin actions a week. Mixed, the compliance records
--     drown in auth noise and neither can be rotated without the other.
--
-- ⚠️ RETENTION. `email` and `ipAddress` are personal data, and most rows will concern
-- people who are not users — a failed login names an address that may not exist here. They
-- are kept so an account takeover can be reconstructed and repeat abuse traced. A
-- production deployment needs a purge policy with a stated horizon; this project does not
-- have one yet, the same gap users.deletedEmail already carries.
--
-- Additive and safe: one new table and one new enum. Nothing existing is touched.

CREATE TYPE "SecurityEventType" AS ENUM (
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'ACCOUNT_STATUS_CHANGED'
);

CREATE TABLE "security_events" (
    "id"        TEXT NOT NULL,
    -- NULL when the attempt named an address with no account. The event still matters —
    -- that is what credential stuffing looks like — so it is recorded against the email.
    "userId"    TEXT,
    "email"     TEXT NOT NULL,
    "eventType" "SecurityEventType" NOT NULL,
    "ipAddress" TEXT,
    "detail"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- "What happened to this account" and "what is this address doing" are the two questions
-- this table exists to answer. Both scan by time, hence the composite indexes.
CREATE INDEX "security_events_userId_createdAt_idx"    ON "security_events" ("userId", "createdAt");
CREATE INDEX "security_events_email_createdAt_idx"     ON "security_events" ("email", "createdAt");
CREATE INDEX "security_events_eventType_createdAt_idx" ON "security_events" ("eventType", "createdAt");

-- SetNull, not Cascade: the security trail must outlive the account it describes. Deleting
-- a compromised account should not erase the evidence of how it was compromised.
ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
