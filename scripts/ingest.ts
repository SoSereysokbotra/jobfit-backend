// Trigger an ingestion run from the command line.
//   npx ts-node -r tsconfig-paths/register scripts/ingest.ts <SOURCE> [limit]
//   e.g.                                             ... scripts/ingest.ts JOBNET 10
//
// The HTTP route needs an EMPLOYER token; this is the same service call without one, for
// operating the thing.
//
// READ THE SKIP COUNT. A run that fetches many and skips many has not "mostly worked" —
// it means the parsing assumptions no longer match the site, and the fix is to look at
// what came back, not to loosen the parser. See docs/INGESTION_KH_PLAN.md §5.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';
import { JobSource } from '../src/modules/ingestion/ingestion.types';

const SOURCES: JobSource[] = ['THEMUSE', 'BONGTHOM', 'JOBNET'];

async function main(): Promise<void> {
  const source = (process.argv[2] ?? '').toUpperCase() as JobSource;
  const limit = Number.parseInt(process.argv[3] ?? '25', 10);

  if (!SOURCES.includes(source)) {
    console.error(`Usage: ingest.ts <${SOURCES.join('|')}> [limit]`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(IngestionService).ingest(source, limit);
    console.log('\n' + JSON.stringify(result, null, 2));

    const { fetched, skipped, errors } = result;
    if (fetched === 0) {
      console.log('\n⚠️  Fetched NOTHING. The source shape has probably changed.');
    } else if (skipped / fetched > 0.2) {
      console.log(
        `\n⚠️  Skipped ${skipped} of ${fetched} (>20%). Do not loosen the parser — ` +
          'look at what the site actually returned.',
      );
    }
    if (errors.length > 0) console.log(`\n${errors.length} error(s) recorded.`);
  } finally {
    await app.close();
  }
}

void main();
