import { IDomainEvent } from '@core/domain/domain-event';

export class UserRegisteredEvent implements IDomainEvent {
  public readonly dateTimeOccurred = new Date();
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly role: string,
  ) {}
  getAggregateId(): string { return this.userId; }
}
