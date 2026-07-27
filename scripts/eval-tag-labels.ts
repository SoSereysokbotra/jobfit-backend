// Backfill category/seniority/language on existing match_labels by inferring each
// job's slice tags. Only fills tags that are currently empty (never overwrites a
// hand-set tag). Run: npx ts-node -r tsconfig-paths/register scripts/eval-tag-labels.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { inferJobSlices } from '../src/modules/matching/evaluation/job-slices';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const labels = await prisma.matchLabel.findMany({
      include: { job: { select: { title: true, description: true } } },
    });

    let updated = 0;
    for (const l of labels) {
      const s = inferJobSlices(l.job);
      const data: { category?: string; seniority?: string; language?: string } = {};
      if (!l.category) data.category = s.category;
      if (!l.seniority) data.seniority = s.seniority;
      if (!l.language) data.language = s.language;
      if (Object.keys(data).length === 0) continue;
      await prisma.matchLabel.update({ where: { id: l.id }, data });
      updated++;
    }
    console.log(`Tagged ${updated} of ${labels.length} label(s) (empty tags only).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
