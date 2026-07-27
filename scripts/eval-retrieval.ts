// Run the Phase A retrieval evaluation over the labels in match_labels, using the
// REAL production retrieval query. Prints the report to stdout AND persists it to
// eval/reports/<timestamp>.md so before/after runs (Phase B/C) can be compared.
//
// Run: npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts [k]

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import {
  RetrievalEvalService,
  formatReportMarkdown,
  EvalLabel,
} from '../src/modules/matching/evaluation/retrieval-eval.service';

const K = Number(process.argv[2] ?? 10);
// Pass "rerank" as the 2nd arg to measure the LLM reranker (needs the AI service up).
const RERANK = process.argv.slice(2).includes('rerank');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const service = app.get(RetrievalEvalService);

    const labels = (await prisma.matchLabel.findMany({
      select: {
        userId: true, jobId: true, label: true,
        category: true, seniority: true, language: true,
      },
    })) as EvalLabel[];

    if (labels.length === 0) {
      console.error(
        'No labels in match_labels. Generate a worksheet (eval-export-worksheet), ' +
          'label it, then load it (eval-load-labels) before evaluating.',
      );
      process.exit(1);
    }

    const report = await service.evaluate(labels, K, { rerank: RERANK });
    const md = formatReportMarkdown(report);
    console.log(md);

    const dir = join(__dirname, '..', 'eval', 'reports');
    mkdirSync(dir, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    writeFileSync(join(dir, `${stamp}.md`), md, 'utf8');
    console.log(`Report written to eval/reports/${stamp}.md`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
