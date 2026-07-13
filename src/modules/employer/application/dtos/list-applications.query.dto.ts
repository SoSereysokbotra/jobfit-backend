// src/modules/employer/application/dtos/list-applications.query.dto.ts
//
// Query params for GET /employer/applications (pipeline view).

import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to one job.', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip = 0;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 20;
}
