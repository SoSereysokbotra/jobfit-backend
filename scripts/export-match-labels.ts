// Export the hand-labelled match set to a file no DELETE can reach.
//
//   npx ts-node -r tsconfig-paths/register scripts/export-match-labels.ts [outDir]
//
// WHY. `MatchLabel.userId` is `onDelete: Cascade`. Hand labelling is the most expensive
// artefact in this project — §13 showed it is the ONLY evidence that the shipped match
// score means anything — and it is held by a foreign key that a single `DELETE FROM users`
// wipes silently. It has already happened once: HANDOFF_2026-08-17 §6 records 50 labelled
// pairs destroyed when a user row was removed out-of-band.
//
// WHY THIS AND NOT `onDelete: SetNull`, which the review also suggests. A label's value is
// the whole triple (candidate, job, grade) — it says "THIS person judged THIS job this
// way". Nulling `userId` keeps a row and throws away the half that makes it evidence: an
// orphaned label cannot be used for calibration, because calibration scores a candidate's
// profile against a job. `SetNull` would preserve the record and destroy the research
// data, while looking like a fix. Copying the triple out of the database preserves both,
// and costs one script.
//
// The export is deliberately plain JSON with the candidate's email and the job's title
// alongside the ids, so it is still readable — and re-importable — after the rows it
// points at are gone. Ids alone would be a list of tombstones.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';

async function main(): Promise<void> {
  const outDir = process.argv[2] ?? join(process.cwd(), 'eval-exports');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const prisma = app.get(PrismaService);

    const labels = await prisma.matchLabel.findMany({
      orderBy: [{ userId: 'asc' }, { jobId: 'asc' }],
      select: {
        userId: true,
        jobId: true,
        label: true,
        reason: true,
        source: true,
        category: true,
        seniority: true,
        language: true,
        createdAt: true,
        // Human-readable anchors, so the export survives the rows being deleted.
        user: { select: { email: true, deletedEmail: true } },
        job: { select: { title: true, source: true, externalId: true } },
      },
    });

    if (labels.length === 0) {
      console.error('No labels in match_labels — nothing to export.');
      process.exitCode = 1;
      return;
    }

    const candidates = new Set(labels.map((l) => l.userId));
    const payload = {
      exportedAt: new Date().toISOString(),
      count: labels.length,
      candidates: candidates.size,
      // Recorded so a future reader knows what these labels were capable of proving.
      // §13: 50 pairs from 1 candidate is not enough to bless a user-facing number.
      note:
        'Ground truth for scripts/eval-retrieval.ts and eval-score-calibration.ts. ' +
        'MatchLabel.userId is onDelete: Cascade — this file is the backup that a user ' +
        'deletion cannot reach. See MENTOR_REVIEW_2026-08-18 §13 and §14.',
      labels: labels.map((l) => ({
        userId: l.userId,
        // A deleted account's address moves to `deletedEmail`; take whichever is real so
        // the export identifies the labeller either way.
        userEmail: l.user?.deletedEmail ?? l.user?.email ?? null,
        jobId: l.jobId,
        jobTitle: l.job?.title ?? null,
        jobSource: l.job?.source ?? null,
        jobExternalId: l.job?.externalId ?? null,
        label: l.label,
        reason: l.reason,
        source: l.source,
        category: l.category,
        seniority: l.seniority,
        language: l.language,
        createdAt: l.createdAt.toISOString(),
      })),
    };

    mkdirSync(outDir, { recursive: true });
    // Timestamped, never overwritten: an export that silently replaces the previous one
    // is one bad run away from being no backup at all.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(outDir, `match-labels-${stamp}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');

    const byLabel = labels.reduce<Record<string, number>>((acc, l) => {
      acc[l.label] = (acc[l.label] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`Exported ${labels.length} labels from ${candidates.size} candidate(s)`);
    console.log(
      Object.entries(byLabel)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n'),
    );
    console.log(`\n→ ${file}`);
    console.log(
      '\nKeep this OUTSIDE the database and outside the repo if it contains real user\n' +
        'emails. Re-run it after every labelling session.',
    );
  } finally {
    await app.close();
  }
}

void main();
