-- The email suppression list moves from Redis to Postgres.
--
-- Redis audit R3/R8/R11 — three symptoms of one root cause: a permanent compliance
-- record was living in a cache.
--
--   R3  The list was WRITTEN BUT NEVER READ. `isSuppressed()` was private to
--       EmailTrackingService and used only to annotate the admin bounce list for
--       display; EmailService, the actual sender, never consulted it. An admin could
--       suppress a hard-bounced address, get an audit row, and mail kept going to it.
--   R8  `redis.set(key, '1')` with NO TTL. Unbounded growth, but worse: Redis here is
--       not durable, so a restart or an eviction silently dropped the entire list and we
--       resumed mailing addresses that had bounced or complained.
--   R11 `suppress()` was the one Redis write with no try/catch, so it 500'd when Redis
--       was down — inconsistently fail-closed while every neighbouring path failed open.
--
-- Repeatedly mailing complained addresses is what gets a sending domain blocked, and
-- that takes weeks to undo with a mailbox provider. This is not cache data.
--
-- `email` is the primary key: the address IS the identity, and a surrogate id would
-- allow the same address to be suppressed twice. Callers lower-case and trim at the
-- boundary so the constraint does the deduplication.
--
-- `suppressedByAdminId` is deliberately NOT a foreign key. The record must outlive the
-- admin account that created it — a compliance record that disappears when someone
-- leaves is not a compliance record.
--
-- NO BACKFILL IS POSSIBLE. Whatever was in Redis under `email:suppressed:*` cannot be
-- migrated: the keys have no TTL but the store is not durable, and there is no way to
-- know from here what was ever in it. Any previously suppressed address must be
-- re-suppressed. That data loss already happened at the first Redis restart; this
-- migration is what stops it happening again.

CREATE TABLE "suppressed_emails" (
    "email"               TEXT NOT NULL,
    "reason"              TEXT,
    "suppressedByAdminId" TEXT,
    "suppressedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("email")
);

-- The admin list is "most recently suppressed first"; the send path looks up by primary
-- key and needs no index of its own.
CREATE INDEX "suppressed_emails_suppressedAt_idx" ON "suppressed_emails" ("suppressedAt");
