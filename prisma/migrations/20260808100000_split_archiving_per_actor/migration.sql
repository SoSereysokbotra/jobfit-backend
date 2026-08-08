-- Archiving becomes a per-actor view flag instead of a shared status.
--
-- ApplicationStatus.ARCHIVED made one party's tidying rewrite a record the other party
-- reads, and overwrote the terminal status underneath it. These columns let each side hide
-- its own list while the status keeps saying what actually happened.
--
-- Existing rows with status = 'ARCHIVED' are NOT converted: the status they held before
-- archiving is not recoverable for rows written before the audit trail existed, and
-- guessing one would put a fabricated outcome in the record. The enum value stays valid so
-- those rows keep loading; nothing writes it any more.

ALTER TABLE "applications" ADD COLUMN "archivedByCandidateAt" TIMESTAMP(3);
ALTER TABLE "applications" ADD COLUMN "archivedByEmployerAt"  TIMESTAMP(3);

-- Each side filters its own list on its own column.
CREATE INDEX "applications_archivedByCandidateAt_idx" ON "applications"("archivedByCandidateAt");
CREATE INDEX "applications_archivedByEmployerAt_idx"  ON "applications"("archivedByEmployerAt");
