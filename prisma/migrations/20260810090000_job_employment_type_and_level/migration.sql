-- What a posting actually is: employment type and experience level.
--
-- The frontend's job mapper hardcoded `type: "Full-time"` and `level: "Mid-level"` on
-- every job, because the Job table had nothing to map. Job cards render both as pills, so
-- every card in search, saved jobs, the dashboard and recommendations claimed
-- "Full-time · Mid-level" — including the part-time teaching posting. The EmploymentType
-- and JobLevel enums already existed and were used by no model.
--
-- BOTH COLUMNS ARE NULLABLE AND STAY NULL FOR EVERY EXISTING ROW. Backfilling a default
-- would recreate exactly the bug being fixed, one layer deeper and much harder to see: a
-- fabricated value in the database is indistinguishable from an employer's own answer.
-- "The employer has not said" is the truth about all 55 existing postings, and the API and
-- UI must render it as nothing rather than as a guess.

ALTER TABLE "jobs" ADD COLUMN "employmentType"  "EmploymentType";
ALTER TABLE "jobs" ADD COLUMN "experienceLevel" "JobLevel";

-- Both are filter facets on the job search page.
CREATE INDEX "jobs_employmentType_idx"  ON "jobs"("employmentType");
CREATE INDEX "jobs_experienceLevel_idx" ON "jobs"("experienceLevel");
