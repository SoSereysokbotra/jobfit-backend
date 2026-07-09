// src/events/domain-event-bus.service.ts
//
// Publishes domain events raised by aggregates. Wraps @nestjs/event-emitter's
// EventEmitter2 (registered globally by EventBusModule). Each event is emitted under its
// class name, so listeners subscribe with @OnEvent('UserCreatedEvent').

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '@common/abstracts/domain-event';

@Injectable()
export class DomainEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  /** Publish a single domain event (event name = its class name). */
  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.constructor.name, event);
  }

  /** Publish many events in order. */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
