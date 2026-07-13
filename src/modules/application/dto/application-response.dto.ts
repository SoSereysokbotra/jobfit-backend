import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Application } from '../domain/entities/application.entity';
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
    this.appliedAt = application.appliedAt;
    this.notes = application.notes;
    this.coverLetter = application.coverLetter;
    this.createdAt = application.createdAt;
    this.updatedAt = application.updatedAt;
  }
}
