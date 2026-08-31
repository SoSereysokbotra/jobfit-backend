// src/modules/health/health.module.ts
//
// Phase 3 — health probes. TerminusModule provides HealthCheckService +
// HealthIndicatorService. PrismaService (global) and RedisService (SharedModule, global)
// are injected by the indicators.
//
// QueueModule is imported for BullQueueService: the queue indicator has to probe BullMQ's
// own connection, not RedisService's (Redis audit R9). Importing the module that already
// registers the queue — rather than registering it again here — is what makes it the SAME
// connection the producer enqueues on.

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { QueueModule } from '@infra/queue/queue.module';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { MailHealthIndicator } from './indicators/mail.health-indicator';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [TerminusModule, QueueModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    MailHealthIndicator,
    HeartbeatService,
  ],
})
export class HealthModule {}
