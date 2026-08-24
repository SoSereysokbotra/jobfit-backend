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

/**
 * THE STANDARD a user-facing number has to clear.
 *
 * These are the bar, not a description of where we are. The project rejected the LLM
 * fitScore at ρ 0.137/−0.065 over 150 hand-graded pairs and made "no percentage may be
 * shown to a user" a rule — then shipped `Recommendation.score` as a percentage without
 * ever applying the same test to it (MENTOR_REVIEW_2026-08-18 §13).
 *
 * MIN_CANDIDATES is the one that actually bites. ρ over 50 pairs from ONE labeller
 * measures whether the scorer agrees with that person, on their profile, with their
 * résumé — it cannot tell you the scorer works for anyone else.
 */
const MIN_RHO = 0.5;
const MIN_CANDIDATES = 5;
const MIN_PAIRS = 150;

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
    /** Scored totals bucketed by the human grade, for the distribution table. */
    const byGrade: Record<string, number[]> = { GREAT: [], OK: [], BAD: [] };
    const scoredCandidates = new Set<string>();
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
        (byGrade[row.label] ??= []).push(score);
        scoredCandidates.add(userId);
        for (const key of Object.keys(subs)) {
          subs[key].push((breakdown as unknown as Record<string, number>)[key]);
        }
      }
    }

    console.log(`\n# Match-score calibration — Spearman ρ vs human label`);
    console.log(`\n- Pairs scored: **${totals.length}** of ${labels.length}`);
    // n IS PART OF THE RESULT. A ρ without the number of CANDIDATES behind it says
    // nothing about whether the scorer works for anyone but the person who labelled it
    // (MENTOR_REVIEW_2026-08-18 §13).
    console.log(`- Candidates: **${scoredCandidates.size}** (the labelling population)`);
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

    // ── What the score is allowed to CLAIM ────────────────────────────────────
    //
    // The scorer is labelled "0–100" everywhere it is exposed. What it actually produces
    // is the range below. If that range is a narrow band in the middle, a raw percentage
    // misdescribes the number: the worst job we have ever scored is not a "41% match",
    // it is the bottom of a compressed band.
    console.log('\n## Observed range per human grade\n');
    console.log('| human grade | n | scored min–max | mean |');
    console.log('|---|---|---|---|');
    for (const grade of ['GREAT', 'OK', 'BAD']) {
      const v = byGrade[grade] ?? [];
      if (v.length === 0) {
        console.log(`| ${grade} | 0 | — | — |`);
        continue;
      }
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      console.log(
        `| ${grade} | ${v.length} | ${Math.min(...v)}–${Math.max(...v)} | ${mean.toFixed(1)} |`,
      );
    }

    // ── The standard, enforced ────────────────────────────────────────────────
    //
    // Written as a check rather than a paragraph, because a standard nobody runs is a
    // preference. The LLM fitScore was rejected at ρ 0.137/−0.065 over 150 pairs; the
    // number we DO ship has to clear the bar the rejected one was held to.
    const rhoTotal = spearman(totals, grades);
    const failures: string[] = [];
    if (!Number.isFinite(rhoTotal) || rhoTotal < MIN_RHO) {
      failures.push(
        `total ρ ${Number.isFinite(rhoTotal) ? rhoTotal.toFixed(3) : 'n/a'} < ${MIN_RHO}`,
      );
    }
    if (scoredCandidates.size < MIN_CANDIDATES) {
      failures.push(
        `${scoredCandidates.size} candidate(s) < ${MIN_CANDIDATES} — one person's taste is not a population`,
      );
    }
    if (totals.length < MIN_PAIRS) {
      failures.push(`${totals.length} pairs < ${MIN_PAIRS}`);
    }
    for (const [key, values] of Object.entries(subs)) {
      if (values.length && Math.min(...values) === Math.max(...values)) {
        failures.push(`sub-score '${key}' is constant ${values[0]} — its weight is inert`);
      }
    }

    console.log('\n## Verdict\n');
    if (failures.length === 0) {
      console.log(
        `✅ Meets the standard: ρ ≥ ${MIN_RHO}, ≥ ${MIN_CANDIDATES} candidates, ` +
          `≥ ${MIN_PAIRS} pairs, no inert sub-score.`,
      );
    } else {
      console.log('❌ Does NOT meet the standard for showing a calibrated number:\n');
      for (const f of failures) console.log(`- ${f}`);
      console.log(
        '\nOrdering evidence may still be sound — that is what ρ measures. What fails\n' +
          'here is the claim that the MAGNITUDE means something to a user. Show a band\n' +
          'or a rank until this passes. See MENTOR_REVIEW_2026-08-18 §13.',
      );
      process.exitCode = 1;
    }
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
