// src/modules/user/application/dtos/update-education.dto.ts
//
// Partial update of an Education record. Dates use @IsDate + @Type(() => Date) so the
// service receives real Date objects (its invariants compare Dates).

import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DegreeLevel } from '@shared/kernel/enums/degree-level.enum';

export class UpdateEducationDto {
  @ApiProperty({
    description:
      'The `updatedAt` you last saw for this record. A stale value is refused with 409 ' +
      'and both versions are returned rather than overwriting a newer server change.',
    example: '2026-08-10T09:00:00.000Z',
  })
  @IsISO8601()
  expectedUpdatedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional({ enum: DegreeLevel })
  @IsOptional()
  @IsEnum(DegreeLevel)
  degreeLevel?: DegreeLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fieldOfStudy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  gpa?: number;
}
