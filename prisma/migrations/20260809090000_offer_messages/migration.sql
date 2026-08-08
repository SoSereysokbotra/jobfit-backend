-- Offer negotiation becomes a real conversation.
--
-- Offer.notes was being used as a thread: the employer's note with candidate replies
-- appended as "[Candidate] …". It could hold exactly one candidate message before the
-- write path refused (NEGOTIATING -> NEGOTIATING is not a transition), and the employer's
-- own note write REPLACED the column, deleting whatever the candidate had said.

CREATE TYPE "OfferMessageAuthor" AS ENUM ('CANDIDATE', 'EMPLOYER');

CREATE TABLE "offer_messages" (
    "id"           TEXT NOT NULL,
    "offerId"      TEXT NOT NULL,
    "authorRole"   "OfferMessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "body"         TEXT NOT NULL,
    "readAt"       TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "offer_messages_offerId_createdAt_idx" ON "offer_messages"("offerId", "createdAt");
CREATE INDEX "offer_messages_offerId_readAt_idx"    ON "offer_messages"("offerId", "readAt");

ALTER TABLE "offer_messages" ADD CONSTRAINT "offer_messages_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_messages" ADD CONSTRAINT "offer_messages_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Carry the existing conversations across ──────────────────────────────────
--
-- Real users' words live in that column; dropping them would be discarding what people
-- actually wrote. Each newline-separated line becomes a message, attributed by its
-- "[Candidate]" prefix and kept in order.
--
-- TIMESTAMPS ARE NOT REAL. No per-message time was ever recorded, so migrated rows get the
-- offer's creation time plus one second per line — enough to preserve ORDER, and not a
-- claim about when anything was actually said.
INSERT INTO "offer_messages" ("id", "offerId", "authorRole", "authorUserId", "body", "readAt", "createdAt")
SELECT
    gen_random_uuid()::text,
    o."id",
    CASE WHEN line LIKE '[Candidate]%' THEN 'CANDIDATE' ELSE 'EMPLOYER' END::"OfferMessageAuthor",
    CASE WHEN line LIKE '[Candidate]%' THEN a."userId" ELSE o."extendedByEmployerId" END,
    btrim(regexp_replace(line, '^\[Candidate\]', '')),
    -- Migrated history is not "new"; leaving it unread would show a false badge on a
    -- conversation both sides have already had.
    o."createdAt",
    o."createdAt" + (idx || ' seconds')::interval
FROM "offers" o
JOIN "applications" a ON a."id" = o."applicationId",
LATERAL unnest(string_to_array(o."notes", E'\n')) WITH ORDINALITY AS t(line, idx)
WHERE o."notes" IS NOT NULL
  AND btrim(o."notes") <> ''
  AND btrim(line) <> '';
