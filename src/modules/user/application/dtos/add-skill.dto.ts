// src/modules/user/application/dtos/add-skill.dto.ts

import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddSkillDto {
  @ApiProperty({ description: 'Skill id (FK to the shared Skill catalogue).' })
  @IsNotEmpty()
  @IsString()
  skillId: string;

  @ApiPropertyOptional({
    description: 'BEGINNER | INTERMEDIATE | ADVANCED | EXPERT',
    default: 'INTERMEDIATE',
  })
  @IsOptional()
  @IsString()
  proficiencyLevel?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsOfExperience?: number;
}
