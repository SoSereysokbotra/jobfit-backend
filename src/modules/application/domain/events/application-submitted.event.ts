// src/modules/application/domain/events/application-submitted.event.ts
//
// Raised when a job seeker submits an application.

import { DomainEvent } from '@common/abstracts/domain-event';

export class ApplicationSubmittedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly userId: string,
    public readonly jobId: string,
  ) {
    super(aggregateId);
  }
}
