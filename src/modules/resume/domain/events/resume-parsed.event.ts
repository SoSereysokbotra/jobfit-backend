// src/modules/resume/domain/events/resume-parsed.event.ts
//
// Raised when a resume finishes parsing successfully (extracted contact fields attached).

import { DomainEvent } from '@common/abstracts/domain-event';

export class ResumeParsedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly fullName?: string,
    public readonly email?: string,
  ) {
    super(aggregateId);
  }
}
