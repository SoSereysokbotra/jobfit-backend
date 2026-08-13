// src/modules/resume-builder/application/dtos/resume-template.dto.ts
//
// Query + response contract for the read-only template catalogue.
//
// Templates are INTERNAL reference data we author and seed — there is no create,
// update, delete or upload route, and `layoutConfig` is never accepted from a
// client. This file is deliberately read-only shapes only.

import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResumeTemplate } from '@prisma/client';

/** Categories currently seeded. Kept open (plain string) so adding one needs no deploy. */
export const TEMPLATE_CATEGORIES = ['ats-friendly', 'modern', 'creative'] as const;

export class ListResumeTemplatesQueryDto {
  @ApiPropertyOptional({
    description: 'When true, return only templates marked ATS-friendly.',
    example: true,
  })
  @IsOptional()
  // Reads the RAW source value (`obj[key]`), not `value`.
  //
  // The global ValidationPipe runs with enableImplicitConversion, which coerces this
  // property using its `boolean` design type — and `Boolean('false')` is TRUE. By the
  // time a transform sees `value` the damage is done, so `?atsOnly=false` would
  // silently become an opt-IN. Reading obj[key] sidesteps that entirely.
  //
  // Anything unrecognised is passed through untouched so @IsBoolean rejects it with a
  // 400, rather than a typo quietly meaning "false".
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    if (raw === undefined || raw === '') return undefined;
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0') return false;
    return raw;
  })
  @IsBoolean({ message: 'atsOnly must be true or false' })
  atsOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by category, e.g. "ats-friendly" or "modern".',
    example: 'modern',
  })
  @IsOptional()
  @IsString()
  category?: string;
}

export class ResumeTemplateResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Classic ATS' }) name: string;
  @ApiProperty({ example: 'ats-friendly' }) category: string;

  @ApiPropertyOptional({
    description:
      'Root-relative path to a preview image, served by the FRONTEND from its ' +
      'public/ folder (this API serves no static assets). Currently a generated ' +
      'PLACEHOLDER, not a designed thumbnail.',
    example: '/templates/classic-ats.svg',
  })
  thumbnailUrl?: string;

  @ApiProperty({ example: true }) isAtsFriendly: boolean;

  @ApiProperty({
    description:
      'Section order and styling rules the PDF renderer reads. Exposed so a client ' +
      'can preview the section order; it is authored by us and is never writable.',
  })
  layoutConfig: unknown;

  constructor(row: ResumeTemplate) {
    this.id = row.id;
    this.name = row.name;
    this.category = row.category;
    this.thumbnailUrl = row.thumbnailUrl ?? undefined;
    this.isAtsFriendly = row.isAtsFriendly;
    this.layoutConfig = row.layoutConfig;
  }
}
