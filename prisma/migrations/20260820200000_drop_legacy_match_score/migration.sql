-- Two tables answered the same question. One of them could never answer it.
--
-- MENTOR_REVIEW_2026-08-18 sec 15. `match_scores` (jobId + jobSeekerProfileId -> score,
-- breakdown) and `recommendations` (userId + jobId -> score, breakdown, reason) held the
-- same data under two identity models, and a reader could not tell which was
-- authoritative.
--
-- Verified at 6dcd59e against the live database AND every local and remote branch:
--
--   match_scores          0 rows   -- no branch, anywhere, writes it
--   job_seeker_profiles   0 rows   -- referenced by NO TypeScript at all, only the schema
--   recommendations     749 rows   -- written by the pipeline, read by /recommendations
--   profiles             10 rows   -- the identity the pipeline actually uses
--
-- `match_scores` was not merely unused, it was UNPOPULATABLE: its foreign key requires a
-- `job_seeker_profiles` row, that table has none, and no code creates one. Its only reader
-- was EmployerJobRepository.analytics(), whose AVG(score) over an empty table returned
-- NULL every time -- so the employer's "Avg Match" card has never once shown a number.
-- That read now goes to `recommendations`.
--
-- `job_seeker_profiles` goes with it: `match_scores` was its only dependent, no code
-- references it, and the candidate identity for the matching domain is `profiles`/`User`
-- (the Recommendation model's own comment already said so). An empty table with no code
-- and no dependents is precisely the dead schema this finding is about.
--
-- Both tables are empty, so this destroys no data. The 749 recommendations are untouched.

DROP TABLE IF EXISTS "match_scores";
DROP TABLE IF EXISTS "job_seeker_profiles";
