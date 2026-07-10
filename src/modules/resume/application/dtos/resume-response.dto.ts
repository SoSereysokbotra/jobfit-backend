// src/modules/resume/application/dtos/resume-response.dto.ts
//
// API response projection of the Resume aggregate.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Resume,
  ResumeFileType,
  ResumeParsingStatus,
} from '../../domain/entities/resume.entity';

export class ResumeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  fileUrl: string;

  @ApiProperty()
  fileSize: number;

  @ApiProperty({ enum: ['PDF', 'DOCX'] })
  fileType: ResumeFileType;

  @ApiPropertyOptional()
  title?: string;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'] })
  parsingStatus: ResumeParsingStatus;

  @ApiPropertyOptional()
  parsingError?: string;

  @ApiPropertyOptional()
  atsScore?: number;

  @ApiPropertyOptional()
  qualityScore?: number;

  @ApiProperty()
  version: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(resume: Resume) {
    this.id = resume.id;
    this.userId = resume.userId;
    this.fileName = resume.fileName;
    this.fileUrl = resume.fileUrl;
    this.fileSize = resume.fileSize;
    this.fileType = resume.fileType;
    this.title = resume.title;
    this.isDefault = resume.isDefault;
    this.parsingStatus = resume.parsingStatus;
    this.parsingError = resume.parsingError;
    this.atsScore = resume.atsScore;
    this.qualityScore = resume.qualityScore;
    this.version = resume.version;
    this.createdAt = resume.createdAt;
    this.updatedAt = resume.updatedAt;
  }
}
