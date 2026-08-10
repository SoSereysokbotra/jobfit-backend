// src/modules/user/application/dtos/update-profile.dto.ts
//
// Partial update of the editable Profile fields (identity/basic info, location and
// social links). Work preferences and salary are updated via their own endpoints.

import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationDto } from './create-profile.dto';

export class UpdateProfileDto {
  @ApiProperty({
    description:
      'The `updatedAt` you last saw for this profile. A stale value is refused with 409 ' +
      'and both versions are returned rather than overwriting a newer server change.',
    example: '2026-08-10T09:00:00.000Z',
  })
  @IsISO8601()
  expectedUpdatedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  githubUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portfolioUrl?: string;
}
