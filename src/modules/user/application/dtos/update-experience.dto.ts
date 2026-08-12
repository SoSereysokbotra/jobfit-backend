// src/modules/user/application/dtos/update-experience.dto.ts
//
// Partial update — only company, title, jobLevel, description, endDate and technologies
// may be changed.

import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';

export class UpdateExperienceDto {
  @ApiProperty({
    description:
      'The `updatedAt` you last saw for this record. If the server has moved on since, ' +
      'the update is refused with 409 and both versions are returned rather than ' +
      'overwriting whatever another device wrote.',
    example: '2026-08-10T09:00:00.000Z',
  })
  @IsISO8601()
  expectedUpdatedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: JobLevel })
  @IsOptional()
  @IsEnum(JobLevel)
  jobLevel?: JobLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];
}
