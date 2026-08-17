// src/modules/job-tracker/dtos/tracked-job.dtos.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { $Enums, TrackedJob } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const TRACKED_STAGES = [
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
] as const satisfies readonly $Enums.TrackedJobStage[];

/**
 * Add a card to the board.
 *
 * TWO WAYS IN, and exactly one of them per request:
 *  - `jobId` — a posting we already hold (an ingested bongthom/jobnet job, say). Title and
 *    company are copied FROM it, so the caller cannot mislabel one of our own postings.
 *  - `title` + `companyName` — anything else: saved from the extension, or typed in.
 *
 * The snapshot is stored either way. See the note on the TrackedJob model.
 */
export class CreateTrackedJobDto {
  @ApiPropertyOptional({ description: 'A posting we already hold. Omit for a manual entry.' })
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiPropertyOptional({ description: 'Required unless `jobId` is given.' })
  @ValidateIf((o: CreateTrackedJobDto) => !o.jobId)
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ description: 'Required unless `jobId` is given.' })
  @ValidateIf((o: CreateTrackedJobDto) => !o.jobId)
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Where the posting lives. Shown as the card link.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({
    enum: TRACKED_STAGES,
    description: 'Defaults to SAVED. Set APPLIED directly when adding a job already applied to.',
  })
  @IsOptional()
  @IsEnum(TRACKED_STAGES)
  stage?: $Enums.TrackedJobStage;
}

/** Edit a card's own fields. Stage is NOT here — moving is its own endpoint. */
export class UpdateTrackedJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ description: 'Yearly, in USD — the assumption the Job table already makes.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/**
 * Move a card — one drag.
 *
 * `position` is the index the card should occupy in the DESTINATION column, counting from
 * 0. Omitting it appends to the end, which is what "drop on an empty column" means.
 */
export class MoveTrackedJobDto {
  @ApiProperty({ enum: TRACKED_STAGES })
  @IsEnum(TRACKED_STAGES)
  stage: $Enums.TrackedJobStage;

  @ApiPropertyOptional({ description: 'Index in the destination column. Appends when omitted.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class TrackedJobResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) jobId: string | null;
  @ApiProperty() title: string;
  @ApiProperty() companyName: string;
  @ApiPropertyOptional({ type: String, nullable: true }) url: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) location: string | null;
  @ApiProperty({ enum: TRACKED_STAGES }) stage: $Enums.TrackedJobStage;
  @ApiProperty() position: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) minSalary: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxSalary: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) appliedAt: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) archivedAt: Date | null;
  @ApiProperty() createdAt: Date;

  constructor(row: TrackedJob) {
    this.id = row.id;
    this.jobId = row.jobId;
    this.title = row.title;
    this.companyName = row.companyName;
    this.url = row.url;
    this.location = row.location;
    this.stage = row.stage;
    this.position = row.position;
    this.minSalary = row.minSalary;
    this.maxSalary = row.maxSalary;
    this.notes = row.notes;
    this.appliedAt = row.appliedAt;
    this.archivedAt = row.archivedAt;
    this.createdAt = row.createdAt;
  }
}

/**
 * The whole board in one response, already grouped.
 *
 * Grouped server-side because the column order is a product decision, not a client one —
 * two clients bucketing a flat list independently is how they drift apart. An EMPTY stage
 * is still present with an empty array, so the UI renders all five columns without
 * knowing the vocabulary.
 */
export class TrackedBoardDto {
  @ApiProperty({
    description: 'Stage -> cards, in board order. Every stage is present, possibly empty.',
    example: { SAVED: [], APPLIED: [], INTERVIEW: [], OFFER: [], REJECTED: [] },
  })
  columns: Record<$Enums.TrackedJobStage, TrackedJobResponseDto[]>;

  @ApiProperty({ description: 'Cards on the board, excluding archived ones.' })
  total: number;
}
