import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchingEmbeddingService } from '../application/services/matching-embedding.service';
import { RecommendationStalenessService } from '../application/services/recommendation-staleness.service';

// DomainEvent subclasses carry the user id as `aggregateId`; ResumeParsedEvent
// carries the résumé id instead (resolved to a user inside the service).
interface AggregateEvent {
  aggregateId: string;
}

/**
 * (Re-)embed a candidate whenever their profile, preferences, or résumé change, and
 * invalidate the scores derived from the old data. Failures are logged and swallowed.
 *
 * RE-EMBEDDING IS ONLY HALF THE JOB. The new vector lands in `profiles.embedding`, but
 * every score in `recommendations` was computed from the OLD one, and nothing recomputes
 * them — `getForUser` rebuilt only when a user had zero rows, and there is no cron. So
 * the embedding moved and the user's matches did not, which is why "pick a different
 * default CV and your recommendations update" never actually worked
 * (MENTOR_REVIEW_2026-08-18 §6, PHASE_DEFAULT_RESUME.md Step 3).
 *
 * THE TWO STEPS ARE INDEPENDENT, and used to be chained: marking ran only if the embed
 * returned true. That silently lost the invalidation for the one edit that needs it most.
 * `buildCandidateText` covers headline, bio, industries and the résumé — NOT city or
 * country — so a location change produces a byte-identical vector, and the whole point of
 * the edit is the deterministic location sub-score, which is recomputed from
 * `profiles.city`/`country` at score time. Chaining meant a user who moved from the US to
 * Cambodia while the AI service happened to be down never got their matches invalidated:
 * the embed returned false, marking was skipped, and because the event is fire-and-forget
 * with no queue and no retry, that invalidation was lost PERMANENTLY. Their
 * recommendations then served the old country until some unrelated edit re-embedded
 * successfully.
 *
 * So the mark now runs whatever the embed did. It runs AFTER the attempt rather than
 * before, so a successful embed is already stored when the rows are flagged — a read
 * landing in between would otherwise recompute against the old vector and clear the flag.
 *
 * The old ordering was defended as avoiding "a permanent recompute loop against a vector
 * that never changed". That risk is real and is handled where it belongs: a recompute
 * that produces nothing no longer re-runs on every read — RecommendationsQueryService
 * holds the user off for a cooldown. See RECOMPUTE_RETRY_COOLDOWN_MS there.
 */
@Injectable()
export class UserProfileUpdatedListener {
  private readonly logger = new Logger(UserProfileUpdatedListener.name);

  constructor(
    private readonly embeddings: MatchingEmbeddingService,
    private readonly staleness: RecommendationStalenessService,
  ) {}

  // ResumeDefaultChangedEvent also carries the user id: switching default CVs changes
  // which résumé the vector is built from, so it needs the same rebuild. Without it the
  // user picks a different CV, nothing moves, and the setting looks inert.
  @OnEvent('ProfileCreatedEvent')
  @OnEvent('ProfileUpdatedEvent')
  @OnEvent('PreferencesUpdatedEvent')
  @OnEvent('ResumeDefaultChangedEvent')
  async onProfileChange(event: AggregateEvent): Promise<void> {
    await this.refresh(
      () => this.embeddings.embedCandidate(event.aggregateId),
      event.aggregateId,
      () => this.staleness.markStale(event.aggregateId),
    );
  }

  @OnEvent('ResumeParsedEvent')
  async onResumeParsed(event: AggregateEvent): Promise<void> {
    await this.refresh(
      () => this.embeddings.embedCandidateByResume(event.aggregateId),
      `resume:${event.aggregateId}`,
      // The event carries a résumé id, so the owner has to be resolved before their
      // recommendations can be marked.
      () => this.staleness.markStaleByResume(event.aggregateId),
    );
  }

  /**
   * Re-embed, then invalidate — two INDEPENDENT best-effort steps, in that order.
   *
   * Neither can fail the user's edit: a candidate must not lose a profile change because
   * the AI service was down. What changed is that step 2 no longer depends on step 1
   * having worked. See the class comment for why chaining them lost location edits.
   *
   * Step 1 returning false is not a failure — `embedCandidate` returns false when there
   * is nothing to embed (no profile yet). It is reported at debug level, and step 2 runs
   * regardless: a user with no profile simply has no live rows, so the mark is a
   * zero-row no-op rather than something to guard against.
   */
  private async refresh(
    embed: () => Promise<boolean>,
    ref: string,
    invalidate: () => Promise<number>,
  ): Promise<void> {
    // ── Step 1: refresh the vector. Best effort. ──────────────────────────────
    try {
      const embedded = await embed();
      if (!embedded) {
        this.logger.debug(`Nothing to embed for ${ref}; invalidating anyway`);
      }
    } catch (err) {
      this.logger.error(`Failed to embed candidate (${ref}): ${(err as Error).message}`);
    }

    // ── Step 2: invalidate the derived scores. ALWAYS, whatever step 1 did. ───
    // The scores depend on more than the vector — the location sub-score is computed
    // from `profiles.city`/`country`, which this edit may well be what changed.
    try {
      const marked = await invalidate();
      if (marked > 0) {
        this.logger.log(`Marked ${marked} recommendations stale for ${ref}`);
      }
    } catch (err) {
      // The profile row is already newer than the scores; the next successful change, or
      // a manual recompute, will catch up. Not worth failing the user's edit over.
      this.logger.error(
        `Could not mark recommendations stale for ${ref}: ${(err as Error).message}`,
      );
    }
  }
}
