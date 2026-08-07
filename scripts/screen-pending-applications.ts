/**
 * Screen applications that predate the AI Recruiter (AI_RECRUITER_PLAN.md Phase 2).
 *
 * New applications are screened at submit. This backfills the ones already in the
 * database — including the seeded demo candidates — so the employer view has something to
 * rank without anyone having to re-apply.
 *
 * Idempotent: `screen` skips any application that already carries an assessment, because
 * that assessment records the moment of applying and must not be rewritten.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/screen-pending-applications.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ApplicationScreeningService } from '../src/modules/matching/application/services/application-screening.service';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const screening = app.get(ApplicationScreeningService);
    const pending = await prisma.application.findMany({
      where: { screenedAt: null, deletedAt: null },
      select: {
        id: true,
        user: { select: { email: true } },
        job: { select: { title: true } },
      },
    });

    if (pending.length === 0) {
      console.log('Nothing to screen — every application already has an assessment.');
      return;
    }
    console.log(`Screening ${pending.length} application(s)…\n`);

    const rows: { who: string; job: string; score: number | null; covered: string }[] = [];
    for (const a of pending) {
      const out = await screening.screen(a.id);
      rows.push({
        who: a.user.email.split('@')[0],
        job: a.job.title,
        score: out.matchScore,
        covered: out.screened ? `${out.requirementsCovered}/${out.requirementsTotal}` : (out.skipped ?? '—'),
      });
    }

    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    console.log('  candidate     score   requirements covered   job');
    for (const r of rows) {
      const score = r.score === null ? '  —  ' : `${String(r.score).padStart(3)}%`;
      console.log(`  ${r.who.padEnd(13)} ${score}   ${r.covered.padEnd(21)} ${r.job.slice(0, 34)}`);
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

void main().catch((err: Error) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
