// src/modules/user/domain/entities/user-skill.entity.ts
//
// Join entity between a User and a Skill (from the shared kernel). `skillId` is the FK to
// the Skill; the Skill itself is loaded separately, so it is not referenced here.
// `proficiencyLevel` is a plain string (BEGINNER | INTERMEDIATE | ADVANCED | EXPERT),
// intentionally not an enum.

import { Entity } from '@common/abstracts/entity';

export type ProficiencyLevel =
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'EXPERT';

export interface UserSkillProps {
  userId: string;
  skillId: string;
  endorsementCount?: number;
  proficiencyLevel?: string;
  yearsOfExperience?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UserSkill extends Entity {
  userId: string;
  skillId: string;
  endorsementCount: number;
  proficiencyLevel: string;
  yearsOfExperience?: number;

  constructor(props: UserSkillProps, id?: string) {
    super(props, id);

    if (!props.userId) throw new Error('userId is required');
    if (!props.skillId) throw new Error('skillId is required');
    if (props.yearsOfExperience !== undefined && props.yearsOfExperience < 0) {
      throw new Error('yearsOfExperience cannot be negative');
    }

    this.userId = props.userId;
    this.skillId = props.skillId;
    this.endorsementCount = props.endorsementCount ?? 0;
    this.proficiencyLevel = props.proficiencyLevel ?? 'INTERMEDIATE';
    this.yearsOfExperience = props.yearsOfExperience;
  }

  static create(props: UserSkillProps): UserSkill {
    return new UserSkill(props);
  }

  /** Add one endorsement to this skill. */
  endorse(): void {
    this.endorsementCount += 1;
    this.updatedAt = new Date();
  }
}
