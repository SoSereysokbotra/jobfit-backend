// src/modules/employer/application/dtos/resume-download.dto.ts
//
// A short-lived link to one candidate's submitted CV.
//
// MENTOR_REVIEW_2026-08-18 §9: the employer pipeline exposed a name, an email and a
// screening number, and no way to read the actual document — "an AI screening layer with
// the human review step removed". This is the document.

import { ApiProperty } from '@nestjs/swagger';

export class ResumeDownloadDto {
  @ApiProperty({
    description:
      'Signed, time-limited link to the file in private storage. Fetch it and follow it ' +
      'promptly — it is minted per request and expires; do not cache or share it.',
  })
  url: string;

  @ApiProperty({ description: 'When the link stops working (ISO 8601).' })
  expiresAt: string;

  @ApiProperty({ description: 'Suggested filename, as the candidate named it.' })
  fileName: string;

  @ApiProperty({ description: 'PDF | DOCX' })
  fileType: string;

  constructor(row: {
    url: string;
    expiresAt: Date;
    fileName: string;
    fileType: string;
  }) {
    this.url = row.url;
    this.expiresAt = row.expiresAt.toISOString();
    this.fileName = row.fileName;
    this.fileType = row.fileType;
  }
}
