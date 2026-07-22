import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';

interface NearJobRow {
  id: string;
  cosine_sim: number;
}

/**
 * Recompute a user's job recommendations:
 *  1. pgvector nearest-neighbour query (candidate embedding vs job embeddings)
 *     yields the top-N jobs + their cosine similarity (the semantic skills score).
 *  2. Each candidate job is re-ranked with the deterministic sub-scores.
 *  3. Results are upserted into `recommendations`.
 */
@Injectable()
export class RecomputeUserMatchesUseCase {
  private readonly logger = new Logger(RecomputeUserMatchesUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compute: ComputeMatchScoreUseCase,
  ) {}

  async execute(userId: string, limit = 50): Promise<number> {
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
    if (!profile) return 0;

    // Nearest published jobs by cosine distance to the candidate's stored vector.
    // `<=>` is pgvector cosine distance; 1 - distance = cosine similarity.
    const near = await this.prisma.$queryRawUnsafe<NearJobRow[]>(
      `SELECT j.id, 1 - (j.embedding <=> p.embedding) AS cosine_sim
         FROM jobs j
         CROSS JOIN (SELECT embedding FROM profiles WHERE "userId" = $1) p
        WHERE j.embedding IS NOT NULL
          AND p.embedding IS NOT NULL
          AND j.status = 'PUBLISHED'
        ORDER BY j.embedding <=> p.embedding
        LIMIT $2`,
      userId,
      limit,
    );
    if (near.length === 0) {
      this.logger.warn(
        `No recommendations for user ${userId} (missing candidate/job embeddings?)`,
      );
      return 0;
    }

    const candidate: CandidateContext = {
      city: profile.city,
      country: profile.country,
      desiredRemoteTypes: profile.desiredRemoteTypes,
      minSalary: profile.minSalary,
      maxSalary: profile.maxSalary,
      desiredIndustries: profile.desiredIndustries,
      experienceCount: await this.experienceCount(userId),
    };

    const jobs = await this.prisma.job.findMany({
      where: { id: { in: near.map((n) => n.id) } },
      select: {
        id: true,
        title: true,
        remoteType: true,
        location: true,
        minSalary: true,
        maxSalary: true,
        company: { select: { industry: true } },
      },
    });
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    let written = 0;
    for (const row of near) {
      const job = jobById.get(row.id);
      if (!job) continue;

      const jobCtx: JobContext = {
        remoteType: job.remoteType,
        location: job.location,
        minSalary: job.minSalary,
        maxSalary: job.maxSalary,
        industry: job.company?.industry ?? null,
      };
      const { score, breakdown } = this.compute.execute({
        candidate,
        job: jobCtx,
        cosineSim: Number(row.cosine_sim),
      });
      const reasonExplanation = this.explain(job.title, breakdown);
      // Prisma's Json input wants an index-signature type; SubScores is fixed-shape.
      const breakdownJson = breakdown as unknown as Record<string, number>;

      await this.prisma.recommendation.upsert({
        where: { userId_jobId: { userId, jobId: row.id } },
        update: { score, breakdown: breakdownJson, reasonExplanation },
        create: { userId, jobId: row.id, score, breakdown: breakdownJson, reasonExplanation },
      });
      written++;
    }

    this.logger.log(`Recomputed ${written} recommendations for user ${userId}`);
    return written;
  }

  /** Best-known experience count: structured Experience rows, else résumé-derived. */
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
      const v: unknown = JSON.parse(json);
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  }

  private explain(title: string, b: SubScores): string {
    const bits: string[] = [];
    if (b.skills >= 70) bits.push('strong skills match');
    else if (b.skills >= 45) bits.push('partial skills match');
    else bits.push('some overlap');
    if (b.location >= 80) bits.push('location fits');
    if (b.salary >= 100) bits.push('salary in range');
    return `${title}: ${bits.join(', ')}.`;
  }
}
