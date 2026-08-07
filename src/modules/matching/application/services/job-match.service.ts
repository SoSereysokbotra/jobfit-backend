// src/modules/matching/application/services/job-match.service.ts
//
// The real match score for ONE job and ONE user, for the job detail page.
//
// The recommendations pipeline only scores jobs it retrieved, so opening an arbitrary job
// had no score to show — which is why the UI fell back to a hardcoded 0 and invented
// "React, TypeScript and Node.js align perfectly" bullets. This computes the genuine
// figure on demand instead.
//
// IMPORTANT — this is NOT the discredited LLM fitScore. Phase C measured
// `/match/reason`'s fitScore as uncorrelated with real fit and it stays out of user-facing
// paths. This is the DETERMINISTIC scorer: cosine similarity of the résumé/profile
// embedding against the job embedding (skills), plus rule-based experience, location,
// salary and industry sub-scores. Same code the recommendations pipeline writes to the
// `recommendations` table, so the number here and there cannot disagree.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ComputeMatchScoreUseCase } from '../use-cases/compute-match-score.use-case';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';

export interface JobMatchResult {
  /** 0-100 weighted total. */
  score: number;
  breakdown: SubScores;
  /** Plain statements derived from the sub-scores. Never invented. */
  reasons: string[];
  /**
   * False when the job or the profile has no embedding yet, so `skills` could not be
   * computed and the total understates the real fit. The UI must say so rather than
   * present a deflated number as fact.
   */
  skillsScored: boolean;
}

@Injectable()
export class JobMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compute: ComputeMatchScoreUseCase,
    private readonly recompute: RecomputeUserMatchesUseCase,
  ) {}

  /** Null when the user has no profile — there is nothing to match against. */
  async matchForJob(userId: string, jobId: string): Promise<JobMatchResult | null> {
    const [profile, job] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: {
          city: true,
          country: true,
          desiredRemoteTypes: true,
          minSalary: true,
          maxSalary: true,
          desiredIndustries: true,
        },
      }),
      this.prisma.job.findUnique({
        where: { id: jobId },
        select: {
          title: true,
          remoteType: true,
          location: true,
          minSalary: true,
          maxSalary: true,
          company: { select: { industry: true } },
        },
      }),
    ]);
    if (!profile || !job) return null;

    // Reuses the recommendation pipeline's own query, so a job scored here and the same
    // job scored in /recommendations cannot drift apart.
    const [cosineRow] = await this.recompute.cosineForJobs(userId, [jobId]);
    const cosineSim = cosineRow ? Number(cosineRow.cosine_sim) : 0;

    const candidate: CandidateContext = {
      city: profile.city,
      country: profile.country,
      desiredRemoteTypes: profile.desiredRemoteTypes,
      minSalary: profile.minSalary,
      maxSalary: profile.maxSalary,
      desiredIndustries: profile.desiredIndustries,
      experienceCount: await this.experienceCount(userId),
    };
    const jobCtx: JobContext = {
      remoteType: job.remoteType,
      location: job.location,
      minSalary: job.minSalary,
      maxSalary: job.maxSalary,
      industry: job.company?.industry ?? null,
    };

    const { score, breakdown } = this.compute.execute({ candidate, job: jobCtx, cosineSim });

    return {
      score,
      breakdown,
      reasons: this.explain(breakdown, candidate, jobCtx),
      skillsScored: Boolean(cosineRow),
    };
  }

  /**
   * Turn the sub-scores into statements.
   *
   * Every line is derived from a number that was actually computed. The panel this
   * replaces asserted "React, TypeScript, and Node.js align perfectly" for every job and
   * every user — including a welding job — because the text was hardcoded HTML.
   */
  private explain(
    b: SubScores,
    candidate: CandidateContext,
    job: JobContext,
  ): string[] {
    const reasons: string[] = [];

    if (b.skills >= 70) reasons.push('Skills: strong overlap with this role.');
    else if (b.skills >= 45) reasons.push('Skills: partial overlap with this role.');
    else reasons.push('Skills: limited overlap with this role.');

    if (candidate.experienceCount > 0) {
      const n = candidate.experienceCount;
      reasons.push(`Experience: ${n} role${n === 1 ? '' : 's'} on your profile.`);
    } else {
      reasons.push('Experience: none on your profile yet.');
    }

    if (b.location >= 80) {
      reasons.push(
        job.remoteType === 'REMOTE'
          ? 'Location: remote, which matches your preference.'
          : `Location: ${job.location ?? 'this location'} matches your preference.`,
      );
    } else if (job.location) {
      reasons.push(`Location: ${job.location} is outside your stated preference.`);
    }

    if (job.minSalary || job.maxSalary) {
      reasons.push(
        b.salary >= 100
          ? 'Salary: within your expected range.'
          : 'Salary: below your expected range.',
      );
    }

    return reasons;
  }

  /** Structured experience rows if present, else the count from the parsed résumé. */
  private async experienceCount(userId: string): Promise<number> {
    const structured = await this.prisma.experience.count({ where: { userId } });
    if (structured > 0) return structured;

    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS' },
      orderBy: { updatedAt: 'desc' },
      select: { parsedData: { select: { experiences: true } } },
    });
    const json = resume?.parsedData?.experiences;
    if (!json) return 0;
    try {
      const parsed: unknown = JSON.parse(json);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
}
