import { IDomainEvent } from '@core/domain/domain-event';

export class ApplicationSubmittedEvent implements IDomainEvent {
  public readonly dateTimeOccurred = new Date();
  constructor(
    public readonly applicationId: string,
    public readonly jobId: string,
    public readonly jobSeekerId: string,
  ) {}
  getAggregateId(): string { return this.applicationId; }
}
