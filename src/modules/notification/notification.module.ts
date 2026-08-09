import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { SlackNotifierService } from './slack-notifier.service';
import { JobPublishedListener } from './listeners/job-published.listener';
import { ApplicationSubmittedListener } from './listeners/application-submitted.listener';

/**
 * ApplicationStatusChangedListener is GONE, not left as a stub.
 *
 * It could not be made correct in this shape. `ApplicationStatusChangedEvent` is published
 * from exactly one place — `ApplicationService.updateStatus`, the candidate changing their
 * OWN application, which is the one change the candidate does not need telling about.
 * Every employer-driven move (screening, interview, offer, rejection) goes through the
 * transition chokepoint from a different caller and published nothing at all.
 *
 * And an @OnEvent handler fires on `emitAsync`, which for a status change means it fires
 * from inside a transaction that may still roll back — notifying someone of a hiring
 * decision that never happened.
 *
 * Status-change notifications are now written by the chokepoint itself, in the same
 * transaction as the two audit rows it already writes. See ApplicationTransitionService.
 */
@Module({
  providers: [
    NotificationService,
    // Phase 4 — Slack alert transport, reused by AlertingService.
    SlackNotifierService,
    JobPublishedListener,
    ApplicationSubmittedListener,
  ],
  controllers: [NotificationController],
  exports: [NotificationService, SlackNotifierService],
})
export class NotificationModule {}
