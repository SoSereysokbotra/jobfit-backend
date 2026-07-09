// src/modules/user/domain/events/profile-created.event.ts
//
// Raised when a user's Profile is first created.

import { DomainEvent } from '@common/abstracts/domain-event';

export class ProfileCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly profileId: string,
  ) {
    super(aggregateId);
  }
}
