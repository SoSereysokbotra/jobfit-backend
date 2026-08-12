// src/modules/resume-builder/application/dtos/resume-document.dto.ts
//
// Request DTOs for document create/update. The résumé header (fullName, email,
// phone, location, links) is NOT accepted on create — it is snapshotted from the
// user's profile server-side — but IS editable via PATCH, because after creation
// those fields belong to the document.

import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ResumeDocumentStatus,
  ResumeLineSpacing,
  ResumeMargin,
} from '@prisma/client';
import { COLOR_PRESETS } from './color-presets';

export class CreateResumeDocumentDto {
  @ApiProperty({ example: 'Frontend Engineer — Google' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description:
      'Id of an ACTIVE ResumeTemplate. Templates are ours — you select one, you ' +
      'never supply one. Unknown or inactive ids are rejected.',
  })
  @IsNotEmpty()
  @IsString()
  templateId: string;

  @ApiPropertyOptional({
    enum: COLOR_PRESETS,
    description: 'Preset key, not a hex value. Defaults to the first preset.',
  })
  @IsOptional()
  @IsIn(COLOR_PRESETS as unknown as string[])
  colorScheme?: string;

  @ApiPropertyOptional({ enum: ResumeLineSpacing, default: 'DEFAULT' })
  @IsOptional()
  @IsEnum(ResumeLineSpacing)
  lineSpacing?: ResumeLineSpacing;

  @ApiPropertyOptional({ enum: ResumeMargin, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(ResumeMargin)
  margin?: ResumeMargin;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontFamily?: string;
}

export class UpdateResumeDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Must be an ACTIVE template id.' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ enum: COLOR_PRESETS })
  @IsOptional()
  @IsIn(COLOR_PRESETS as unknown as string[])
  colorScheme?: string;

  @ApiPropertyOptional({ enum: ResumeLineSpacing })
  @IsOptional()
  @IsEnum(ResumeLineSpacing)
  lineSpacing?: ResumeLineSpacing;

  @ApiPropertyOptional({ enum: ResumeMargin })
  @IsOptional()
  @IsEnum(ResumeMargin)
  margin?: ResumeMargin;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ enum: ResumeDocumentStatus })
  @IsOptional()
  @IsEnum(ResumeDocumentStatus)
  status?: ResumeDocumentStatus;

  // ── Résumé header ──────────────────────────────────────────────────────────
  // Snapshotted at creation, owned by the document thereafter. Editing these
  // NEVER writes back to the user's Profile.
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedinUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() portfolioUrl?: string;
}
