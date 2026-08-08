import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Application,
  candidateActionsFrom,
} from '../domain/entities/application.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export class ApplicationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  jobId: string;

  @ApiPropertyOptional()
  resumeId?: string;

  @ApiProperty({ enum: ApplicationStatus })
  status: ApplicationStatus;

  @ApiProperty()
  appliedAt: Date;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional()
  coverLetter?: string;

  @ApiProperty({
    enum: ApplicationStatus,
    isArray: true,
    description:
      'Statuses the CANDIDATE can move this application to right now — reachable from ' +
      'its current status AND theirs to decide. Clients must render only these. Listing ' +
      'every candidate-settable status regardless of stage produces a menu where each ' +
      'choice answers "Invalid status transition". An empty array is legitimate: an ' +
      'ARCHIVED application is finished.',
  })
  availableActions: ApplicationStatus[];

  @ApiProperty({
    description:
      'Whether YOU have hidden this from your own list. Purely a view preference — it ' +
      'says nothing about the application and is invisible to the employer, who has a ' +
      'separate flag of their own.',
  })
  archived: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(application: Application) {
    this.id = application.id;
    this.userId = application.userId;
    this.jobId = application.jobId;
    this.resumeId = application.resumeId;
    this.status = application.status;
    this.availableActions = candidateActionsFrom(application.status);
    this.archived = application.archivedByCandidateAt != null;
    this.appliedAt = application.appliedAt;
    this.notes = application.notes;
    this.coverLetter = application.coverLetter;
    this.createdAt = application.createdAt;
    this.updatedAt = application.updatedAt;
  }
}
