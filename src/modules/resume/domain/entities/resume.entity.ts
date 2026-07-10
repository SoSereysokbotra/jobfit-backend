// src/modules/resume/domain/entities/resume.entity.ts
//
// Resume aggregate root. A user may have many resumes; one may be flagged default.
// Parsing (ATS/quality scoring) runs off-thread later (Phase 5C) and updates parsingStatus.

import { AggregateRoot } from '@common/abstracts/aggregate-root';

export type ResumeFileType = 'PDF' | 'DOCX';
export type ResumeParsingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED';

export interface ResumeProps {
  userId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: ResumeFileType;
  title?: string;
  isDefault?: boolean;
  parsingStatus?: ResumeParsingStatus;
  parsingError?: string;
  atsScore?: number;
  qualityScore?: number;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Resume extends AggregateRoot {
  userId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: ResumeFileType;
  title?: string;
  isDefault: boolean;
  parsingStatus: ResumeParsingStatus;
  parsingError?: string;
  atsScore?: number;
  qualityScore?: number;
  version: number;

  constructor(props: ResumeProps, id?: string) {
    super(props, id);

    if (!props.userId) throw new Error('userId is required');
    if (!props.fileName || props.fileName.trim().length === 0) {
      throw new Error('fileName is required');
    }
    if (!props.fileUrl || props.fileUrl.trim().length === 0) {
      throw new Error('fileUrl is required');
    }
    if (props.fileSize <= 0) throw new Error('fileSize must be positive');

    this.userId = props.userId;
    this.fileName = props.fileName;
    this.fileUrl = props.fileUrl;
    this.fileSize = props.fileSize;
    this.fileType = props.fileType;
    this.title = props.title;
    this.isDefault = props.isDefault ?? false;
    this.parsingStatus = props.parsingStatus ?? 'PENDING';
    this.parsingError = props.parsingError;
    this.atsScore = props.atsScore;
    this.qualityScore = props.qualityScore;
    this.version = props.version ?? 1;
  }

  static create(props: ResumeProps): Resume {
    return new Resume(props);
  }

  /** Transition the parsing lifecycle; the error is only kept for FAILED. */
  updateParsingStatus(status: ResumeParsingStatus, error?: string): void {
    this.parsingStatus = status;
    this.parsingError = status === 'FAILED' ? error : undefined;
    this.updatedAt = new Date();
  }

  setAsDefault(): void {
    this.isDefault = true;
    this.updatedAt = new Date();
  }

  unsetDefault(): void {
    this.isDefault = false;
    this.updatedAt = new Date();
  }
}
