import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JobPublishedListener } from './listeners/job-published.listener';
import { ApplicationSubmittedListener } from './listeners/application-submitted.listener';
import { ApplicationStatusChangedListener } from './listeners/application-status-changed.listener';

@Module({ providers: [NotificationService, JobPublishedListener, ApplicationSubmittedListener, ApplicationStatusChangedListener] })
export class NotificationModule {}
