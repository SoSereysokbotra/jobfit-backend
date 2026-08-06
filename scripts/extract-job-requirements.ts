/**
 * Backfill `Job.extractedRequirements` for published jobs that carry no employer-authored
 * requirements — 43 of 52 today, all ingested from TheMuse.
 *
 * Requirements are read out of the free-text description by the AI service. That is the one
 * step in the skill-gap feature where an LLM earns its keep; the comparison against résumé
 * skills afterwards is deterministic and stays model-free.
 *
 * Reports groundedness per job and in aggregate. A low or falling value means extraction is
 * drifting into invention — the model produced "Experience with Docker and Kubernetes" for a
 * Welding Engineer posting containing neither word, and only a measurement catches that.
 *
 * Usage (AI service must be up):
 *   npx ts-node -r tsconfig-paths/register scripts/extract-job-requirements.ts [limit=10]
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JobRequirementsExtractionService } from '../src/modules/job/application/services/job-requirements-extraction.service';

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  const value = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

async function main(): Promise<void> {
  const limit = arg('limit', 10);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const service = app.get(JobRequirementsExtractionService);
    const jobIds = await service.findPendingJobIds(limit);

    if (jobIds.length === 0) {
      console.log('Nothing to extract — no published jobs are missing requirements.');
      return;
    }
    console.log(`Extracting requirements for ${jobIds.length} job(s)…\n`);

    let extracted = 0;
    let dropped = 0;
    const groundedness: number[] = [];

    for (const [i, jobId] of jobIds.entries()) {
      const started = Date.now();
      const out = await service.extractForJob(jobId);
      const secs = ((Date.now() - started) / 1000).toFixed(1);

      if (out.skipped) {
        console.log(`${i + 1}/${jobIds.length}  SKIPPED (${out.skipped})`);
        continue;
      }
      extracted++;
      dropped += out.droppedUngrounded;
      groundedness.push(out.groundedness);
      console.log(
        `${i + 1}/${jobIds.length}  ${out.requirements.length} req · ` +
          `grounded ${out.groundedness} · dropped ${out.droppedUngrounded} · ${secs}s`,
      );
      for (const r of out.requirements.slice(0, 3)) {
        console.log(`      • ${r.slice(0, 90)}`);
      }
    }

    const mean =
      groundedness.length > 0
        ? groundedness.reduce((a, b) => a + b, 0) / groundedness.length
        : 0;

    console.log('\n─── summary ───');
    console.log(`  jobs extracted     : ${extracted}`);
    console.log(`  mean groundedness  : ${mean.toFixed(3)}`);
    console.log(`  invented, removed  : ${dropped}`);
    if (mean < 0.8) {
      // Not a hard failure — a number worth looking at, reported rather than buried.
      console.log('  ⚠ mean groundedness below 0.8 — inspect before trusting this batch.');
    }
  } finally {
    await app.close();
  }
}

void main().catch((err: Error) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
