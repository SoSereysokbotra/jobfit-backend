import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import aiConfig from '@config/ai.config';
import { MetricsService } from '@modules/metrics/metrics.service';

import { AiErrorCode, AiServiceError } from './ai.errors';
import {
  AiHealth,
  CoverLetterRequest,
  CoverLetterResponse,
  EmbedResponse,
  FileType,
  InterviewRequest,
  InterviewResponse,
  JobRequirementsRequest,
  JobRequirementsResponse,
  MatchReasonRequest,
  MatchReasonResponse,
  ParseResumeResponse,
  RerankDocument,
  RerankResponse,
  ScoreResumeResponse,
} from './ai.types';

/** One retry (=> up to 2 attempts) on 5xx / timeout / network error. */
const MAX_RETRIES = 1;

interface AiErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Typed, resilient HTTP client for jobfits-ai-service.
 *
 * - Sends the shared secret as `X-AI-Service-Key` on every call.
 * - Per-call timeout (generate/parse are slow; embed/health fast).
 * - 1 retry on 5xx / timeout / network error; 4xx are not retried (deterministic).
 * - Every failure surfaces as {@link AiServiceError} so callers can fall back to
 *   their heuristic path — an AI outage must never hard-fail a feature.
 *
 * Uses Node's global `fetch` (Node 22) — no extra HTTP dependency.
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl: string;

  constructor(
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
    // OPTIONAL on purpose. Metrics are observability, not behaviour: an AI call must not
    // fail because the metrics provider is absent, and the dozens of existing unit tests
    // that construct an AiClient with a config alone keep working unchanged.
    @Optional() private readonly metrics?: MetricsService,
  ) {
    // Trim a trailing slash so `${baseUrl}${path}` never doubles up.
    this.baseUrl = config.serviceUrl.replace(/\/+$/, '');
  }

  // ── Public API (mirrors the AI service contract) ───────────────────────────

  /** Liveness + loaded models. No auth required by the service. */
  health(): Promise<AiHealth> {
    return this.send<AiHealth>('GET', '/health', undefined, this.config.timeoutMsEmbed);
  }

  parseResume(text: string, fileType: FileType): Promise<ParseResumeResponse> {
    return this.send<ParseResumeResponse>(
      'POST',
      '/resume/parse',
      { text, fileType },
      this.config.timeoutMsGenerate,
    );
  }

  scoreResume(text: string, targetRole?: string): Promise<ScoreResumeResponse> {
    return this.send<ScoreResumeResponse>(
      'POST',
      '/resume/score',
      { text, targetRole },
      this.config.timeoutMsGenerate,
    );
  }

  embed(inputs: string[]): Promise<EmbedResponse> {
    return this.send<EmbedResponse>(
      'POST',
      '/embed',
      { inputs },
      this.config.timeoutMsEmbed,
    );
  }

  generateCoverLetter(input: CoverLetterRequest): Promise<CoverLetterResponse> {
    return this.send<CoverLetterResponse>(
      'POST',
      '/generate/cover-letter',
      input,
      this.config.timeoutMsGenerate,
    );
  }

  generateInterview(input: InterviewRequest): Promise<InterviewResponse> {
    return this.send<InterviewResponse>(
      'POST',
      '/generate/interview',
      input,
      this.config.timeoutMsGenerate,
    );
  }

  /**
   * Extract the checkable hiring requirements from a job description.
   *
   * The returned list is already filtered to grounded requirements — the AI service drops
   * anything built from words the posting never used. Check `groundedness` to see how much
   * of the raw model output was invented before that filtering.
   */
  extractJobRequirements(
    input: JobRequirementsRequest,
  ): Promise<JobRequirementsResponse> {
    return this.send<JobRequirementsResponse>(
      'POST',
      '/job/requirements',
      input,
      this.config.timeoutMsGenerate,
    );
  }

  /** Rerank a shortlist of documents by fit to the query (LLM-based). */
  rerank(query: string, documents: RerankDocument[]): Promise<RerankResponse> {
    return this.send<RerankResponse>(
      'POST',
      '/rerank',
      { query, documents },
      this.config.timeoutMsGenerate,
    );
  }

  /**
   * Structured "why does this candidate fit this job" reasoning (Phase C).
   *
   * Always returns a valid shape: the service falls back to a deterministic
   * answer with `degraded: true` rather than failing, so check that flag before
   * treating the output as model judgement.
   */
  matchReason(input: MatchReasonRequest): Promise<MatchReasonResponse> {
    return this.send<MatchReasonResponse>(
      'POST',
      '/match/reason',
      input,
      this.config.timeoutMsGenerate,
    );
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private async send<TRes>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<TRes> {
    const url = `${this.baseUrl}${path}`;
    let lastError: AiServiceError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();

      try {
        let res: Response;
        try {
          res = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'X-AI-Service-Key': this.config.serviceKey,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (err) {
          this.record(path, 'error', startedAt);
          // Aborted => our timeout fired; otherwise a network/DNS failure.
          lastError = controller.signal.aborted
            ? new AiServiceError(
                'TIMEOUT',
                `AI request to ${path} timed out after ${timeoutMs}ms`,
                undefined,
                err,
              )
            : new AiServiceError(
                'NETWORK',
                `AI request to ${path} failed: ${(err as Error).message}`,
                undefined,
                err,
              );
          if (attempt < MAX_RETRIES) {
            this.logRetry(method, path, attempt, lastError);
            continue;
          }
          throw lastError;
        }

        if (res.ok) {
          this.logger.debug(
            `${method} ${path} -> ${res.status} (${Date.now() - startedAt}ms)`,
          );
          this.record(path, 'success', startedAt);
          return (await res.json()) as TRes;
        }

        this.record(path, 'error', startedAt);
        const err = await this.toError(res, path);
        // Retry only on server-side failures; 4xx are deterministic.
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = err;
          this.logRetry(method, path, attempt, err);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    // Unreachable in practice (the loop always returns or throws), but keeps the
    // type checker happy and gives a sane error if the invariant ever breaks.
    throw (
      lastError ??
      new AiServiceError('INTERNAL', `AI request to ${path} failed`)
    );
  }

  /**
   * Record one AI call. Never throws: a metrics failure must not take down the feature
   * it is measuring.
   *
   * Counted per ATTEMPT, not per logical request — a retry is a second inference and a
   * second bill, so collapsing the two would understate exactly the load this exists to
   * watch (MENTOR_REVIEW_2026-08-18 §11).
   */
  private record(path: string, outcome: 'success' | 'error', startedAt: number): void {
    try {
      this.metrics?.observeAiCall(
        { operation: path, outcome },
        (Date.now() - startedAt) / 1000,
      );
    } catch {
      // Intentionally swallowed — see above.
    }
  }

  /** Map a non-2xx response to an {@link AiServiceError}, reading the envelope. */
  private async toError(res: Response, path: string): Promise<AiServiceError> {
    let code: AiErrorCode =
      res.status === 401
        ? 'UNAUTHORIZED'
        : res.status >= 500
          ? 'MODEL_ERROR'
          : 'BAD_REQUEST';
    let message = `AI service ${path} returned HTTP ${res.status}`;

    try {
      const parsed = (await res.json()) as AiErrorEnvelope;
      if (parsed?.error?.code) code = parsed.error.code as AiErrorCode;
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body (e.g. a proxy 502) — keep the generic message.
    }

    return new AiServiceError(code, message, res.status);
  }

  private logRetry(
    method: string,
    path: string,
    attempt: number,
    err: AiServiceError,
  ): void {
    this.logger.warn(
      `${method} ${path} failed (${err.code}${
        err.status ? ` ${err.status}` : ''
      }); retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})`,
    );
  }
}
