import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import { RecommendedJobDto } from '../../presentation/dtos/recommended-job.dto';
import { ScoutMatchDto } from '../../presentation/dtos/scout.dto';

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
    return rows.map((r) => this.toDto(r));
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
      orderBy: { score: 'desc' },
      take: limit,
      include: {
        job: {
          include: {
            company: { select: { name: true } },
            skills: { select: { skillId: true } },
          },
        },
      },
    });
  }

  private toDto(
    r: Awaited<ReturnType<RecommendationsQueryService['read']>>[number],
  ): RecommendedJobDto {
    const job = r.job;
    const hasSalary = job.minSalary != null || job.maxSalary != null;
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.company?.name,
      title: job.title,
      description: job.description,
      status: job.status,
      remoteType: job.remoteType,
      location: job.location ?? undefined,
      salaryRange: hasSalary
        ? { min: job.minSalary ?? 0, max: job.maxSalary ?? 0, currency: 'USD' }
        : undefined,
      skillIds: job.skills.map((s) => s.skillId),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      match: Math.round(r.score),
      reason: r.reasonExplanation ?? undefined,
      breakdown: (r.breakdown as Record<string, number> | null) ?? undefined,
    };
  }
}
