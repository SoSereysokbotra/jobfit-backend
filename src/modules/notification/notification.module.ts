import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SlackNotifierService } from './slack-notifier.service';
import { JobPublishedListener } from './listeners/job-published.listener';
import { ApplicationSubmittedListener } from './listeners/application-submitted.listener';
import { ApplicationStatusChangedListener } from './listeners/application-status-changed.listener';

@Module({
  providers: [
    NotificationService,
    // Phase 4 — Slack alert transport, reused by AlertingService.
    SlackNotifierService,
    JobPublishedListener,
    ApplicationSubmittedListener,
    ApplicationStatusChangedListener,
  ],
  exports: [SlackNotifierService],
})
export class NotificationModule {}

