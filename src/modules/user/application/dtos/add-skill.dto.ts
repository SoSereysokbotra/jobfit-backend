// src/modules/user/application/dtos/add-skill.dto.ts

import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PROFICIENCY_LEVELS = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT',
] as const;

export class AddSkillDto {
  @ApiProperty({ description: 'Skill id (FK to the shared Skill catalogue).' })
  @IsNotEmpty()
  @IsString()
  skillId: string;

  @ApiPropertyOptional({
    enum: PROFICIENCY_LEVELS,
    default: 'INTERMEDIATE',
  })
  @IsOptional()
  @IsIn(PROFICIENCY_LEVELS)
  proficiencyLevel?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;
}
