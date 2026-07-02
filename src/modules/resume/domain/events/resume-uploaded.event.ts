import { IDomainEvent } from '@core/domain/domain-event';

export class ResumeUploadedEvent implements IDomainEvent {
  public readonly dateTimeOccurred = new Date();
  constructor(
    public readonly resumeId: string,
    public readonly jobSeekerId: string,
    public readonly fileUrl: string,
  ) {}
  getAggregateId(): string { return this.resumeId; }
}
