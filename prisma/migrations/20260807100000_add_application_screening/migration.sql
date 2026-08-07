-- AI Recruiter: the screening snapshot taken when a candidate applies.
--
-- Stored rather than computed per view because it records what was true AT THE MOMENT OF
-- APPLYING. Recomputing on read would silently rewrite history as the candidate edits their
-- résumé or the employer edits the job, leaving an earlier hiring decision unexplainable.
--
-- `screenMatchScore` is the DETERMINISTIC scorer (embedding cosine for skills plus
-- rule-based experience/location/salary). It is NOT the LLM fitScore, which was measured
-- uncorrelated with real fit (Spearman rho 0.137 / -0.065 over 150 hand-graded pairs) and
-- is kept out of every user-facing path.
--
-- All columns are nullable: screening must never fail an application. An AI or database
-- hiccup leaves the row unscreened rather than costing the candidate their application.
ALTER TABLE "applications" ADD COLUMN "screenedAt" TIMESTAMP(3);
ALTER TABLE "applications" ADD COLUMN "screenMatchScore" DOUBLE PRECISION;
ALTER TABLE "applications" ADD COLUMN "screenRequirementsTotal" INTEGER;
ALTER TABLE "applications" ADD COLUMN "screenRequirementsCovered" INTEGER;
ALTER TABLE "applications" ADD COLUMN "screenMissingRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "applications" ADD COLUMN "screenRequirementsSource" TEXT;
