import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEventBus } from './domain-event-bus.service';

/**
 * EventBusModule wraps NestJS EventEmitter2 and exposes the DomainEventBus used by the
 * application layer to publish aggregate domain events.
 * Global so any module can inject DomainEventBus without re-importing this module.
 * In Phase 2+, the EventEmitter2 can be swapped out for BullMQ or an external message
 * broker (NATS, RabbitMQ) without touching the listeners.
 */
@Global()
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
  providers: [DomainEventBus],
  exports: [EventEmitterModule, DomainEventBus],
})
export class EventBusModule {}
