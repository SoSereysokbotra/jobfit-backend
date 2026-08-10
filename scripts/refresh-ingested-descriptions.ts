// Re-flatten the descriptions of already-ingested TheMuse jobs, using the structure-
// preserving converter. Run:
//   npx ts-node -r tsconfig-paths/register scripts/refresh-ingested-descriptions.ts [--dry]
//
// WHY A SEPARATE SCRIPT AND NOT A RE-INGEST. Fixing `htmlToText` only helps postings
// ingested from now on — the rows already in the database hold text whose paragraph and
// bullet boundaries were destroyed at write time and cannot be recovered from the stored
// string. A normal re-ingest WOULD repair them, but it pulls the current TheMuse pages,
// so it also inserts whatever is new and changes the corpus the retrieval and calibration
// baselines were measured against. This fetches each stored posting by its own
// externalId and rewrites nothing but `description`.
//
// A posting that has since been taken down (404) is left exactly as it is: a stale but
// readable description beats an empty one.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { htmlToText } from '../src/modules/ingestion/html-to-text';

const JOB_URL = 'https://www.themuse.com/api/public/jobs';
/** TheMuse is rate-limited and unauthenticated here; be a polite client. */
const DELAY_MS = 350;
const TIMEOUT_MS = 15_000;

const DRY = process.argv.includes('--dry');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const jobs = await prisma.job.findMany({
      where: { source: 'THEMUSE', externalId: { not: null } },
      select: { id: true, externalId: true, title: true, description: true },
    });
    console.log(`${jobs.length} ingested job(s)${DRY ? ' (dry run)' : ''}\n`);

    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const job of jobs) {
      let contents: string | null = null;
      try {
        const res = await fetch(`${JOB_URL}/${job.externalId}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { contents?: string };
        contents = body.contents ?? null;
      } catch (err) {
        failed++;
        console.log(`  ! ${job.title.slice(0, 48).padEnd(48)} ${(err as Error).message}`);
        await sleep(DELAY_MS);
        continue;
      }

      const next = htmlToText(contents ?? '');
      // An empty result means the source gave us nothing usable — never blank a row.
      if (!next) {
        failed++;
        console.log(`  ! ${job.title.slice(0, 48).padEnd(48)} empty after conversion`);
        await sleep(DELAY_MS);
        continue;
      }
      if (next === job.description) {
        unchanged++;
      } else {
        if (!DRY) {
          await prisma.job.update({ where: { id: job.id }, data: { description: next } });
        }
        updated++;
        const before = (job.description.match(/\n/g) ?? []).length;
        const after = (next.match(/\n/g) ?? []).length;
        console.log(
          `  ✓ ${job.title.slice(0, 48).padEnd(48)} newlines ${before} -> ${after}`,
        );
      }
      await sleep(DELAY_MS);
    }

    console.log(
      `\nupdated ${updated}, unchanged ${unchanged}, failed ${failed}` +
        (DRY ? '  (dry run — nothing written)' : ''),
    );
    if (updated > 0 && !DRY) {
      console.log(
        '\nJob embeddings are built from title + description, so they are now stale.\n' +
          'Run: npx ts-node -r tsconfig-paths/register scripts/backfill-embeddings.ts',
      );
    }
  } finally {
    await app.close();
  }
}

void main();
