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
import { ActiveResumeService } from '../../../resume/application/services/active-resume.service';
import { ComputeMatchScoreUseCase } from '../use-cases/compute-match-score.use-case';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import {
  CandidateContext,
  JobContext,
  MatchFlags,
  SubScores,
  TwoDimensionalScoreResult,
} from '../../domain/scoring/types';
import { LocationResolverService } from '../../../location/location-resolver.service';
import { deriveJobLevel } from '../../domain/scoring/experience-scorer';

export interface JobMatchResult {
  /** 0-100 overall score: the gated composite of the two dimensions below. */
  score: number;
  breakdown: SubScores;
  /** 0-100 capability fit (skills + seniority). */
  roleFitScore: number;
  /** 0-100 logistics fit against the candidate's stated preferences. */
  preferenceFitScore: number;
  band: TwoDimensionalScoreResult['band'];
  /** Warnings and highlights — the conflicts the sub-score lines cannot express. */
  flags: MatchFlags;
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
    private readonly activeResume: ActiveResumeService,
    private readonly locations: LocationResolverService,
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
          // The preference dimension needs what the candidate actually asked for. Missing
          // here and present in the recommendations pipeline would make this page and the
          // list disagree about the same job — the one thing this service exists to
          // prevent.
          desiredEmploymentTypes: true,
          desiredJobLevels: true,
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
          // Structured seniority; `deriveJobLevel` falls back to the title.
          experienceLevel: true,
          // Stated employment type, for the preference dimension. Null means unsaid.
          employmentType: true,
          // `city`/`country` back the location fallback below: an internal job whose
          // own `location` is blank still happens somewhere — at its company.
          company: { select: { city: true, country: true } },
        },
      }),
    ]);
    if (!profile || !job) return null;

    // Reuses the recommendation pipeline's own query, so a job scored here and the same
    // job scored in /recommendations cannot drift apart.
    const [cosineRow] = await this.recompute.cosineForJobs(userId, [jobId]);
    const cosineSim = cosineRow ? Number(cosineRow.cosine_sim) : 0;

    const candidate: CandidateContext = {
      place: this.locations.resolveStructured(profile.city, profile.country),
      desiredRemoteTypes: profile.desiredRemoteTypes,
      minSalary: profile.minSalary,
      maxSalary: profile.maxSalary,
      desiredEmploymentTypes: profile.desiredEmploymentTypes,
      desiredJobLevels: profile.desiredJobLevels,
      experienceCount: await this.experienceCount(userId),
    };
    const jobCtx: JobContext = {
      remoteType: job.remoteType,
      // The job's own location first; failing that, the company's structured city and
      // country. Ingested rows often carry no location (bongthom deliberately writes
      // null rather than guessing "Phnom Penh"), and the employer's own address is a
      // fact we already hold rather than an inference.
      place:
        this.locations.resolveText(job.location) ??
        this.locations.resolveStructured(job.company?.city, job.company?.country),
      locationLabel: job.location,
      requiredLevel: deriveJobLevel(job),
      employmentType: job.employmentType,
      // Structured level only — see JobContext.jobLevel. `requiredLevel` above may be an
      // inference from the title, and an inference must not be quoted back to the user as
      // the employer's statement.
      jobLevel: job.experienceLevel,
      minSalary: job.minSalary,
      maxSalary: job.maxSalary,
    };

    const result = this.compute.execute({
      candidate,
      job: jobCtx,
      cosineSim,
      title: job.title,
    });

    return {
      score: result.score,
      breakdown: result.breakdown,
      roleFitScore: result.roleFitScore,
      preferenceFitScore: result.preferenceFitScore,
      band: result.band,
      flags: result.flags,
      // The sub-score statements STAY, and the warnings are added to them rather than
      // replacing them: this panel answers "why this number?" line by line, and the
      // preference conflicts are the lines it never had. A conflict the list view warns
      // about and the detail page does not mention is the same silence in a new place.
      reasons: [...this.explain(result.breakdown, candidate, jobCtx), ...result.flags.warnings],
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

    // Null means no comparison happened — one side named a place we could not resolve.
    // There is nothing truthful to say then, so say nothing rather than implying a
    // verdict in either direction.
    if (b.location !== null) {
      const where = job.locationLabel ?? 'this location';
      if (job.remoteType === 'REMOTE') {
        reasons.push('Location: remote, which matches your preference.');
      } else if (b.location >= 80) {
        reasons.push(`Location: ${where} matches your preference.`);
      } else {
        reasons.push(`Location: ${where} is outside your stated preference.`);
      }
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

  /** Structured experience rows if present, else the count from the active parsed résumé. */
  private async experienceCount(userId: string): Promise<number> {
    const structured = await this.prisma.experience.count({ where: { userId } });
    if (structured > 0) return structured;

    const resumeId = await this.activeResume.findActiveResumeId(userId);
    if (!resumeId) return 0;
    const parsed = await this.prisma.parsedResumeData.findUnique({
      where: { resumeId },
      select: { experiences: true },
    });
    const json = parsed?.experiences;
    if (!json) return 0;
    try {
      const parsed: unknown = JSON.parse(json);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
}
