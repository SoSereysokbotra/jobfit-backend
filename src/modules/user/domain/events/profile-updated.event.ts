// src/modules/user/domain/events/profile-updated.event.ts
//
// Raised when a field on the user's Profile changes (e.g. "firstName", "lastName", "bio").
// Carries the field name plus its previous and new value for auditing / reactions.

import { DomainEvent } from '@common/abstracts/domain-event';

export class ProfileUpdatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly changedField: string,
    public readonly oldValue: any,
    public readonly newValue: any,
  ) {
    super(aggregateId);
  }
}
