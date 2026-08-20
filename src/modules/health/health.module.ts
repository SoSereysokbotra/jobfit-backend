// src/modules/health/health.module.ts
//
// Phase 3 — health probes. TerminusModule provides HealthCheckService +
// HealthIndicatorService. PrismaService (global) and RedisService (SharedModule, global)
// are injected by the indicators.

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { MailHealthIndicator } from './indicators/mail.health-indicator';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    MailHealthIndicator,
    HeartbeatService,
  ],
})
export class HealthModule {}
