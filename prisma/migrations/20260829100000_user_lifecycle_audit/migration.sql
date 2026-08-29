-- Audit actions for the account lifecycle (Phase 7).
--
-- Three values rather than one STATUS_CHANGED, because the three are not equivalent:
-- suspension is reversible, deactivation is not, and reactivation is the one that puts an
-- account back in reach. An audit answering "who turned this account off" should not have
-- to parse a payload to learn which of those happened.
--
-- Additive and safe: new enum values only, no table or column touched.

ALTER TYPE "AuditActionType" ADD VALUE 'USER_SUSPENDED';
ALTER TYPE "AuditActionType" ADD VALUE 'USER_REACTIVATED';
ALTER TYPE "AuditActionType" ADD VALUE 'USER_DEACTIVATED';
