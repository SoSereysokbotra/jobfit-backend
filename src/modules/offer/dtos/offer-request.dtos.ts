// src/modules/offer/dtos/offer-request.dtos.ts
//
// Request bodies for the offer endpoints. Employers create/edit offers; seekers
// negotiate with a note.

import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty({ description: 'Base annual salary in whole units.' })
  @IsInt()
  @Min(0)
  baseSalary: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  signingBonus?: number;

  @ApiPropertyOptional({ description: 'Target annual bonus as a % of base (0-100).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  annualBonusPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  equityShares?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  equityPrice?: number;

  @ApiPropertyOptional({ description: 'Proposed start date (ISO 8601).' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Deadline to respond (ISO 8601).' })
  @IsOptional()
  @IsISO8601()
  responseDeadline?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateOfferDto extends PartialType(CreateOfferDto) {}

export class NegotiateOfferDto {
  @ApiProperty({ description: 'What the candidate wants to negotiate.', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  notes: string;
}
