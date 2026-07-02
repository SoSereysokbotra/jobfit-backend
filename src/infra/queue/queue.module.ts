import { Module } from '@nestjs/common';

/**
 * QueueModule — BullMQ + Redis.
 * Wired up in Phase 2 when resume parsing and match recomputation move off-thread.
 *
 * Phase 1: This module is imported but provides no workers yet.
 * Phase 2: Add BullModule.registerQueue({ name: 'resume-parsing' }) here.
 */
@Module({})
export class QueueModule {}
