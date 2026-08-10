import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import { RecommendedJobDto } from '../../presentation/dtos/recommended-job.dto';
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
