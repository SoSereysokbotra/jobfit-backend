// src/common/abstracts/domain-event.ts
//
// Base class for domain events (see PATTERNS.md § Domain Event Pattern). A domain event
// records that something meaningful happened to an aggregate. Subclasses add the specific
// payload and call `super(aggregateId)`.

export abstract class DomainEvent {
  /** Id of the aggregate that raised the event. */
  readonly aggregateId: string;

  /** When the event occurred. */
  readonly occurredAt: Date;

  constructor(aggregateId: string) {
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
  }
}
