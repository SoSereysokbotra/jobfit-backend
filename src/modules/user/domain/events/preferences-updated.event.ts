// src/modules/user/domain/events/preferences-updated.event.ts
//
// Raised when a user's work preferences (desired job levels / remote types /
// employment types / industries) change on their Profile.

import { DomainEvent } from '@common/abstracts/domain-event';

export class PreferencesUpdatedEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super(aggregateId);
  }
}
