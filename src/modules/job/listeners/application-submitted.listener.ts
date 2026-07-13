import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApplicationSubmittedEvent } from '../../application/domain/events/application-submitted.event';

/**
 * Listens for ApplicationSubmittedEvent and increments the job's applicant count.
 * This keeps the job module reactive without the application module knowing about job internals.
 */
@Injectable()
export class ApplicationSubmittedListener {
  private readonly logger = new Logger(ApplicationSubmittedListener.name);

  @OnEvent('ApplicationSubmittedEvent')
  async handleApplicationSubmitted(event: ApplicationSubmittedEvent): Promise<void> {
    this.logger.log(`Job ${event.jobId} received a new application from ${event.userId}`);
    // TODO: increment job.applicantCount via jobRepo when that field is added to the schema
  }
}
