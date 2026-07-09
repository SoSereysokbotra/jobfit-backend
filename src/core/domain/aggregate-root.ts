import { Entity } from './entity';
import { IDomainEvent } from './domain-event';

/**
 * Base class for aggregate roots.
 *
 * An aggregate root is the single entry point to a cluster of entities and
 * value objects that are treated as one consistency boundary. In addition to
 * being an {@link Entity}, it records the {@link IDomainEvent}s raised while its
 * invariants are enforced, so they can be dispatched after persistence.
 *
 * @typeParam T - The shape of the aggregate's properties (its `props`).
 */
export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: IDomainEvent[] = [];

  /**
   * The domain events raised since the aggregate was loaded or last cleared.
   *
   * @remarks Prefer {@link AggregateRoot.getDomainEvents} for new code; this
   * getter is retained for existing callers.
   */
  get domainEvents(): IDomainEvent[] {
    return this._domainEvents;
  }

  /**
   * Records a domain event to be dispatched after the aggregate is persisted.
   *
   * @param domainEvent - The event to enqueue.
   */
  protected addDomainEvent(domainEvent: IDomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  /**
   * @returns A snapshot of the pending domain events. Mutating the returned
   *   array does not affect the aggregate's internal list.
   */
  public getDomainEvents(): IDomainEvent[] {
    return [...this._domainEvents];
  }

  /**
   * Clears all pending domain events. Call this after the events have been
   * published so they are not dispatched twice.
   */
  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  /**
   * Alias for {@link AggregateRoot.clearDomainEvents}, retained for existing
   * callers.
   */
  public clearEvents(): void {
    this.clearDomainEvents();
  }
}
