import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';
import { cosineSimilarity } from '../../domain/scoring/skills-scorer';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';

/**
 * Score a job the user is looking at on an EXTERNAL site (e.g. a LinkedIn post)
 * against their profile — without that job existing in our database.
 *
 * Why this exists: ingestion only covers TheMuse, and we must never scrape or
 * store third-party listings. So a LinkedIn `externalId` will never match a
 * `Job` row and a lookup-based endpoint would return "not found" for virtually
 * every post the browser extension sees.
 *
 * Instead we score ad hoc, from the identifiers the extension is allowed to
 * send (title, company, and optionally location/remote type):
 *   · skills (40%) — cosine similarity between the candidate's stored profile
 *     vector and a freshly embedded vector for "<title> at <company>".
 *   · experience / location / salary / other — the same deterministic scorers
 *     used by the normal recommendation pipeline.
 *
 * Nothing about the external posting is persisted.
 */

export interface ExternalJobInput {
  title: string;
  company: string | null;
  location: string | null;
  /** "REMOTE" | "HYBRID" | "ON_SITE" — the scorers treat unknown as ON_SITE. */
  remoteType: string | null;
}

export interface ExternalMatchResult {
  score: number;
  breakdown: SubScores;
  /** False when the semantic part could not be computed (see `skills` caveat). */
  semantic: boolean;
}

@Injectable()
export class MatchExternalJobUseCase {
  private readonly logger = new Logger(MatchExternalJobUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
    private readonly computeMatchScore: ComputeMatchScoreUseCase,
  ) {}

  async execute(
    userId: string,
    job: ExternalJobInput,
  ): Promise<ExternalMatchResult | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        city: true,
        country: true,
        desiredRemoteTypes: true,
        minSalary: true,
        maxSalary: true,
        desiredIndustries: true,
      },
    });
    // No profile means we have nothing to match against — the caller turns this
    // into an empty response rather than inventing a score.
    if (!profile) return null;

    const candidate: CandidateContext = {
      city: profile.city,
      country: profile.country,
      desiredRemoteTypes: profile.desiredRemoteTypes,
      minSalary: profile.minSalary,
      maxSalary: profile.maxSalary,
      desiredIndustries: profile.desiredIndustries,
      experienceCount: await this.experienceCount(userId),
    };

    const company = job.company ? await this.findCompany(job.company) : null;

    const jobContext: JobContext = {
      remoteType: job.remoteType ?? 'ON_SITE',
      location: job.location,
      // The external posting's salary is unknown; fall back to what we know
      // about this company's other roles so the salary sub-score isn't blind.
      minSalary: company?.minSalary ?? null,
      maxSalary: company?.maxSalary ?? null,
      industry: company?.industry ?? null,
    };

    const { cosineSim, semantic } = await this.semanticSimilarity(userId, job);

    const { score, breakdown } = this.computeMatchScore.execute({
      candidate,
      job: jobContext,
      cosineSim,
    });

    return { score, breakdown, semantic };
  }

  /**
   * Cosine similarity between the candidate's stored vector and a freshly
   * embedded vector for the external job. Degrades gracefully: if the AI service
   * is down or the candidate has no embedding we report `semantic: false` and
   * fall back to a neutral 0.5, so the deterministic sub-scores still stand.
   */
  private async semanticSimilarity(
    userId: string,
    job: ExternalJobInput,
  ): Promise<{ cosineSim: number; semantic: boolean }> {
    const NEUTRAL = 0.5;
    try {
      const profileVec = await this.readProfileVector(userId);
      if (!profileVec) return { cosineSim: NEUTRAL, semantic: false };

      const text = [job.title, job.company && `at ${job.company}`, job.location]
        .filter(Boolean)
        .join(' ');
      const { embeddings } = await this.aiClient.embed([text]);
      const jobVec = embeddings?.[0];
      if (!jobVec?.length) return { cosineSim: NEUTRAL, semantic: false };

      return { cosineSim: cosineSimilarity(profileVec, jobVec), semantic: true };
    } catch (error) {
      this.logger.warn(
        `External-job embedding failed; falling back to deterministic scores: ${String(error)}`,
      );
      return { cosineSim: NEUTRAL, semantic: false };
    }
  }

  /** pgvector columns are unreadable through Prisma, so pull it as text. */
  private async readProfileVector(userId: string): Promise<number[] | null> {
    const rows = await this.prisma.$queryRaw<{ embedding: string | null }[]>`
      SELECT embedding::text AS embedding FROM profiles WHERE "userId" = ${userId}
    `;
    const raw = rows[0]?.embedding;
    if (!raw) return null;
    // pgvector renders as "[0.1,0.2,...]".
    return raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n));
  }

  /** Resolve a display company name to our Company row (case-insensitive). */
  private async findCompany(name: string) {
    const company = await this.prisma.company.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true, industry: true },
    });
    if (!company) return null;

    // Salary band across this company's published jobs, as a stand-in for the
    // external posting's undisclosed range.
    const agg = await this.prisma.job.aggregate({
      where: { companyId: company.id, status: 'PUBLISHED' },
      _min: { minSalary: true },
      _max: { maxSalary: true },
    });
    return {
      industry: company.industry,
      minSalary: agg._min.minSalary,
      maxSalary: agg._max.maxSalary,
    };
  }

  /**
   * Best-known experience count: structured Experience rows, else résumé-derived.
   * Mirrors RecomputeUserMatchesUseCase so a job scored here and the same job
   * scored by the normal pipeline can't disagree on the experience sub-score.
   */
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
