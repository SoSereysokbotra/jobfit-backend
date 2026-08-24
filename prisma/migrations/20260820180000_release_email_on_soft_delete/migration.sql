-- A deleted account kept its email forever, so the user could never come back.
--
-- MENTOR_REVIEW_2026-08-18 §14. `users.email` is UNIQUE and soft delete only set
-- `deletedAt`, so the address stayed occupied by a row nobody could log into. The only
-- way to free it was a hard delete out-of-band (the Supabase console) -- which cascades
-- to `match_labels` and is the documented cause of 50 hand-labelled evaluation pairs
-- being destroyed (HANDOFF_2026-08-17 sec 6).
--
-- Soft delete now rewrites `email` to a reserved tombstone and moves the original here,
-- so re-registration works and the console workaround stops being necessary.
--
-- Nullable and unconstrained on purpose: it is a record, not an identity. It must NOT be
-- unique -- the same person may register and delete more than once, and a unique index
-- here would recreate the dead end one column over.

ALTER TABLE "users"
  ADD COLUMN "deletedEmail" TEXT;
