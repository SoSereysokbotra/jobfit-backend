// What do the two-dimensional scores actually say about a real candidate's real feed?
//
// READ-ONLY. It retrieves and scores through the production path and prints the result;
// it writes nothing, so it can be run against the live database while you are looking at
// the dashboard. The cached `score` column is printed beside the new one, which is the
// comparison that matters: those rows were written by the old linear sum.
//
// Run:
//   npx ts-node -r tsconfig-paths/register scripts/diagnostics/two-dimensional-preview.ts
//   npx ts-node -r tsconfig-paths/register scripts/diagnostics/two-dimensional-preview.ts user@example.com
//
// Needs the candidate to HAVE an embedding (`profiles.embeddingStatus = SUCCESS`) —
// without one there is no cosine and no pool to score. It does not need the AI service:
// the reranker is switched off so the run is deterministic and offline.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../../src/modules/matching/application/use-cases/recompute-user-matches.use-case';

const LIMIT = 15;

async function main(): Promise<void> {
  const email = process.argv[2];
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const recompute = app.get(RecomputeUserMatchesUseCase);

    const profile = email
      ? await prisma.profile.findFirst({
          where: { user: { email } },
          include: { user: { select: { email: true } } },
        })
      : // No argument: whoever can actually be scored. A profile without an embedding
        // produces an empty feed, and an empty feed proves nothing about the scorer.
        await prisma.profile.findFirst({
          where: { embeddingStatus: 'SUCCESS', deletedAt: null },
          include: { user: { select: { email: true } } },
        });

    if (!profile) {
      console.error(
        email
          ? `No profile for ${email}.`
          : 'No profile with a SUCCESS embedding — run scripts/backfill-embeddings.ts first.',
      );
      return;
    }

    console.log(`\nCandidate: ${profile.user.email}`);
    console.log(`  location            ${profile.city ?? '—'}, ${profile.country ?? '—'}`);
    console.log(`  desiredRemoteTypes  ${fmt(profile.desiredRemoteTypes)}`);
    console.log(`  desiredEmployment   ${fmt(profile.desiredEmploymentTypes)}`);
    console.log(`  desiredJobLevels    ${fmt(profile.desiredJobLevels)}`);
    console.log(`  minSalary           ${profile.minSalary ?? '—'}`);
    console.log(`  embedding           ${profile.embeddingStatus}\n`);

    // The cache as it stands. These numbers came from the OLD linear sum, which is
    // exactly what makes them worth printing next to the new ones.
    const cached = await prisma.recommendation.findMany({
      where: { userId: profile.userId, dismissedAt: null },
      select: { jobId: true, score: true },
    });
    const oldScoreByJob = new Map(cached.map((r) => [r.jobId, r.score]));

    // The production retrieval + scoring path, with the reranker off.
    const near = await recompute.retrieveRankedJobs(profile.userId, LIMIT, {
      rerank: false,
    });
    const scored = await recompute.scoreJobs(profile.userId, near);
    if (!scored || scored.length === 0) {
      console.error('Nothing retrieved — no job embeddings, or no candidate vector.');
      return;
    }

    const titles = new Map(
      (
        await prisma.job.findMany({
          where: { id: { in: scored.map((s) => s.jobId) } },
          select: { id: true, title: true },
        })
      ).map((j) => [j.id, j.title]),
    );

    console.table(
      [...scored]
        .sort((a, b) => b.score - a.score)
        .map((s) => ({
          job: (titles.get(s.jobId) ?? s.jobId).slice(0, 34),
          cached: oldScoreByJob.has(s.jobId)
            ? Math.round(oldScoreByJob.get(s.jobId) as number)
            : '—',
          overall: s.score,
          role: s.roleFitScore,
          pref: s.preferenceFitScore,
          band: s.band,
          conflicts: s.flags.warnings.length,
        })),
    );

    // The warnings are the half the old explanation could not express, so print them in
    // full rather than as a count.
    console.log('\nWhat the user would now be told:\n');
    for (const s of [...scored].sort((a, b) => b.score - a.score)) {
      console.log(`  ${s.reasonExplanation}`);
    }

    const withConflicts = scored.filter((s) => s.flags.hasDealbreakerMismatch).length;
    console.log(
      `\n${withConflicts} of ${scored.length} retrieved jobs break a preference this ` +
        `candidate actually stated.\n`,
    );
  } finally {
    await app.close();
  }
}

function fmt(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '— (none stated)';
}

void main();
