// src/modules/admin/application/dtos/metrics-query.dto.ts
//
// Query params for GET /admin/system/metrics — the dashboard time window.

import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type MetricsPeriod = '1h' | '24h' | '7d';

export const METRICS_PERIODS: MetricsPeriod[] = ['1h', '24h', '7d'];

export class MetricsQueryDto {
  @ApiPropertyOptional({
    enum: METRICS_PERIODS,
    default: '24h',
    description: 'Aggregation window for the metrics.',
  })
  @IsOptional()
  @IsIn(METRICS_PERIODS)
  period: MetricsPeriod = '24h';
}
