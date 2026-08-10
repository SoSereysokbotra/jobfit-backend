// Recompute stored recommendations for every candidate with a profile.
// Run: npx ts-node -r tsconfig-paths/register scripts/recompute-recommendations.ts
//
// WHY THIS IS NEEDED AT ALL. `recommendations` is a CACHE — score, breakdown and reason
// are written once and read back by GET /recommendations. RecommendationsQueryService only
// recomputes when a user has ZERO rows, so after any change to the scorers or the
// retriever, every existing user keeps serving the old numbers indefinitely. Nothing else
// invalidates it (there is no nightly batch yet).
//
// So: change a scorer, run this, or the change is invisible to everyone who already has
// recommendations — which is the failure mode where a fix looks like it did not work.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../src/modules/matching/application/use-cases/recompute-user-matches.use-case';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const recompute = app.get(RecomputeUserMatchesUseCase);

    const profiles = await prisma.profile.findMany({
      where: { deletedAt: null },
      select: { userId: true, user: { select: { email: true } } },
    });

    let totalWritten = 0;
    for (const p of profiles) {
      const written = await recompute.execute(p.userId);
      totalWritten += written;
      console.log(`  ${p.user.email.padEnd(34)} ${written} recommendation(s)`);
    }
    console.log(`\nRecomputed ${totalWritten} recommendation(s) across ${profiles.length} profile(s).`);
  } finally {
    await app.close();
  }
}

void main();
