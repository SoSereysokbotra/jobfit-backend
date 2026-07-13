// src/modules/employer/application/dtos/pipeline-action-response.dto.ts
//
// Small acknowledgement payloads for pipeline mutations.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';

export class ApplicationStatusUpdatedDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ApplicationStatus }) status: ApplicationStatus;
  @ApiProperty({ enum: ApplicationStatus }) previousStatus: ApplicationStatus;

  constructor(
    id: string,
    status: ApplicationStatus,
    previousStatus: ApplicationStatus,
  ) {
    this.id = id;
    this.status = status;
    this.previousStatus = previousStatus;
  }
}

export class ApplicationNotesUpdatedDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) employerNotes:
    string | null;

  constructor(id: string, employerNotes: string | null) {
    this.id = id;
    this.employerNotes = employerNotes;
  }
}
