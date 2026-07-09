// src/modules/user/application/dtos/skill-response.dto.ts
//
// API response projection of a UserSkill entity.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSkill } from '../../domain/entities/user-skill.entity';

export class SkillResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  skillId: string;

  @ApiProperty()
  endorsementCount: number;

  @ApiProperty({ example: 'INTERMEDIATE' })
  proficiencyLevel: string;

  @ApiPropertyOptional()
  yearsOfExperience?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(skill: UserSkill) {
    this.id = skill.id;
    this.userId = skill.userId;
    this.skillId = skill.skillId;
    this.endorsementCount = skill.endorsementCount;
    this.proficiencyLevel = skill.proficiencyLevel;
    this.yearsOfExperience = skill.yearsOfExperience;
    this.createdAt = skill.createdAt;
    this.updatedAt = skill.updatedAt;
  }
}
