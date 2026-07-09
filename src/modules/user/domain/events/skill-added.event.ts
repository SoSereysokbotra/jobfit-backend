// src/modules/user/domain/events/skill-added.event.ts
//
// Raised when a skill is added to a user.

import { DomainEvent } from '@common/abstracts/domain-event';

export class SkillAddedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly skillId: string,
    public readonly skillName: string,
  ) {
    super(aggregateId);
  }
}
