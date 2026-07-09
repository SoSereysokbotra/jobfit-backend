// src/modules/user/domain/events/experience-added.event.ts
//
// Raised when a work experience is added to a user.

import { DomainEvent } from '@common/abstracts/domain-event';

export class ExperienceAddedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly experienceId: string,
    public readonly company: string,
    public readonly title: string,
  ) {
    super(aggregateId);
  }
}
