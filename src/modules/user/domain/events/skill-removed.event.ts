// src/modules/user/domain/events/skill-removed.event.ts
//
// Raised when a skill is removed from a user.

import { DomainEvent } from '@common/abstracts/domain-event';

export class SkillRemovedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly skillId: string,
    public readonly skillName: string,
  ) {
    super(aggregateId);
  }
}
