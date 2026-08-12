import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import { RecommendedJobDto } from '../../presentation/dtos/recommended-job.dto';
import { ScoutMatchDto } from '../../presentation/dtos/scout.dto';
import {
  RECOMMENDATION_JOB_INCLUDE,
  toRecommendedJobDto,
} from '../../presentation/dtos/recommended-job.mapper';

const DEFAULT_LIMIT = 50;

/**
 * Reads a user's recommendations (job-enriched) for the API. Computes them
 * lazily on first request if none exist yet, so the feature works before the
 * nightly batch is scheduled.
 */
@Injectable()
export class RecommendationsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeUserMatchesUseCase,
  ) {}

  async getForUser(userId: string, limit = DEFAULT_LIMIT): Promise<RecommendedJobDto[]> {
    let rows = await this.read(userId, limit);
    if (rows.length === 0) {
      await this.recompute.execute(userId, limit);
      rows = await this.read(userId, limit);
    }
    return rows.map((r) => toRecommendedJobDto(r));
  }

  /**
   * New high-match jobs for the extension's passive scout: the user's existing
   * recommendations at/above `minScore`, optionally limited to jobs created after
   * `since`. Maps to the extension's ScoutMatch (with a click-through URL).
   */
  async getScout(
    userId: string,
    minScore: number,
    since?: string,
  ): Promise<ScoutMatchDto[]> {
    const rows = await this.prisma.recommendation.findMany({
      where: {
        userId,
        score: { gte: minScore },
        ...(since ? { job: { createdAt: { gte: new Date(since) } } } : {}),
      },
      orderBy: { score: 'desc' },
      take: 50,
      include: { job: { include: { company: { select: { name: true } } } } },
    });

    // Internal jobs have no external apply URL — link to the web app job page.
    const base = (process.env.CORS_ORIGIN ?? '').split(',')[0]?.trim() ?? '';
    return rows.map((r) => ({
      externalId: r.job.externalId ?? r.job.id,
      source: (r.job.source ?? 'jobfit').toLowerCase(),
      title: r.job.title,
      company: r.job.company?.name ?? null,
      score: Math.round(r.score),
      url: r.job.externalUrl ?? (base ? `${base}/jobs/${r.job.id}` : ''),
    }));
  }

  private read(userId: string, limit: number) {
    return this.prisma.recommendation.findMany({
      where: { userId },
      // jobId breaks score ties — without it, equally-scored rows come back in arbitrary
      // order between calls, which defeats any client-side change detection.
      orderBy: [{ score: 'desc' }, { jobId: 'asc' }],
      take: limit,
      include: RECOMMENDATION_JOB_INCLUDE,
    });
  }

}
