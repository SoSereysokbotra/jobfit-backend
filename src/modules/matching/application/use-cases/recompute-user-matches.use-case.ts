import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  /**
   * Apply the LLM reranker to the fused shortlist (Phase B).
   *
   * Left UNDEFINED by production callers, which fall through to the `ai.rerankEnabled`
   * config flag. The eval harness always passes an explicit true/false so a measurement
   * can never be silently changed by whatever the deployment config happens to be.
   */
  rerank?: boolean;
  /** Apply the metadata pre-filter (default true). Set false to measure its effect. */
  filter?: boolean;
}

interface CandidateRetrieval {
  queryText: string; // BM25 keyword query
  minSalary: number | null; // metadata pre-filter: salary floor
  remoteOnly: boolean; // metadata pre-filter: candidate wants remote only
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

  /** Production default for the reranker; overridden per-call by the eval harness. */
  private readonly rerankEnabledByConfig: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly compute: ComputeMatchScoreUseCase,
    private readonly aiClient: AiClient,
    configService?: ConfigService,
  ) {
    // Optional so the many places that construct this directly in tests keep working;
    // absent config means the measured-best default (reranker on).
    this.rerankEnabledByConfig =
      configService?.get<boolean>('ai.rerankEnabled') ?? true;
  }

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
    // `companies.industry` is an Industry ID; the candidate's desiredIndustries are
    // NAMES. Resolving here is what makes scoreOther's match branch reachable at all —
    // comparing the raw id could never equal a name, and measured 0 matches across the
    // whole database.
    const industryNameById = await this.industryNames(
      jobs.map((j) => j.company?.industry).filter((i): i is string => !!i),
    );

    let written = 0;
    for (const row of near) {
      const job = jobById.get(row.id);
      if (!job) continue;

      const jobCtx: JobContext = {
        remoteType: job.remoteType,
        location: job.location,
        minSalary: job.minSalary,
        maxSalary: job.maxSalary,
        industry: job.company?.industry
          ? (industryNameById.get(job.company.industry) ?? null)
          : null,
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
   * Hybrid retrieval (Phase B): metadata pre-filter → fuse dense semantic search
   * (pgvector cosine) + sparse keyword search (Postgres BM25/`tsvector`) via
   * Reciprocal Rank Fusion → optional LLM rerank, returning the top `limit` jobs
   * each with its dense cosine similarity (the skills signal downstream needs).
   *
   * The metadata pre-filter drops clearly-wrong jobs BEFORE ranking (§5/§6):
   * inactive postings, jobs paying entirely below the candidate's floor, and —
   * for remote-only candidates — non-remote jobs. Conservative by design so it
   * removes embarrassing matches without hurting recall.
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
    const cand = await this.loadCandidate(userId);
    // Metadata pre-filter is OPT-IN and OFF by default: measured to trade ~11%
    // recall for +MRR on the eval set, and recall is the priority. Kept as a
    // measurable capability (valuable at scale) but not enabled in production.
    const filterCand: CandidateRetrieval =
      opts.filter === true ? cand : { ...cand, minSalary: null, remoteOnly: false };

    const dense = await this.denseCandidates(userId, RETRIEVAL_POOL, filterCand);
    const cosineById = new Map(dense.map((d) => [d.id, Number(d.cosine_sim)]));

    const sparse = cand.queryText
      ? await this.sparseCandidates(cand.queryText, RETRIEVAL_POOL, filterCand)
      : [];

    let fusedIds = reciprocalRankFusion([
      dense.map((d) => d.id),
      sparse.map((s) => s.id),
    ]).map((f) => f.id);

    // LLM rerank of the fused shortlist (Phase B). ON in production — measured
    // MRR@10 0.63 -> 0.75 (+20%). An explicit opts.rerank always wins so the eval
    // harness measures what it asked for, not what the deployment config says.
    const rerank = opts.rerank ?? this.rerankEnabledByConfig;
    if (rerank && cand.queryText) {
      fusedIds = await this.rerankFused(cand.queryText, fusedIds);
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

  // Conservative metadata pre-filter clauses, shared by dense + sparse. `$s` is the
  // candidate min-salary param, `$r` the remote-only boolean param.
  private static filterSql(alias: string, s: string, r: string): string {
    return (
      `AND (${s}::int IS NULL OR ${alias}."maxSalary" IS NULL OR ${alias}."maxSalary" >= ${s}) ` +
      `AND (${r} = false OR ${alias}."remoteType" = 'REMOTE')`
    );
  }

  /** Dense retriever: nearest jobs to the candidate embedding by cosine distance. */
  private denseCandidates(
    userId: string,
    limit: number,
    cand: CandidateRetrieval,
  ): Promise<NearJobRow[]> {
    return this.prisma.$queryRawUnsafe<NearJobRow[]>(
      `SELECT j.id, 1 - (j.embedding <=> p.embedding) AS cosine_sim
         FROM jobs j
         CROSS JOIN (SELECT embedding FROM profiles WHERE "userId" = $1) p
        WHERE j.embedding IS NOT NULL
          AND p.embedding IS NOT NULL
          AND j.status = 'PUBLISHED'
          ${RecomputeUserMatchesUseCase.filterSql('j', '$3', '$4')}
        ORDER BY j.embedding <=> p.embedding
        LIMIT $2`,
      userId,
      limit,
      cand.minSalary,
      cand.remoteOnly,
    );
  }

  /**
   * Sparse retriever: BM25 keyword match of the candidate's terms against jobs.
   *
   * ⚠️ KNOWN DEAD FOR MOST USERS — measured 2026-08-10, deliberately NOT "fixed" yet.
   *
   * `websearch_to_tsquery` treats unquoted whitespace as **AND**, and `queryText` is the
   * headline + every résumé skill + every past job title. So the tsquery is
   *
   *   'senior' & 'full-stack' & 'engin' & 'react' & 'typescript' & 'node.js' & …
   *
   * — one posting must contain ALL of them. Hits against the live corpus (61 published
   * jobs), AND (what ships) vs the same terms OR-ed:
   *
   *   strong@seed  0 → 27    junior@seed  0 → 39    partial@seed    0 → 26
   *   unrelated@   0 → 37    soviseth869  0 → 52
   *   lalirima123  3 → 25    snowrin168   3 → 25   ← the only two labelled candidates
   *
   * Every user with a parsed résumé gets zero, so "hybrid retrieval" is dense-only in
   * production for them.
   *
   * BUT THE OBVIOUS FIX MEASURED WORSE. A/B on identical data, k=10, n=2:
   *
   *   AND (ships)  Recall 0.500 · MRR 0.500 · nDCG 0.606
   *   OR  (fix)    Recall 0.458 · MRR 0.500 · nDCG 0.563
   *
   * On a 61-job corpus an OR of 20+ résumé terms matches 40-85% of everything, so the
   * sparse list stops discriminating and RRF just blends noise into a dense ranking that
   * was doing fine. Trading a retriever that returns nothing for one that returns
   * everything is not progress.
   *
   * AND THE HARNESS CANNOT ADJUDICATE THIS. Both labelled candidates have a ~24-character
   * `queryText` (no parsed résumé), so they are exactly the two users who never exhibited
   * the bug — and n=2 cannot resolve a 0.04 difference anyway. Fixing this properly needs
   * labelled candidates WITH résumés first. See docs/PHASE_E_PLAN.md.
   */
  private sparseCandidates(
    queryText: string,
    limit: number,
    cand: CandidateRetrieval,
  ): Promise<{ id: string }[]> {
    return this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id
         FROM jobs j
        WHERE status = 'PUBLISHED'
          AND "searchTsv" @@ websearch_to_tsquery('english', $1)
          ${RecomputeUserMatchesUseCase.filterSql('j', '$3', '$4')}
        ORDER BY ts_rank("searchTsv", websearch_to_tsquery('english', $1)) DESC
        LIMIT $2`,
      queryText,
      limit,
      cand.minSalary,
      cand.remoteOnly,
    );
  }

  /** Cosine similarity for a specific set of jobs (for BM25-only hits). */
  /** Public so single-job scoring reuses this exact query instead of restating it. */
  cosineForJobs(userId: string, jobIds: string[]): Promise<NearJobRow[]> {
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

  /**
   * Load the candidate's retrieval context: the BM25 keyword query (headline +
   * résumé skills + titles) plus the metadata pre-filter inputs (min salary,
   * remote-only preference).
   */
  private async loadCandidate(userId: string): Promise<CandidateRetrieval> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { headline: true, minSalary: true, desiredRemoteTypes: true },
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

    const remoteTypes = profile?.desiredRemoteTypes ?? [];
    return {
      queryText: parts.join(' ').slice(0, 2000),
      minSalary: profile?.minSalary ?? null,
      // Only a hard remote requirement (wants remote, nothing else) triggers the filter.
      remoteOnly: remoteTypes.length > 0 && remoteTypes.every((t) => t === 'REMOTE'),
    };
  }

  /**
   * Resolve Industry ids to names, for the industry sub-score.
   *
   * An id with no row (stale reference — the database has one) simply stays unresolved,
   * and the scorer treats an unknown industry as neutral rather than as a mismatch.
   */
  async industryNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.industry.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
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
