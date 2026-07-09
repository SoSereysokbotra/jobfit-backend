// src/modules/user/domain/events/education-added.event.ts
//
// Raised when an education record is added to a user.

import { DomainEvent } from '@common/abstracts/domain-event';

export class EducationAddedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly educationId: string,
    public readonly institution: string,
    public readonly fieldOfStudy: string,
  ) {
    super(aggregateId);
  }
}
