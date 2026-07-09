/**
 * Contract implemented by every domain event.
 *
 * A domain event captures something meaningful that has happened to an
 * aggregate. Events are collected on the aggregate (see {@link AggregateRoot})
 * and dispatched after the aggregate is persisted.
 */
export interface IDomainEvent {
  /** When the event occurred. */
  dateTimeOccurred: Date;

  /** Identity of the aggregate that raised the event. */
  getAggregateId(): string;
}

/**
 * Abstract base class for domain events.
 *
 * Extending this class is the preferred way to author new events: it supplies
 * the `aggregateId` and `occurredAt` fields and satisfies {@link IDomainEvent}
 * so events can be raised via {@link AggregateRoot.addDomainEvent} and consumed
 * by any listener that expects the interface.
 *
 * @example
 * ```typescript
 * export class JobPublishedEvent extends DomainEvent {
 *   constructor(aggregateId: string, public readonly title: string) {
 *     super(aggregateId);
 *   }
 * }
 * ```
 */
export abstract class DomainEvent implements IDomainEvent {
  /** Identity of the aggregate that raised the event. */
  public readonly aggregateId: string;

  /** When the event occurred. */
  public readonly occurredAt: Date;

  /** Interface alias for {@link DomainEvent.occurredAt}. */
  public readonly dateTimeOccurred: Date;

  /**
   * @param aggregateId - Identity of the aggregate raising the event.
   */
  protected constructor(aggregateId: string) {
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
    this.dateTimeOccurred = this.occurredAt;
  }

  /** @returns The identity of the aggregate that raised the event. */
  public getAggregateId(): string {
    return this.aggregateId;
  }
}
