import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchingEmbeddingService } from '../application/services/matching-embedding.service';
import { RecommendationStalenessService } from '../application/services/recommendation-staleness.service';

interface JobLike {
  jobId: string;
}

/**
 * On job publish, (re-)embed the job so it becomes matchable. Failures are logged
 * and swallowed — embedding must never break the publish flow (a missing embedding
 * just means the job is skipped until the next backfill).
 */
@Injectable()
export class JobPublishedListener {
  private readonly logger = new Logger(JobPublishedListener.name);

  constructor(
    private readonly embeddings: MatchingEmbeddingService,
    private readonly staleness: RecommendationStalenessService,
  ) {}

  @OnEvent('JobPublishedEvent')
  async onPublished(event: JobLike): Promise<void> {
    await this.reembedAndInvalidate(event.jobId, 'published');
  }

  @OnEvent('JobUpdatedEvent')
  async onUpdated(event: JobLike): Promise<void> {
    await this.reembedAndInvalidate(event.jobId, 'updated');
  }

  @OnEvent('JobClosedEvent')
  async onClosed(event: JobLike): Promise<void> {
    try {
      const removed = await this.staleness.removeForClosedJob(event.jobId);
      if (removed > 0) {
        this.logger.log(`Removed ${removed} recommendations for closed job ${event.jobId}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to remove recommendations for closed job ${event.jobId}: ${(err as Error).message}`,
      );
    }
  }

  private async reembedAndInvalidate(jobId: string, action: string): Promise<void> {
    try {
      const embedded = await this.embeddings.embedJob(jobId);
      if (!embedded) {
        this.logger.warn(`Job ${jobId} ${action}, but embedding was unavailable`);
        return;
      }
      const marked = await this.staleness.markStaleForJob(jobId);
      if (marked > 0) {
        this.logger.log(`Marked ${marked} recommendations stale for ${action} job ${jobId}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to re-embed ${action} job ${jobId}: ${(err as Error).message}`,
      );
    }
  }
}
