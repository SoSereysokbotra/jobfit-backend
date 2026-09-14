-- Terms acceptance audit trail (Legal Decision Framework D7, Option A).
--
-- All three columns are NULLABLE with no default and NO BACKFILL, deliberately. Every
-- account that existed before this migration has no recorded consent, and the honest
-- representation of that is NULL. Stamping existing rows with `createdAt` would
-- manufacture evidence of an act that was never captured — the exact opposite of what a
-- consent audit trail is for.
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "users" ADD COLUMN "termsAcceptedIp" TEXT;
