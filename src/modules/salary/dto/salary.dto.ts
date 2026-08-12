// src/modules/salary/dto/salary.dto.ts
//
// `GET /salary?company=&role=` — salary intelligence for the extension panel.
// Shape mirrors the extension's `SalaryIntel` type. Percentiles are derived from
// PUBLISHED job postings at the company (role-filtered, with a company-wide
// fallback); there is no dedicated salary table yet, so `listed` is null and
// `totalCompAvg` is the mean of posting midpoints (no equity/bonus source).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SalaryQueryDto {
  @ApiProperty({ description: 'Company display name from the source page' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company!: string;

  @ApiPropertyOptional({ description: 'Role / job title to scope the market data' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string;
}

export type FitPercentile = 'P25' | 'P50' | 'P75';

export class SalaryMarketDto {
  @ApiProperty() p25!: number;
  @ApiProperty() p50!: number;
  @ApiProperty() p75!: number;
  @ApiProperty() totalCompAvg!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'Number of postings the estimate is based on' })
  dataPoints!: number;
}

export class SalaryIntelDto {
  @ApiProperty() company!: string;
  @ApiProperty() role!: string;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'A specific listed range — null here' })
  listed!: { min: number; max: number; currency: string } | null;

  @ApiProperty({ type: SalaryMarketDto })
  market!: SalaryMarketDto;

  @ApiProperty({ enum: ['P25', 'P50', 'P75'] })
  fitPercentile!: FitPercentile;

  @ApiProperty() tip!: string;
}
