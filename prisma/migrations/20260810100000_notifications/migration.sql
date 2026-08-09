-- Somewhere for a notification to go.
--
-- The notification module was three empty @OnEvent stubs and a service whose two methods
-- had empty bodies. The employer could only discover a candidate's negotiation message by
-- happening to open the pipeline board and noticing an unread badge.
--
-- `readAt` is a timestamp, not a boolean, so "when did they see it?" is answerable. The
-- mock feed this replaces kept read state in the React Query cache and lost it on reload.

CREATE TYPE "NotificationType" AS ENUM (
  'APPLICATION',
  'OFFER',
  'MESSAGE',
  'MATCH',
  'SYSTEM'
);

CREATE TABLE "notifications" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "link"      TEXT,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- The feed is always "this user's, newest first"; the bell badge counts this user's unread.
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_userId_readAt_idx"    ON "notifications"("userId", "readAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
