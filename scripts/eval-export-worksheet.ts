// Build a CONTENT-ONLY labeling worksheet per candidate: the candidate summary
// and a neutrally-ordered (shuffled) pool of job summaries — NO recommendations,
// NO scores, NO ranking. This is deliberate: labels must not be anchored to the
// current system's output (RAG plan §8/§11).
//
// Run: npx ts-node -r tsconfig-paths/register scripts/eval-export-worksheet.ts [userId]
// Writes eval/worksheets/<userId>.md (read) + <userId>.jsonl (template to fill).

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { inferJobSlices } from '../src/modules/matching/evaluation/job-slices';

function parseArr(json: string | null): unknown[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Deterministic-ish shuffle (Math.random) so labeling order != any score order. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main(): Promise<void> {
  const onlyUser = process.argv[2];
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);

    const profiles = await prisma.profile.findMany({
      where: onlyUser ? { userId: onlyUser } : { deletedAt: null },
      select: {
        userId: true, headline: true, bio: true, city: true, country: true,
        desiredJobLevels: true, desiredIndustries: true,
      },
    });
    if (profiles.length === 0) {
      console.error('No profiles found.');
      process.exit(1);
    }

    // Content pool: all PUBLISHED jobs (neutral). No scoring, no retrieval.
    const jobs = await prisma.job.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true, title: true, location: true, remoteType: true,
        minSalary: true, maxSalary: true, description: true,
        company: { select: { name: true } },
      },
    });

    const dir = join(__dirname, '..', 'eval', 'worksheets');
    mkdirSync(dir, { recursive: true });

    for (const p of profiles) {
      const resume = await prisma.resume.findFirst({
        where: { userId: p.userId, parsingStatus: 'SUCCESS' },
        orderBy: { updatedAt: 'desc' },
        select: { parsedData: { select: { summary: true, skills: true, experiences: true } } },
      });
      const skills = parseArr(resume?.parsedData?.skills ?? null).filter((s): s is string => typeof s === 'string');
      const expTitles = parseArr(resume?.parsedData?.experiences ?? null)
        .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>).title : e))
        .filter((t): t is string => typeof t === 'string');

      const md: string[] = [
        `# Labeling worksheet — candidate ${p.userId}`,
        '',
        '> Content-only. Judge each job on its own merits; the ordering is random and',
        '> carries NO signal from the current matching system.',
        '',
        '## Candidate',
        `- Headline: ${p.headline ?? '—'}`,
        `- Location: ${[p.city, p.country].filter(Boolean).join(', ') || '—'}`,
        `- Desired levels: ${p.desiredJobLevels.join(', ') || '—'}`,
        `- Desired industries: ${p.desiredIndustries.join(', ') || '—'}`,
        `- Résumé summary: ${resume?.parsedData?.summary ?? '—'}`,
        `- Résumé skills: ${skills.join(', ') || '—'}`,
        `- Résumé experience: ${expTitles.join('; ') || '—'}`,
        '',
        `## Jobs to label (${jobs.length}, shuffled)`,
        '',
      ];

      const template: string[] = [
        `// Fill in "label": great | ok | bad. Delete lines you don't want to label.`,
        `// Slice tags (category/seniority/language) are hand-set for Phase-A slicing.`,
      ];

      for (const j of shuffle(jobs)) {
        const salary =
          j.minSalary != null || j.maxSalary != null
            ? `$${j.minSalary ?? '?'}–${j.maxSalary ?? '?'}`
            : '—';
        md.push(
          `### ${j.title} @ ${j.company?.name ?? '—'}`,
          `- id: \`${j.id}\``,
          `- location: ${j.location ?? '—'} (${j.remoteType}) · salary: ${salary}`,
          `- ${(j.description ?? '').replace(/\s+/g, ' ').slice(0, 300)}`,
          '',
        );
        const slices = inferJobSlices(j); // auto-tagged; correct by hand if wrong
        template.push(
          JSON.stringify({
            userId: p.userId, jobId: j.id, label: '?',
            category: slices.category, seniority: slices.seniority,
            language: slices.language, reason: '',
          }),
        );
      }

      writeFileSync(join(dir, `${p.userId}.md`), md.join('\n'), 'utf8');
      writeFileSync(join(dir, `${p.userId}.jsonl`), template.join('\n') + '\n', 'utf8');
      console.log(`Wrote eval/worksheets/${p.userId}.md and ${p.userId}.jsonl (${jobs.length} jobs)`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
