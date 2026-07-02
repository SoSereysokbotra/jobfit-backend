import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * EventBusModule wraps NestJS EventEmitter2.
 * In Phase 2+, the EventEmitter2 can be swapped out for BullMQ or an
 * external message broker (NATS, RabbitMQ) without touching the listeners.
 */
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // Enable wildcard listeners so you can do: @OnEvent('job.*')
      wildcard: true,
      // Delimiter for namespaced events: 'job.published', 'application.submitted'
      delimiter: '.',
      // Max listeners per event — increase if you add many listeners to the same event
      maxListeners: 20,
      // Verbosity
      verboseMemoryLeak: true,
    }),
  ],
  exports: [EventEmitterModule],
})
export class EventBusModule {}
