import { IDomainEvent } from '@core/domain/domain-event';

export class JobUpdatedEvent implements IDomainEvent {
  public readonly dateTimeOccurred: Date;

  constructor(
    public readonly jobId: string,
    public readonly changedFields: string[],
  ) {
    this.dateTimeOccurred = new Date();
  }

  getAggregateId(): string {
    return this.jobId;
  }
}
