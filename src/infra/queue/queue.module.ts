// src/infra/queue/queue.module.ts
//
// QueueModule — BullMQ + Redis. Owns the BullMQ connection, the queue registrations, and
// BullQueueService; exports them so both the producer (ResumeModule) and the readiness
// probe (HealthModule) work against the SAME queue instance.
//
// WHY IT LIVES HERE RATHER THAN IN ResumeModule (Redis audit R9). `isQueueHealthy()`
// pinged RedisService and reported the queue available. But BullMQ has its OWN ioredis
// client with its own connection state and the opposite configuration (see
// bull-queue.service.ts) — so /health/ready could report the queue healthy while uploads
// were hanging on a connection that was not up. A health check has to touch the thing it
// is reporting on.
//
// Registering the queue in HealthModule separately would NOT have fixed it: that creates
// a second Queue with a second connection, and a check of a connection nobody uses is
// the same lie in a new place. One registration, imported by both.

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { resolveRedisConnection } from '@config/redis-connection';
import { BullQueueService } from './bull-queue.service';
import { DEFAULT_JOB_OPTIONS } from './job-options';

@Module({
  imports: [
    // Resolved through the SHARED helper, not from redis.host/redis.port directly.
    // Those keys ignore REDIS_URL, which is the one variable managed providers give you
    // and the one cloudbuild.yaml sets — so this queue used to point at localhost in any
    // deployment configured by URL, and nothing said so. See @config/redis-connection.
    BullModule.forRootAsync({
      useFactory: () => ({ connection: resolveRedisConnection() }),
    }),
    // defaultJobOptions is NOT optional decoration: without it BullMQ gives a job one
    // attempt and keeps every completed job in Redis forever (Redis audit R5). See
    // ./job-options for what each value is chosen against.
    BullModule.registerQueue({
      name: 'resume-parsing',
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
  ],
  providers: [BullQueueService],
  // BullModule is re-exported so an importer's @Processor providers resolve the same
  // registered queue rather than declaring a second one.
  exports: [BullQueueService, BullModule],
})
export class QueueModule {}
