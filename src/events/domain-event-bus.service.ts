import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDomainEvent } from '@core/domain/domain-event';

/**
 * A domain-event handler. Receives the published event and may run
 * synchronously or return a promise.
 */
export type DomainEventHandler = (
  event: IDomainEvent,
) => void | Promise<void>;

/**
 * DomainEventBus
 *
 * A thin, injectable wrapper around NestJS {@link EventEmitter2} that exposes a
 * domain-oriented `subscribe`/`publish` API. It is backed by the same
 * EventEmitter2 instance used by `@OnEvent(...)` listeners across the app, so
 * events published here reach those listeners and vice-versa — there is a
 * single underlying event mechanism, not a competing one.
 *
 * Events are keyed by their class name (`event.constructor.name`), matching the
 * existing convention (e.g. a listener decorated with `@OnEvent('JobPublishedEvent')`).
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  /**
   * Registers a handler for the named event.
   *
   * @param eventName - The event class name to listen for (e.g. `'JobPublishedEvent'`).
   * @param handler - The function invoked when a matching event is published.
   */
  subscribe(eventName: string, handler: DomainEventHandler): void {
    this.emitter.on(eventName, handler);
  }

  /**
   * Publishes a domain event to all registered handlers, keyed by the event's
   * class name. All handlers are invoked; the returned promise resolves once
   * they settle.
   *
   * Handler failures are logged and swallowed so that one failing handler never
   * prevents the others from running or propagates back to the publisher.
   *
   * @param event - The domain event to dispatch.
   */
  async publish(event: IDomainEvent): Promise<void> {
    const eventName = event.constructor.name;

    try {
      await this.emitter.emitAsync(eventName, event);
    } catch (error) {
      this.logger.error(
        `Error handling ${eventName}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Do not rethrow — a failing handler must not break the publisher.
    }
  }
}
