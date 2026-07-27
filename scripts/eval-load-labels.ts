// Load the human-editable eval set into the match_labels table (idempotent upsert).
// Run: npx ts-node -r tsconfig-paths/register scripts/eval-load-labels.ts [path]
// Default path: eval/match-labels.jsonl

import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { parseLabelsJsonl } from '../src/modules/matching/evaluation/eval-set.loader';

const FILE = process.argv[2] ?? join(__dirname, '..', 'eval', 'match-labels.jsonl');

async function main(): Promise<void> {
  const text = readFileSync(FILE, 'utf8');
  const { labels, errors, duplicates } = parseLabelsJsonl(text);

  if (errors.length) {
    console.error(`${errors.length} malformed line(s) skipped:`);
    errors.forEach((e) => console.error(`  ${e}`));
  }
  if (duplicates) console.warn(`${duplicates} duplicate (userId,jobId) pair(s) — last wins.`);
  if (labels.length === 0) {
    console.error('No valid labels to load.');
    process.exit(errors.length ? 1 : 0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    let upserted = 0;
    let skipped = 0;
    for (const l of labels) {
      try {
        await prisma.matchLabel.upsert({
          where: { userId_jobId: { userId: l.userId, jobId: l.jobId } },
          update: {
            label: l.label, reason: l.reason, source: l.source,
            category: l.category, seniority: l.seniority, language: l.language,
          },
          create: {
            userId: l.userId, jobId: l.jobId, label: l.label, reason: l.reason,
            source: l.source, category: l.category, seniority: l.seniority, language: l.language,
          },
        });
        upserted++;
      } catch {
        // Most likely an FK violation: userId/jobId doesn't exist. Report and continue.
        skipped++;
        console.error(`  skipped ${l.userId} / ${l.jobId} (unknown user or job?)`);
      }
    }
    console.log(`Loaded ${upserted} label(s) into match_labels${skipped ? `, skipped ${skipped}` : ''}.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
