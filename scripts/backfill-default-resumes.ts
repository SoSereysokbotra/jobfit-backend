// One-off backfill: give every user a default résumé, then re-embed the ones that moved.
//
// Run: npx ts-node -r tsconfig-paths/register scripts/backfill-default-resumes.ts
//      npx ts-node -r tsconfig-paths/register scripts/backfill-default-resumes.ts --dry-run
//
// WHY: `Resume.isDefault` shipped long before anything read it, so existing users have it
// false on every row and the AI silently used "newest by updatedAt". Uploads now claim the
// flag for a user's first CV, but that only helps new accounts. This closes the gap for
// everyone already in the database.
//
// The candidate embedding is built from the chosen résumé, so any user whose active CV
// actually CHANGES is re-embedded — otherwise the backfill would move the rule without
// moving the vectors, and matching would disagree with what the UI now shows as default.
//
// Requires the AI service (BGE-M3) to be running for the re-embed pass; without it those
// users are simply left un-embedded (MatchingEmbeddingService degrades rather than throws)
// and `backfill-embeddings.ts` can finish the job later.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { MatchingEmbeddingService } from '../src/modules/matching/application/services/matching-embedding.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const embeddings = app.get(MatchingEmbeddingService);

    // Users who have at least one readable résumé but no default among them.
    const candidates = await prisma.resume.groupBy({
      by: ['userId'],
      where: { parsingStatus: 'SUCCESS', deletedAt: null },
    });

    let assigned = 0;
    let reembedded = 0;
    let skipped = 0;

    for (const { userId } of candidates) {
      const existing = await prisma.resume.findFirst({
        where: { userId, isDefault: true, parsingStatus: 'SUCCESS', deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // The same résumé the old "newest by updatedAt" rule was already using, so for most
      // users this only records the existing behaviour rather than changing it.
      const newest = await prisma.resume.findFirst({
        where: { userId, parsingStatus: 'SUCCESS', deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (!newest) {
        skipped++;
        continue;
      }

      // A stale default on a deleted/unparsed row would break the "only one" invariant.
      const staleDefaults = await prisma.resume.count({
        where: { userId, isDefault: true, id: { not: newest.id } },
      });

      console.log(
        `${dryRun ? '[dry-run] ' : ''}user ${userId} -> résumé ${newest.id}` +
          (staleDefaults > 0 ? ` (clearing ${staleDefaults} stale default(s))` : ''),
      );

      if (!dryRun) {
        await prisma.$transaction([
          prisma.resume.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          }),
          prisma.resume.update({
            where: { id: newest.id },
            data: { isDefault: true },
          }),
        ]);

        // Only re-embed where the active résumé genuinely changed: it did if some other
        // row held the flag, since the vector was built from a different CV.
        if (staleDefaults > 0 && (await embeddings.embedCandidate(userId))) {
          reembedded++;
        }
      }
      assigned++;
    }

    console.log(
      `\n${dryRun ? '[dry-run] would assign' : 'assigned'}: ${assigned}` +
        `  already had one: ${skipped}  re-embedded: ${reembedded}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
