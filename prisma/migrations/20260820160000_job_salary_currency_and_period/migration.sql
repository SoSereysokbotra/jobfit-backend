-- A salary integer with no currency and no period is not a fact, it is a guess.
--
-- MENTOR_REVIEW_2026-08-18 §12. `jobs.minSalary/maxSalary` were bare integers. `Profile`
-- has had `salaryCurrency` since Phase 3; `Job` never did, so every posting was rendered
-- as USD by assumption -- in a corpus that is 83% Cambodian. Worse, nothing recorded the
-- PERIOD: a Phnom Penh posting quoting 500/month and a US posting quoting 500/year are
-- the same integer in the same column, and the client had to invent the answer.
--
-- salaryCurrency defaults to 'USD' to match Profile.salaryCurrency and because every row
-- that currently HAS a salary is a US-style annual figure entered through the internal
-- employer form (verified below). A default here is a real default, not a fabrication.
--
-- salaryPeriod is deliberately NULLABLE WITH NO DEFAULT. Null means "we do not know",
-- which is the honest answer for anything ingested. Defaulting it to ANNUAL would repeat
-- the exact defect this migration exists to fix, one layer down.

CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL');

ALTER TABLE "jobs"
  ADD COLUMN "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salaryPeriod"   "SalaryPeriod";

-- Back-fill ANNUAL for existing rows, but ONLY where the magnitude makes the period
-- unambiguous.
--
-- Checked at 2026-08-20 against the live database: 19 of 367 jobs carry a salary, every
-- one of them INTERNAL (created through the employer form, which is annual by design),
-- and the smallest is 24,000. No plausible reading of 24,000 is hourly, daily, weekly or
-- monthly pay, so ANNUAL is a deduction rather than an assumption.
--
-- The >= 10000 guard is what keeps that true for any row this misses or that lands
-- between writing and running: a figure below it could genuinely be monthly Cambodian
-- pay, and those must stay NULL so the UI says nothing rather than the wrong thing.
UPDATE "jobs"
   SET "salaryPeriod" = 'ANNUAL'
 WHERE "minSalary" IS NOT NULL
   AND "minSalary" >= 10000;
