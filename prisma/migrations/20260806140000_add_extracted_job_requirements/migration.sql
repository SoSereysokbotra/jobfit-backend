-- Requirements read OUT of a job's free-text description by the AI service.
--
-- 43 of 52 jobs are ingested from TheMuse and carry no employer-authored `requirements`,
-- so the skill-gap feature had nothing to compare a résumé against. Extraction is an LLM
-- call (~7s per job) and is therefore cached here rather than derived per request.
--
-- Kept separate from `requirements`: employer-authored text stays authoritative, and a
-- model-derived list must always be distinguishable from one a human wrote.
--
-- `requirementsGroundedness` records the grounded share of the model's raw output at
-- extraction time, so a batch that silently began inventing is visible after the fact.
-- Measured need: the model produced "Experience with Docker and Kubernetes" for a Welding
-- Engineer posting containing neither word.
ALTER TABLE "jobs" ADD COLUMN "extractedRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "jobs" ADD COLUMN "requirementsExtractedAt" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN "requirementsGroundedness" DOUBLE PRECISION;
