// src/modules/sync/dto/batch.dto.ts
//
// Request/response contract for POST /sync/batch — the offline queue flush.

import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Actions the offline queue can replay. */
export enum BatchActionType {
  SAVE_JOB = 'SAVE_JOB',
  UNSAVE_JOB = 'UNSAVE_JOB',
  DISMISS_RECOMMENDATION = 'DISMISS_RECOMMENDATION',
  SUBMIT_APPLICATION = 'SUBMIT_APPLICATION',
  // Updates to existing records (PWA offline, Phase 4). These carry expectedUpdatedAt and
  // can come back with status "conflict".
  UPDATE_PROFILE = 'UPDATE_PROFILE',
  UPDATE_EXPERIENCE = 'UPDATE_EXPERIENCE',
  UPDATE_EDUCATION = 'UPDATE_EDUCATION',
}

/** The action types that update an existing record, and so require expectedUpdatedAt. */
export const UPDATE_ACTION_TYPES: ReadonlySet<BatchActionType> = new Set([
  BatchActionType.UPDATE_PROFILE,
  BatchActionType.UPDATE_EXPERIENCE,
  BatchActionType.UPDATE_EDUCATION,
]);

/**
 * One flush is capped. An unbounded batch is a denial-of-service vector (each action is a
 * write, processed sequentially) and a client with a runaway queue should be told to split
 * rather than hold a connection open for minutes.
 */
export const MAX_BATCH_ACTIONS = 50;

/**
 * Union of every action's payload. Declared as one class with optional fields rather than
 * a discriminated union because the global ValidationPipe runs with
 * `whitelist: true, forbidNonWhitelisted: true` — an untyped `payload` object would have
 * its contents stripped before the handler ever saw them. Per-type requirements
 * (e.g. SUBMIT_APPLICATION needs jobId) are enforced in BatchService.
 */
export class BatchActionPayloadDto {
  @ApiPropertyOptional({
    description: 'Target job. Required by SAVE_JOB, UNSAVE_JOB, DISMISS_RECOMMENDATION and SUBMIT_APPLICATION.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  jobId?: string;

  @ApiPropertyOptional({
    description:
      'Id of the record being updated. Required by UPDATE_EXPERIENCE and UPDATE_EDUCATION. ' +
      'UPDATE_PROFILE needs none — a user has exactly one profile.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @ApiPropertyOptional({
    description:
      'The `updatedAt` you last saw for this record. Required by every UPDATE_* action. ' +
      'A stale value comes back as status "conflict" with both versions attached.',
    example: '2026-08-10T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  @ApiPropertyOptional({
    description:
      'The fields to change. Validated against the target resource by the handler; ' +
      'unknown keys are rejected.',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  changes?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'SUBMIT_APPLICATION only.' })
  @IsOptional()
  @IsString()
  resumeId?: string;

  @ApiPropertyOptional({ description: 'SUBMIT_APPLICATION only.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverLetter?: string;

  @ApiPropertyOptional({ description: 'SUBMIT_APPLICATION only.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BatchActionDto {
  @ApiProperty({
    description:
      'Client-generated key, stable for the life of this queued action. Reuse it on ' +
      'every retry — that is what makes the replay safe. Generate a NEW one only for a ' +
      'genuinely new action.',
  })
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ enum: BatchActionType })
  @IsEnum(BatchActionType)
  type: BatchActionType;

  @ApiProperty({ type: BatchActionPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => BatchActionPayloadDto)
  payload: BatchActionPayloadDto;

  @ApiProperty({
    description:
      'When the user actually took this action offline — NOT when it is being flushed. ' +
      'Recorded for diagnostics; array order remains authoritative for execution order.',
    example: '2026-08-10T09:14:22.000Z',
  })
  @IsISO8601()
  clientTimestamp: string;
}

export class SyncBatchDto {
  @ApiProperty({
    type: [BatchActionDto],
    description: `Applied strictly in array order, sequentially. Max ${MAX_BATCH_ACTIONS}.`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH_ACTIONS)
  @ValidateNested({ each: true })
  @Type(() => BatchActionDto)
  actions: BatchActionDto[];
}

// ── Response ───────────────────────────────────────────────────────────────────

/** Machine-readable failure reasons, so clients branch on `code` and not on prose. */
export enum BatchErrorCode {
  /** The action's business rule refused it (e.g. already applied to this job). */
  CONFLICT = 'CONFLICT',
  /**
   * Optimistic-concurrency failure: the record moved on since the client last saw it.
   * Paired with status "conflict" and both versions. Not retryable until resolved.
   */
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  /** The key was previously used for a DIFFERENT action — a client bug, not a retry. */
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  /** Payload was missing something this action type requires. */
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  /** Referenced job/resume does not exist. */
  NOT_FOUND = 'NOT_FOUND',
  /** Anything else — the action may be retried. */
  FAILED = 'FAILED',
}

export class BatchResultDto {
  @ApiProperty() idempotencyKey: string;

  @ApiProperty({
    enum: ['success', 'error', 'conflict'],
    description:
      '`conflict` means the record changed server-side since the client last saw it. ' +
      'Nothing was written, and it is NOT retryable as-is — see serverVersion / ' +
      'clientAttempted.',
  })
  status: 'success' | 'error' | 'conflict';

  @ApiPropertyOptional({ description: 'Handler result. Present when status is success.' })
  data?: unknown;

  @ApiPropertyOptional({ description: 'Human-readable failure. Present when status is error.' })
  error?: string;

  @ApiPropertyOptional({
    enum: BatchErrorCode,
    description: 'Machine-readable failure reason. Branch on this, not on `error`.',
  })
  code?: BatchErrorCode;

  @ApiPropertyOptional({
    description:
      'True when this action was NOT re-executed — a stored result from a previous ' +
      'attempt was returned instead. The client can treat it exactly like a success.',
  })
  replayed?: boolean;

  @ApiPropertyOptional({
    description:
      'status "conflict" only — the record as the server currently holds it. Nothing was ' +
      'written. Show this beside `clientAttempted` and let the user choose; to retry, ' +
      'resend with this record’s `updatedAt` as `expectedUpdatedAt`.',
  })
  serverVersion?: unknown;

  @ApiPropertyOptional({
    description:
      'status "conflict" only — the update the client tried to apply, echoed back so the ' +
      'resolution UI can show it without having to still hold it in the offline queue.',
  })
  clientAttempted?: unknown;
}

export class SyncBatchResponseDto {
  @ApiProperty({
    type: [BatchResultDto],
    description:
      'One entry per submitted action, in the same order. A failed action does not stop ' +
      'the ones after it, so expect a mix.',
  })
  results: BatchResultDto[];
}
