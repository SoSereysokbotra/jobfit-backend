import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchingEmbeddingService } from '../application/services/matching-embedding.service';

interface JobPublishedLike {
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

  constructor(private readonly embeddings: MatchingEmbeddingService) {}

  @OnEvent('JobPublishedEvent')
  async handle(event: JobPublishedLike): Promise<void> {
    try {
      await this.embeddings.embedJob(event.jobId);
    } catch (err) {
      this.logger.error(
        `Failed to embed job ${event.jobId}: ${(err as Error).message}`,
      );
    }
  }
}
