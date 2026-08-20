// src/modules/saved-job/dto/save-external-job.dto.ts
//
// The browser extension's "Save Job" form. The global ValidationPipe runs with
// `forbidNonWhitelisted: true`, so every field the extension sends must be declared here
// or the whole request 400s with a message the user never sees.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Matches the extension's capture cap; a whole posting is comfortably under it. */
const MAX_DESCRIPTION = 20000;

export class SaveExternalJobDto {
  @ApiProperty({ description: "The source's job id, read from the page URL" })
  @IsString()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @MaxLength(32)
  source!: string;

  @ApiProperty({ description: 'Job title — required, as on the form' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The posting text the user chose to save. Their own bookmark, not a feed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Where to go back to' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Free text on purpose — postings write "$70k–90k", "1,200 USD/month", "negotiable".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  salary?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class SavedExternalJobDto {
  @ApiProperty() id!: string;
  @ApiProperty() source!: string;
  @ApiProperty() externalId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) company!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) salary!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() savedAt!: string;
}
