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
 * Reads a user's recommendations (job-enriched) for the API, recomputing lazily when the
 * cache cannot be trusted. There is still no nightly batch; this read path is the only
 * thing that keeps scores current.
 *
 * TWO reasons to recompute, and they are different:
 *   - no rows at all — a new user, nothing has ever been computed;
 *   - rows marked `staleAt` — something the score depends on changed (profile,
 *     preferences, résumé, default-résumé switch) and the listener flagged them.
 *
 * Only the first existed before, which is why "upload a better CV and your matches move"
 * did not work: the embedding was rebuilt, the cached scores were not, and the row count
 * was never zero again (MENTOR_REVIEW_2026-08-18 §6).
 */
@Injectable()
export class RecommendationsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: RecomputeUserMatchesUseCase,
  ) {}

  async getForUser(userId: string, limit = DEFAULT_LIMIT): Promise<RecommendedJobDto[]> {
    let rows = await this.read(userId, limit);

    if (rows.length === 0 || rows.some((r) => r.staleAt !== null)) {
      try {
        await this.recompute.execute(userId, limit);
        rows = await this.read(userId, limit);
      } catch {
        // Serve what we have. A failed recompute must not turn "slightly old matches"
        // into "no matches" — which is exactly why staleness is a marker and not a
        // delete. The rows stay flagged, so the next read tries again.
        // (No rethrow, and no logging here: RecomputeUserMatchesUseCase logs its own
        //  failures with the detail that is worth having.)
      }
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
        // A dismissed job must not come back through the extension's scout either.
        dismissedAt: null,
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
      // Dismissed rows are tombstones kept so a recompute cannot resurrect them; they are
      // never results.
      where: { userId, dismissedAt: null },
      // jobId breaks score ties — without it, equally-scored rows come back in arbitrary
      // order between calls, which defeats any client-side change detection.
      orderBy: [{ score: 'desc' }, { jobId: 'asc' }],
      take: limit,
      include: RECOMMENDATION_JOB_INCLUDE,
    });
  }

}
