// src/modules/admin/application/dtos/search-users.dto.ts
//
// Query params for GET /admin/users (Feature 2 — User Management search).
// Supports search by email, name and signup date range, with pagination.

import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchUsersDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive email substring match.',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive name substring match.',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Signup date lower bound (ISO 8601), inclusive.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  signupFrom?: string;

  @ApiPropertyOptional({
    description: 'Signup date upper bound (ISO 8601), inclusive.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  signupTo?: string;

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
