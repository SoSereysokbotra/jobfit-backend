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
 * (Re-)embed a candidate whenever their profile, preferences, or résumé change,
 * so matching reflects the latest signal. Failures are logged and swallowed.
 *
 * RE-EMBEDDING IS ONLY HALF THE JOB. The new vector lands in `profiles.embedding`, but
 * every score in `recommendations` was computed from the OLD one, and nothing recomputes
 * them — `getForUser` rebuilt only when a user had zero rows, and there is no cron. So
 * the embedding moved and the user's matches did not, which is why "pick a different
 * default CV and your recommendations update" never actually worked
 * (MENTOR_REVIEW_2026-08-18 §6, PHASE_DEFAULT_RESUME.md Step 3).
 *
 * Each re-embed is therefore paired with marking that user's recommendations stale. The
 * marking runs ONLY after the embed succeeds: marking first would strand the user on a
 * permanent recompute loop against a vector that never changed.
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
    await this.reembed(
      () => this.embeddings.embedCandidate(event.aggregateId),
      event.aggregateId,
      () => this.staleness.markStale(event.aggregateId),
    );
  }

  @OnEvent('ResumeParsedEvent')
  async onResumeParsed(event: AggregateEvent): Promise<void> {
    await this.reembed(
      () => this.embeddings.embedCandidateByResume(event.aggregateId),
      `resume:${event.aggregateId}`,
      // The event carries a résumé id, so the owner has to be resolved before their
      // recommendations can be marked.
      () => this.staleness.markStaleByResume(event.aggregateId),
    );
  }

  /**
   * Run an embed, then — only if it succeeded — invalidate what was derived from the old
   * vector. Both steps are swallowed on failure: a candidate must not lose a profile
   * edit because the AI service was down.
   *
   * `embedCandidate` returns false (rather than throwing) when there is nothing to embed,
   * e.g. no profile yet. Nothing was recomputed, so nothing needs invalidating.
   */
  private async reembed(
    fn: () => Promise<boolean>,
    ref: string,
    invalidate?: () => Promise<number>,
  ): Promise<void> {
    let embedded = false;
    try {
      embedded = await fn();
    } catch (err) {
      this.logger.error(`Failed to embed candidate (${ref}): ${(err as Error).message}`);
      return;
    }
    if (!embedded || !invalidate) return;
    try {
      const marked = await invalidate();
      if (marked > 0) {
        this.logger.log(
          `Marked ${marked} recommendations stale for ${ref} after re-embedding`,
        );
      }
    } catch (err) {
      // The vector is already newer than the scores; the next successful change, or a
      // manual recompute, will catch up. Not worth failing the user's edit over.
      this.logger.error(
        `Re-embedded ${ref} but could not mark recommendations stale: ${(err as Error).message}`,
      );
    }
  }
}
