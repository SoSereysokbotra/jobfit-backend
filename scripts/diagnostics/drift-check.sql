-- ============================================================================
-- READ-ONLY drift diagnostics for the resumes/applications reconciliation.
-- Safe: SELECT-only, no writes, no DDL. Run in the Supabase SQL editor or:
--   psql "$DATABASE_URL" -f scripts/diagnostics/drift-check.sql
-- (If a table is missing, that section errors — run sections individually.)
-- ============================================================================

-- 1) Row counts (are these tables empty? -> decides rebuild vs additive+backfill)
SELECT 'resumes'      AS tbl, COUNT(*)::int AS rows FROM resumes
UNION ALL
SELECT 'applications' AS tbl, COUNT(*)::int AS rows FROM applications;

-- 2) applications.status usage breakdown (destructive-drop risk for old enum values)
SELECT status::text AS status, COUNT(*)::int AS rows
FROM applications
GROUP BY status
ORDER BY rows DESC;

-- 3) Defined labels of the live ApplicationStatus enum (in sort order)
SELECT e.enumsortorder AS ord, e.enumlabel AS label
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'ApplicationStatus'
ORDER BY e.enumsortorder;

-- 4) Actual column lists of both tables (confirm userId/deletedAt/parsingStatus absence)
SELECT table_name, ordinal_position AS pos, column_name, data_type,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('resumes', 'applications')
ORDER BY table_name, ordinal_position;

-- 5) Applied migration history (which of the 5 migrations Prisma recorded)
SELECT migration_name,
       CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'PENDING/FAILED'
            WHEN rolled_back_at IS NOT NULL THEN 'ROLLED_BACK'
            ELSE 'applied' END AS state,
       started_at, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY started_at;

-- 6) All foreign keys touching resumes/applications (inbound + outbound) --
--    must-do #2: preserve these when dropping/recreating.
SELECT tc.table_name   AS from_table,
       kcu.column_name AS from_column,
       ccu.table_name  AS to_table,
       ccu.column_name AS to_column,
       tc.constraint_name,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ('resumes' IN (tc.table_name, ccu.table_name)
    OR 'applications' IN (tc.table_name, ccu.table_name))
ORDER BY from_table, from_column;

-- 7) Indexes / unique constraints on both tables (for the unique-key swap)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('resumes', 'applications')
ORDER BY tablename, indexname;

-- 8) All base tables present (which new-model tables actually exist, e.g.
--    parsed_resume_data / application_timeline / contact_persons / stage_history)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
