// scripts/diagnostics/drift-check.ts
//
// READ-ONLY drift diagnostics for the resumes/applications reconciliation.
// SELECT-only: no writes, no DDL. Each section is isolated in try/catch so a
// missing table/type in one section never aborts the others.
//
//   Run:  npx ts-node -r tsconfig-paths/register scripts/diagnostics/drift-check.ts
//
// Mirrors scripts/create-test-users.ts for env + Prisma wiring. Reads DATABASE_URL
// from the local (gitignored) .env.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// BigInt-safe stringify (COUNT/int8 can surface as BigInt).
const j = (v: unknown) =>
  JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? Number(val) : val), 2);

async function section(title: string, sql: string): Promise<void> {
  process.stdout.write(`\n===== ${title} =====\n`);
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    process.stdout.write(`${j(rows)}\n`);
  } catch (err) {
    process.stdout.write(`ERROR: ${(err as Error).message}\n`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    process.stdout.write(
      'DATABASE_URL is empty — paste it into the local .env before running.\n',
    );
    return;
  }
  process.stdout.write(`Connected target host: ${url.replace(/:\/\/[^@]*@/, '://***@')}\n`);

  // 1) Row counts — separate per table so a missing table doesn't hide the other.
  await section('1a. resumes row count', `SELECT COUNT(*)::int AS rows FROM resumes;`);
  await section('1b. applications row count', `SELECT COUNT(*)::int AS rows FROM applications;`);

  // 2) applications.status usage (destructive-drop risk for old enum values)
  await section(
    '2. applications.status usage',
    `SELECT status::text AS status, COUNT(*)::int AS rows
       FROM applications GROUP BY status ORDER BY rows DESC;`,
  );

  // 3) Live ApplicationStatus enum labels, in sort order
  await section(
    '3. ApplicationStatus enum labels (live)',
    `SELECT e.enumsortorder::int AS ord, e.enumlabel AS label
       FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ApplicationStatus' ORDER BY e.enumsortorder;`,
  );

  // 4) Actual column lists of both tables
  await section(
    '4. columns of resumes + applications',
    `SELECT table_name, ordinal_position::int AS pos, column_name, data_type,
            is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('resumes','applications')
      ORDER BY table_name, ordinal_position;`,
  );

  // 5) Applied migration history
  await section(
    '5. _prisma_migrations',
    `SELECT migration_name,
            CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'PENDING/FAILED'
                 WHEN rolled_back_at IS NOT NULL THEN 'ROLLED_BACK'
                 ELSE 'applied' END AS state,
            started_at, finished_at, rolled_back_at
       FROM _prisma_migrations ORDER BY started_at;`,
  );

  // 6) All FKs touching resumes/applications (inbound + outbound) — preserve these.
  await section(
    '6. foreign keys touching resumes/applications',
    `SELECT tc.table_name AS from_table, kcu.column_name AS from_column,
            ccu.table_name AS to_table, ccu.column_name AS to_column,
            tc.constraint_name, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND ('resumes' IN (tc.table_name, ccu.table_name)
          OR 'applications' IN (tc.table_name, ccu.table_name))
      ORDER BY from_table, from_column;`,
  );

  // 7) Indexes / unique constraints on both tables (for the unique-key swap)
  await section(
    '7. indexes on resumes + applications',
    `SELECT tablename, indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('resumes','applications')
      ORDER BY tablename, indexname;`,
  );

  // 8) All base tables present
  await section(
    '8. base tables present',
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;`,
  );
}

main()
  .catch((e) => {
    process.stdout.write(`FATAL: ${(e as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
