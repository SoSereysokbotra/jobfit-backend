// Calibration of the MATCH SCORE (and each sub-score) against the human labels in
// match_labels. Run: npx ts-node -r tsconfig-paths/register scripts/eval-score-calibration.ts
//
// WHY THIS EXISTS. The retrieval harness (eval-retrieval.ts) measures WHICH jobs come
// back — Recall/MRR/nDCG. The breakdown shown on a recommendation card is computed AFTER
// retrieval, in ComputeMatchScoreUseCase, so no retrieval metric moves when a sub-score
// changes. Nothing measured the sub-scores at all.
//
// The method is the same one that condemned the LLM fitScore in Phase C: Spearman ρ of
// the produced score against the hand-graded label (GREAT=2, OK=1, BAD=0). Using the same
// method matters — it is the yardstick this project already trusts, and it means a new
// scorer has to clear the bar the old one is held to.
//
// Reported PER SUB-SCORE as well as for the total, because "the total barely moved" and
// "this sub-score is uncorrelated with human judgement" are different findings and the
// second is the actionable one.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { ComputeMatchScoreUseCase } from '../src/modules/matching/application/use-cases/compute-match-score.use-case';
import { RecomputeUserMatchesUseCase } from '../src/modules/matching/application/use-cases/recompute-user-matches.use-case';
import { spearman } from '../src/modules/matching/evaluation/metrics';
import { CandidateContext, JobContext } from '../src/modules/matching/domain/scoring/types';

/** Graded gains, matching the retrieval harness. */
const GRADE: Record<string, number> = { GREAT: 2, OK: 1, BAD: 0 };

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const compute = app.get(ComputeMatchScoreUseCase);
    const recompute = app.get(RecomputeUserMatchesUseCase);

    const labels = await prisma.matchLabel.findMany({
      select: { userId: true, jobId: true, label: true },
    });
    if (labels.length === 0) {
      console.error('No labels in match_labels — nothing to calibrate against.');
      process.exitCode = 1;
      return;
    }

    const byUser = new Map<string, typeof labels>();
    for (const l of labels) {
      byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
    }

    const totals: number[] = [];
    const grades: number[] = [];
    const subs: Record<string, number[]> = {
      skills: [], experience: [], location: [], salary: [], other: [],
    };
    let skippedNoProfile = 0;
    let skippedNoCosine = 0;

    for (const [userId, rows] of byUser) {
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: {
          city: true, country: true, desiredRemoteTypes: true,
          minSalary: true, maxSalary: true, desiredIndustries: true,
        },
      });
      if (!profile) {
        skippedNoProfile += rows.length;
        continue;
      }

      // Reuse the production query so calibration cannot drift from what ships.
      const cosines = await recompute.cosineForJobs(userId, rows.map((r) => r.jobId));
      const cosineById = new Map(cosines.map((c) => [c.id, Number(c.cosine_sim)]));

      const candidate: CandidateContext = {
        city: profile.city,
        country: profile.country,
        desiredRemoteTypes: profile.desiredRemoteTypes,
        minSalary: profile.minSalary,
        maxSalary: profile.maxSalary,
        desiredIndustries: profile.desiredIndustries,
        experienceCount: await experienceCount(prisma, userId),
      };

      const jobs = await prisma.job.findMany({
        where: { id: { in: rows.map((r) => r.jobId) } },
        select: {
          id: true, remoteType: true, location: true,
          minSalary: true, maxSalary: true, company: { select: { industry: true } },
        },
      });
      const jobById = new Map(jobs.map((j) => [j.id, j]));
      // Same resolution the production pipeline does — calibration must score what ships.
      const industryNameById = await recompute.industryNames(
        jobs.map((j) => j.company?.industry).filter((i): i is string => !!i),
      );

      for (const row of rows) {
        const job = jobById.get(row.jobId);
        const cosineSim = cosineById.get(row.jobId);
        // A pair with no cosine has no embedding on one side; scoring it would feed a
        // silent 0 into the skills sub-score and corrupt the correlation.
        if (!job || cosineSim === undefined) {
          skippedNoCosine++;
          continue;
        }
        const jobCtx: JobContext = {
          remoteType: job.remoteType,
          location: job.location,
          minSalary: job.minSalary,
          maxSalary: job.maxSalary,
          industry: job.company?.industry
            ? (industryNameById.get(job.company.industry) ?? null)
            : null,
        };
        const { score, breakdown } = compute.execute({ candidate, job: jobCtx, cosineSim });
        totals.push(score);
        grades.push(GRADE[row.label] ?? 0);
        for (const key of Object.keys(subs)) {
          subs[key].push((breakdown as unknown as Record<string, number>)[key]);
        }
      }
    }

    console.log(`\n# Match-score calibration — Spearman ρ vs human label`);
    console.log(`\n- Pairs scored: **${totals.length}** of ${labels.length}`);
    if (skippedNoProfile) console.log(`- Skipped (no profile): ${skippedNoProfile}`);
    if (skippedNoCosine) console.log(`- Skipped (no embedding on one side): ${skippedNoCosine}`);
    console.log(`- Grades: GREAT=2, OK=1, BAD=0\n`);

    console.log('| signal | ρ vs human grade | spread (min–max) |');
    console.log('|---|---|---|');
    console.log(row('TOTAL score', totals, grades));
    for (const [key, values] of Object.entries(subs)) {
      console.log(row(key, values, grades));
    }
    console.log(
      '\nA sub-score with ρ near 0 is not tracking human judgement. A sub-score with no\n' +
        'spread is a constant and cannot track anything by construction.',
    );
  } finally {
    await app.close();
  }
}

function row(name: string, values: number[], grades: number[]): string {
  const rho = values.length > 1 ? spearman(values, grades) : NaN;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = min === max ? `constant ${min}` : `${min}–${max}`;
  return `| ${name} | ${Number.isFinite(rho) ? rho.toFixed(3) : 'n/a'} | ${spread} |`;
}

/** Mirrors RecomputeUserMatchesUseCase.experienceCount (private there). */
async function experienceCount(prisma: PrismaService, userId: string): Promise<number> {
  const structured = await prisma.experience.count({ where: { userId } });
  if (structured > 0) return structured;
  const resume = await prisma.resume.findFirst({
    where: { userId, parsingStatus: 'SUCCESS' },
    orderBy: { updatedAt: 'desc' },
    select: { parsedData: { select: { experiences: true } } },
  });
  const json = resume?.parsedData?.experiences;
  if (!json) return 0;
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

void main();
