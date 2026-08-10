// src/modules/sync/dto/sync-query.dto.ts
//
// Query contract for every /sync/* delta route. Follows the codebase's existing query-DTO
// style (class-validator + @ApiPropertyOptional + @Type coercion, as in SearchJobQueryDto).

import { IsOptional, IsISO8601, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_SYNC_LIMIT, MAX_SYNC_LIMIT } from '../delta';

export class SyncQueryDto {
  @ApiPropertyOptional({
    description:
      'Return only rows changed strictly after this instant. Omit for a full sync ' +
      '(first load). Pass back the `serverTime` from your previous sync — not your own ' +
      'clock, which may be skewed relative to the server.',
    example: '2026-08-10T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({
    description:
      'Opaque cursor from the previous page’s `nextCursor`. Treat it as a token: do not ' +
      'parse or construct it. An unrecognised cursor is ignored rather than rejected.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: `Maximum rows per page (upserts + deletes combined). Max ${MAX_SYNC_LIMIT}.`,
    default: DEFAULT_SYNC_LIMIT,
    minimum: 1,
    maximum: MAX_SYNC_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_LIMIT)
  limit?: number = DEFAULT_SYNC_LIMIT;
}
