// One-off backfill: embed all existing jobs + candidate profiles.
// Run: npx ts-node -r tsconfig-paths/register scripts/backfill-embeddings.ts
// Requires the AI service (BGE-M3) and Redis to be running.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MatchingEmbeddingService } from '../src/modules/matching/application/services/matching-embedding.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const svc = app.get(MatchingEmbeddingService);

    console.log('Embedding jobs…');
    console.log('  jobs:', await svc.embedAllJobs());

    console.log('Embedding candidates…');
    console.log('  candidates:', await svc.embedAllCandidates());
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
