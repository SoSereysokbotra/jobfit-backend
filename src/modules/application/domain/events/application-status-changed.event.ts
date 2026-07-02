import { IDomainEvent } from '@core/domain/domain-event';

export class ApplicationStatusChangedEvent implements IDomainEvent {
  public readonly dateTimeOccurred = new Date();
  constructor(
    public readonly applicationId: string,
    public readonly previousStatus: string,
    public readonly newStatus: string,
  ) {}
  getAggregateId(): string { return this.applicationId; }
}
