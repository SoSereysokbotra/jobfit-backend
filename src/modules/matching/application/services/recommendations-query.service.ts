import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../use-cases/recompute-user-matches.use-case';
import { RecommendedJobDto } from '../../presentation/dtos/recommended-job.dto';
import { ScoutMatchDto } from '../../presentation/dtos/scout.dto';
import { MatchReadinessDto } from '../../presentation/dtos/match-readiness.dto';
import {
  RECOMMENDATION_JOB_INCLUDE,
  toRecommendedJobDto,
} from '../../presentation/dtos/recommended-job.mapper';
import { matchBand } from '../../domain/scoring/match-band';

const DEFAULT_LIMIT = 50;

/**
 * How far back the scout looks when the caller sends no `since`. The extension polls on a
 * 3-hour `chrome.alarms` schedule and always sends one; this only covers a first run or a
 * client that has lost its watermark, where "everything ever" would be the wrong answer.
 */
const DEFAULT_SCOUT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ceiling on how many new jobs one scout call will score. A background poll must stay
 * cheap even the day a large import lands. Also the tripwire for outgrowing live scoring:
 * if real results are being truncated here, fan-out-on-ingest is overdue.
 */
const SCOUT_CANDIDATE_CAP = 500;

/** Most matches one scout response returns, after scoring and thresholding. */
const SCOUT_RESULT_LIMIT = 50;

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
   * Why is the recommendations list empty?
   *
   * An empty array has four causes and the client used to render them identically as
   * "no matches" — telling a brand-new candidate that a market with hundreds of live
   * postings has nothing for them (docs/AI_DEGRADATION_PLAN.md §7).
   *
   * Reads the profile's own embedding columns rather than asking the AI service: the
   * question is "is THIS USER matchable", which is a fact about their row, not about
   * whether the AI happens to be up this second.
   */
  async getReadiness(userId: string): Promise<MatchReadinessDto> {
    const [row] = await this.prisma.$queryRawUnsafe<
      {
        embeddingStatus: string;
        embeddedAt: Date | null;
        embeddingError: string | null;
        hasEmbedding: boolean;
      }[]
    >(
      `SELECT "embeddingStatus", "embeddedAt", "embeddingError",
              (embedding IS NOT NULL) AS "hasEmbedding"
         FROM profiles
        WHERE "userId" = $1 AND "deletedAt" IS NULL`,
      userId,
    );

    if (!row) {
      return new MatchReadinessDto({
        state: 'NO_PROFILE',
        message:
          'Add your profile and we can start matching you to jobs. It takes a minute.',
        transient: false,
        action: 'CREATE_PROFILE',
      });
    }

    // A usable vector is the real test. Status is how we got here; the vector is whether
    // matching can run at all — and a stale-but-present vector still matches.
    if (row.hasEmbedding) {
      return new MatchReadinessDto({
        state: 'READY',
        message: 'Your profile is ready for matching.',
        transient: false,
        embeddedAt: row.embeddedAt?.toISOString(),
      });
    }

    if (row.embeddingStatus === 'FAILED') {
      // Ours to fix, and it will NOT fix itself — the embed is a one-shot event listener
      // with no retry. Say something true without blaming the user or promising a retry
      // that does not exist.
      return new MatchReadinessDto({
        state: 'EMBEDDING_FAILED',
        message:
          'We could not finish setting up your matches. Updating your profile will ' +
          'make us try again.',
        transient: false,
        action: 'UPDATE_PROFILE',
        detail: row.embeddingError ?? undefined,
      });
    }

    return new MatchReadinessDto({
      state: 'EMBEDDING_PENDING',
      message: "We're still setting up your matches — this usually takes a minute.",
      transient: true,
    });
  }

  /**
   * New high-match jobs for the extension's passive scout.
   *
   * SCORES LIVE; DOES NOT READ THE CACHE. It used to filter existing `recommendation`
   * rows by `job.createdAt >= since`, which cannot work: a recommendation row only
   * exists if a recompute ran, and a job ingested AFTER the user's last recompute has no
   * row at all. The endpoint was structurally incapable of returning a new job, and
   * returned `[]` forever — indistinguishable from "no good jobs this week", while the
   * extension polled it every 3 hours (MENTOR_REVIEW_2026-08-18 §7).
   *
   * So the window is inverted: take the jobs that are actually new, then score those.
   * Scoring goes through `RecomputeUserMatchesUseCase.scoreJobs`, the same path that
   * writes the cache, so a scout score and a `/recommendations` score for the same job
   * cannot disagree.
   *
   * WHY LIVE RATHER THAN FANNING OUT ON INGEST. At current corpus size a scout call
   * scores a few hundred rows at most — one pgvector query plus arithmetic, no LLM. Fan-
   * out on ingest (recompute every affected user when a batch lands) is the right answer
   * once the corpus or the user base is large enough that per-request scoring stops being
   * free, because it moves the cost off the request path and amortises it across users.
   * It is also much more machinery: a queue, a per-user job, and a way to avoid
   * stampeding on a big import. Not worth it at this scale — but `SCOUT_CANDIDATE_CAP`
   * below is the tripwire: if it starts truncating real results, live scoring has been
   * outgrown.
   */
  async getScout(
    userId: string,
    minScore: number,
    since?: string,
  ): Promise<ScoutMatchDto[]> {
    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - DEFAULT_SCOUT_WINDOW_MS);

    // The jobs that are genuinely new, newest first. Bounded so one enormous import
    // cannot turn a background poll into a slow request.
    const candidates = await this.prisma.job.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: sinceDate } },
      orderBy: { createdAt: 'desc' },
      take: SCOUT_CANDIDATE_CAP,
      select: {
        id: true,
        title: true,
        externalId: true,
        externalUrl: true,
        source: true,
        company: { select: { name: true } },
      },
    });
    if (candidates.length === 0) return [];

    // A job the user already said "not interested" to must not come back as a
    // notification. The cache read filtered these out implicitly; scoring live has to do
    // it explicitly.
    const dismissed = await this.prisma.recommendation.findMany({
      where: {
        userId,
        dismissedAt: { not: null },
        jobId: { in: candidates.map((j) => j.id) },
      },
      select: { jobId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.jobId));
    const scoreable = candidates.filter((j) => !dismissedIds.has(j.id));
    if (scoreable.length === 0) return [];

    // cosineForJobs drops jobs with no embedding, and returns nothing at all when the
    // user has no profile vector — both correctly yield "no matches" rather than a
    // score computed from a missing input.
    const cosines = await this.recompute.cosineForJobs(
      userId,
      scoreable.map((j) => j.id),
    );
    const scored = await this.recompute.scoreJobs(userId, cosines);
    if (scored === null || scored.length === 0) return [];

    const jobById = new Map(scoreable.map((j) => [j.id, j]));
    // Internal jobs have no external apply URL — link to the web app job page.
    const base = (process.env.CORS_ORIGIN ?? '').split(',')[0]?.trim() ?? '';

    return scored
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, SCOUT_RESULT_LIMIT)
      .flatMap((s) => {
        const job = jobById.get(s.jobId);
        if (!job) return [];
        return [
          {
            externalId: job.externalId ?? job.id,
            source: (job.source ?? 'jobfit').toLowerCase(),
            title: job.title,
            company: job.company?.name ?? null,
            score: Math.round(s.score),
            band: matchBand(s.score),
            url: job.externalUrl ?? (base ? `${base}/jobs/${job.id}` : ''),
          },
        ];
      });
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
