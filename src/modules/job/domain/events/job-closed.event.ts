import { IDomainEvent } from '@core/domain/domain-event';

export class JobClosedEvent implements IDomainEvent {
  public readonly dateTimeOccurred: Date;

  constructor(public readonly jobId: string) {
    this.dateTimeOccurred = new Date();
  }

  getAggregateId(): string {
    return this.jobId;
  }
}
