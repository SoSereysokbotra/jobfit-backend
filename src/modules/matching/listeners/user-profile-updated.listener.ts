import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchingEmbeddingService } from '../application/services/matching-embedding.service';

// DomainEvent subclasses carry the user id as `aggregateId`; ResumeParsedEvent
// carries the résumé id instead (resolved to a user inside the service).
interface AggregateEvent {
  aggregateId: string;
}

/**
 * (Re-)embed a candidate whenever their profile, preferences, or résumé change,
 * so matching reflects the latest signal. Failures are logged and swallowed.
 */
@Injectable()
export class UserProfileUpdatedListener {
  private readonly logger = new Logger(UserProfileUpdatedListener.name);

  constructor(private readonly embeddings: MatchingEmbeddingService) {}

  @OnEvent('ProfileCreatedEvent')
  @OnEvent('ProfileUpdatedEvent')
  @OnEvent('PreferencesUpdatedEvent')
  async onProfileChange(event: AggregateEvent): Promise<void> {
    await this.reembed(() => this.embeddings.embedCandidate(event.aggregateId), event.aggregateId);
  }

  @OnEvent('ResumeParsedEvent')
  async onResumeParsed(event: AggregateEvent): Promise<void> {
    await this.reembed(
      () => this.embeddings.embedCandidateByResume(event.aggregateId),
      `resume:${event.aggregateId}`,
    );
  }

  private async reembed(fn: () => Promise<boolean>, ref: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Failed to embed candidate (${ref}): ${(err as Error).message}`);
    }
  }
}
