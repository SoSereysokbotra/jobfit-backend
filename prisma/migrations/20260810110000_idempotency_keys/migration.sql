-- Idempotency keys — replay protection for queued offline mutations (PWA Phase 1).
--
-- A PWA queues mutations while offline and flushes them on reconnect. Without a receipt
-- of "this action already happened", a retried POST /applications creates a second
-- application. This table is that receipt.
--
-- `key` is client-generated and globally unique; it is additionally checked against the
-- user, the endpoint and a hash of the body on read, so a key accidentally reused for a
-- different action is rejected (409) rather than served someone else's cached response.
--
-- Rows expire after 24h. The expiresAt index exists for the cleanup sweep, which is the
-- only query that filters on it.
--
-- NOTE: authored by hand rather than via `prisma migrate dev`. The migration history
-- cannot currently be replayed from scratch — no migration creates the `offers` table
-- (it predates the migrations directory), so `migrate dev`'s shadow database fails at
-- 20260809090000_offer_messages with P3006/P1014. That gap is pre-existing and separate
-- from this change; this migration is applied with `prisma migrate deploy`.

CREATE TABLE "idempotency_keys" (
  "id"             TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "endpoint"       TEXT NOT NULL,
  "requestHash"    TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "responseBody"   JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- One receipt per client-generated key. This unique constraint is also what makes two
-- concurrent replays race safely: the loser's insert fails and is swallowed fail-open.
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- Drives the cleanup sweep's deleteMany({ expiresAt: { lt: now } }).
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");
CREATE INDEX "idempotency_keys_userId_idx"    ON "idempotency_keys"("userId");

ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
