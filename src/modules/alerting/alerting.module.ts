// src/modules/alerting/alerting.module.ts
//
// Phase 4 — alerting. Provides AlertingService (exported so the global exception filter can
// inject it). Slack transport comes from NotificationModule; PrismaService (global) and
// RedisService (SharedModule, global) are injected directly.

import { Module } from '@nestjs/common';
import { NotificationModule } from '@modules/notification/notification.module';
import { AlertingService } from './alerting.service';

@Module({
  imports: [NotificationModule],
  providers: [AlertingService],
  exports: [AlertingService],
})
export class AlertingModule {}
