// Run the Phase C GENERATION evaluation over the labels in match_labels: call the
// AI service's /match/reason for each labeled (candidate, job) pair and measure
// calibration (Spearman ρ vs the human grade) + faithfulness (are the CV quotes real?).
//
// Needs the AI service up (see the handoff §2). Prints the report to stdout AND
// persists it to eval/reports/generation-<timestamp>.md, plus the raw per-pair rows
// as .json so a later prompt version can be diffed against this run.
//
// Run: npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts [options]
//   v=<version>   prompt version on the AI service (default v1)
//   limit=<n>     only the first n pairs (smoke run)
//   c=<n>         concurrent /match/reason calls (default 4)

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { AiClient } from '../src/infra/ai/ai.client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import {
  GenerationEvalService,
  formatGenerationReportMarkdown,
} from '../src/modules/matching/evaluation/generation-eval.service';
import { EvalLabel } from '../src/modules/matching/evaluation/retrieval-eval.service';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

const PROMPT_VERSION = arg('v') ?? 'v1';
const LIMIT = arg('limit') ? Number(arg('limit')) : undefined;
const CONCURRENCY = Number(arg('c') ?? 4);

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const service = app.get(GenerationEvalService);

    // Fail fast and loudly: a down AI service would otherwise show up as 150
    // degraded rows and a meaningless report.
    try {
      await app.get(AiClient).health();
    } catch (err) {
      console.error(
        `AI service unreachable (${(err as Error).message}). Start it first — see ` +
          'docs/RAG_PHASE_C_HANDOFF.md §2.',
      );
      process.exit(1);
    }

    const labels = (await prisma.matchLabel.findMany({
      select: {
        userId: true, jobId: true, label: true,
        category: true, seniority: true, language: true,
      },
      orderBy: [{ userId: 'asc' }, { jobId: 'asc' }], // stable across runs => comparable
    })) as EvalLabel[];

    if (labels.length === 0) {
      console.error(
        'No labels in match_labels. Generate a worksheet (eval-export-worksheet), ' +
          'label it, then load it (eval-load-labels) before evaluating.',
      );
      process.exit(1);
    }

    console.log(
      `Evaluating ${LIMIT ?? labels.length} pair(s) with prompt ${PROMPT_VERSION} ` +
        `at concurrency ${CONCURRENCY}...`,
    );
    const report = await service.evaluate(labels, {
      promptVersion: PROMPT_VERSION,
      limit: LIMIT,
      concurrency: CONCURRENCY,
    });

    const md = formatGenerationReportMarkdown(report);
    console.log(md);

    const dir = join(__dirname, '..', 'eval', 'reports');
    mkdirSync(dir, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const base = `generation-${PROMPT_VERSION}-${stamp}`;
    writeFileSync(join(dir, `${base}.md`), md, 'utf8');
    // Raw rows: lets C3 diff two prompt versions pair-by-pair, not just in aggregate.
    writeFileSync(join(dir, `${base}.json`), JSON.stringify(report.rows, null, 2), 'utf8');
    console.log(`Report written to eval/reports/${base}.md (+ .json rows)`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
