// src/modules/user/domain/events/user-created.event.ts
//
// Raised when a new User aggregate is created (Prompt 3.3). A listener can react to this
// (e.g. provision default UserAnalytics, send a welcome email).

import { DomainEvent } from '@common/abstracts/domain-event';

export class UserCreatedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super(userId);
  }
}
