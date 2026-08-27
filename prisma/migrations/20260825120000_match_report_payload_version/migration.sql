-- Which version of the report builder produced a stored payload.
--
-- The reuse check keys on the posting text and the résumé, so an unchanged job and an
-- unchanged CV correctly return the stored report. That made every IMPROVEMENT to the
-- report invisible: after fixing two defects on 2026-08-25 (a degree requirement counted
-- twice, and a "nice to have" counted among the candidate's gaps), re-scanning the same
-- posting kept serving the old payload — neither input had changed, but the code had.
--
-- Existing rows default to 1 and will be rebuilt on their owner's next scan.

ALTER TABLE "match_reports"
  ADD COLUMN "payloadVersion" INTEGER NOT NULL DEFAULT 1;
