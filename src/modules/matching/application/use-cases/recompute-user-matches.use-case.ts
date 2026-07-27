import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';
import { reciprocalRankFusion } from '../../domain/rrf';
import { toExperienceTitles, toStringArray } from '../../domain/parsed-resume-json';

export interface NearJobRow {
  id: string;
  cosine_sim: number;
}

export interface RetrievalOptions {
  /** Apply the LLM reranker to the fused shortlist (Phase B; off by default). */
  rerank?: boolean;
}

// How many candidates each retriever (dense, sparse) contributes to the fusion.
const RETRIEVAL_POOL = 50;
// How many top fused jobs the LLM reranker re-scores (kept small — it's an LLM call).
const RERANK_POOL = 20;

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
    private readonly aiClient: AiClient,
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

    const near = await this.retrieveRankedJobs(userId, limit);
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

  /**
   * Hybrid retrieval (Phase B): fuse dense semantic search (pgvector cosine) with
   * sparse keyword search (Postgres BM25/`tsvector`) via Reciprocal Rank Fusion,
   * returning the top `limit` jobs each with its dense cosine similarity (the
   * skills signal downstream scoring needs).
   *
   * Single source of truth for retrieval: the recommendation pipeline (execute)
   * AND the offline eval harness both call this, so they can never drift into
   * measuring a different retriever than what ships.
   */
  async retrieveRankedJobs(
    userId: string,
    limit: number,
    opts: RetrievalOptions = {},
  ): Promise<NearJobRow[]> {
    const dense = await this.denseCandidates(userId, RETRIEVAL_POOL);
    const cosineById = new Map(dense.map((d) => [d.id, Number(d.cosine_sim)]));

    const queryText = await this.candidateQueryText(userId);
    const sparse = queryText
      ? await this.sparseCandidates(queryText, RETRIEVAL_POOL)
      : [];

    let fusedIds = reciprocalRankFusion([
      dense.map((d) => d.id),
      sparse.map((s) => s.id),
    ]).map((f) => f.id);

    // Optional LLM rerank of the fused shortlist (Phase B). Off in production
    // until the eval proves it helps; the harness turns it on to measure.
    if (opts.rerank && queryText) {
      fusedIds = await this.rerankFused(queryText, fusedIds);
    }

    const topIds = fusedIds.slice(0, limit);

    // A job surfaced only by BM25 may sit outside the dense pool — fetch its
    // cosine so downstream scoring still has the semantic (skills) signal.
    const missing = topIds.filter((id) => !cosineById.has(id));
    if (missing.length > 0) {
      for (const row of await this.cosineForJobs(userId, missing)) {
        cosineById.set(row.id, Number(row.cosine_sim));
      }
    }

    return topIds.map((id) => ({ id, cosine_sim: cosineById.get(id) ?? 0 }));
  }

  /**
   * Reorder the top {@link RERANK_POOL} fused jobs with the LLM reranker; jobs
   * beyond the pool keep their fused order. Degrades to the fused order (no
   * reorder) if the AI service is unavailable.
   */
  private async rerankFused(queryText: string, fusedIds: string[]): Promise<string[]> {
    const poolIds = fusedIds.slice(0, RERANK_POOL);
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: poolIds } },
      select: { id: true, title: true, description: true, company: { select: { name: true } } },
    });
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const docs = poolIds
      .filter((id) => jobById.has(id))
      .map((id) => {
        const j = jobById.get(id)!;
        const desc = (j.description ?? '').replace(/\s+/g, ' ').slice(0, 500);
        return { id, text: `${j.title} at ${j.company?.name ?? 'company'}. ${desc}` };
      });
    if (docs.length === 0) return fusedIds;

    try {
      const { scores } = await this.aiClient.rerank(queryText, docs);
      const scoreById = new Map(scores.map((s) => [s.id, s.score]));
      const reranked = [...poolIds].sort(
        (a, b) => (scoreById.get(b) ?? 0) - (scoreById.get(a) ?? 0),
      );
      return [...reranked, ...fusedIds.slice(RERANK_POOL)];
    } catch (err) {
      if (err instanceof AiServiceError) {
        this.logger.warn(`Rerank unavailable (${err.code}); using fused order`);
        return fusedIds;
      }
      throw err;
    }
  }

  /** Dense retriever: nearest jobs to the candidate embedding by cosine distance. */
  private denseCandidates(userId: string, limit: number): Promise<NearJobRow[]> {
    return this.prisma.$queryRawUnsafe<NearJobRow[]>(
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
  }

  /** Sparse retriever: BM25 keyword match of the candidate's terms against jobs. */
  private sparseCandidates(queryText: string, limit: number): Promise<{ id: string }[]> {
    return this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id
         FROM jobs
        WHERE status = 'PUBLISHED'
          AND "searchTsv" @@ websearch_to_tsquery('english', $1)
        ORDER BY ts_rank("searchTsv", websearch_to_tsquery('english', $1)) DESC
        LIMIT $2`,
      queryText,
      limit,
    );
  }

  /** Cosine similarity for a specific set of jobs (for BM25-only hits). */
  private cosineForJobs(userId: string, jobIds: string[]): Promise<NearJobRow[]> {
    return this.prisma.$queryRawUnsafe<NearJobRow[]>(
      `SELECT j.id, 1 - (j.embedding <=> p.embedding) AS cosine_sim
         FROM jobs j
         CROSS JOIN (SELECT embedding FROM profiles WHERE "userId" = $1) p
        WHERE j.id = ANY($2::text[])
          AND j.embedding IS NOT NULL
          AND p.embedding IS NOT NULL`,
      userId,
      jobIds,
    );
  }

  /** The candidate's keyword query for BM25: headline + résumé skills + titles. */
  private async candidateQueryText(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { headline: true },
    });
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS' },
      orderBy: { updatedAt: 'desc' },
      select: { parsedData: { select: { skills: true, experiences: true } } },
    });

    const parts: string[] = [];
    if (profile?.headline) parts.push(profile.headline);
    const skills = toStringArray(resume?.parsedData?.skills ?? null);
    if (skills.length > 0) parts.push(skills.join(' '));
    const titles = toExperienceTitles(resume?.parsedData?.experiences ?? null);
    if (titles.length > 0) parts.push(titles.join(' '));
    return parts.join(' ').slice(0, 2000);
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
