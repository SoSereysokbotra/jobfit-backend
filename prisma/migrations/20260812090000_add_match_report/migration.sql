-- Somewhere to keep a full-page match report.
--
-- The extension's badge can only show a score; the report is the roomy version of the
-- same answer (match rate, searchability, skills, recruiter tips) rendered by the web app.
--
-- `payload` is the WHOLE rendered report rather than the ids to recompute it from: the
-- scores are a snapshot of the moment the user scanned, so revisiting the link shows what
-- they were shown — not a different answer produced by a résumé they have since edited.
--
-- PRIVACY: the job description the extension captured is used once to extract requirements
-- and is NOT stored as a listing. Only the derived report lives here, on the user's own row.

CREATE TABLE "match_reports" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "company"    TEXT,
  "payload"    JSONB NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_reports_pkey" PRIMARY KEY ("id")
);

-- Every read is "this user's report" (owner-scoped fetch, and a future scan history).
CREATE INDEX "match_reports_userId_idx" ON "match_reports"("userId");

ALTER TABLE "match_reports"
  ADD CONSTRAINT "match_reports_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
