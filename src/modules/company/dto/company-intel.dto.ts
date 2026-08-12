// src/modules/company/dto/company-intel.dto.ts
//
// `GET /companies/by-name` — company intelligence for the browser extension's
// company sidebar. Shape mirrors the extension's `CompanyIntel` type.
//
// NOTE: the Company table has no `fundingStage`, salary aggregate, or per-user
// match data, so `fundingStage`/`salaryRange` are null and `topMatches` is empty
// for now; `hiringVelocity` is derived from the count of open (PUBLISHED) roles.
// The extension renders every field conditionally, so nulls degrade gracefully.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CompanyByNameQueryDto {
  @ApiProperty({ description: 'Company display name from the source page' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

export type HiringVelocity = 'LOW' | 'MEDIUM' | 'HIGH';

export class CompanyMatchDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ description: '0–100 match score' })
  score!: number;
}

export class CompanyIntelDto {
  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  glassdoorRating!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Not tracked yet' })
  fundingStage!: string | null;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'], nullable: true })
  hiringVelocity!: HiringVelocity | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  openRoles!: number | null;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'No salary aggregate yet' })
  salaryRange!: null;

  @ApiProperty({ type: [CompanyMatchDto], description: 'Empty until per-user matches are joined' })
  topMatches!: CompanyMatchDto[];
}
