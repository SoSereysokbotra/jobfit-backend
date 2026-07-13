// src/modules/employer/application/dtos/update-application-status.dto.ts
//
// Body for PATCH /employer/applications/:id/status. Moves a candidate through the pipeline.
// Reuses the shared ApplicationStatus enum (no separate pipeline enum).

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export class UpdateApplicationStatusDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  newStatus: ApplicationStatus;

  @ApiPropertyOptional({
    description: 'Optional note recorded with the transition.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
