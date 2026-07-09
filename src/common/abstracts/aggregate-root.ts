// src/common/abstracts/aggregate-root.ts
//
// Base class for aggregate roots (see PATTERNS.md § Aggregate Root Pattern). An aggregate
// root is an Entity that also records domain events raised during its lifetime; the
// application layer collects and dispatches them after persistence, then clears them.

import { Entity } from './entity';
import { DomainEvent } from './domain-event';

export abstract class AggregateRoot extends Entity {
  private _domainEvents: DomainEvent[] = [];

  /** Events raised but not yet dispatched. */
  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  /** Events raised but not yet dispatched (method form used by the service layer). */
  getDomainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  /** Record a domain event (raised by factory/business methods). */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Drop all recorded events — call after they have been dispatched. */
  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
