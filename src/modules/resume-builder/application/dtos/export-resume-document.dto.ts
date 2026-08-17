// src/modules/resume-builder/application/dtos/export-resume-document.dto.ts
//
// MVP is PDF-ONLY (decision 6). "docx" is rejected AT VALIDATION rather than
// accepted-then-501: an API should not advertise a format it cannot produce, and a
// 501 arrives after the client has already committed to the request.
//
// DOCX is deferred, not cancelled — adding it means a second renderer and widening
// this enum. See docs/RESUME_BUILDER_KNOWN_GAPS.md (Phase 6).

import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const EXPORT_FORMATS = ['pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export class ExportResumeDocumentDto {
  @ApiPropertyOptional({
    enum: EXPORT_FORMATS,
    default: 'pdf',
    description:
      'Only "pdf" is supported for MVP. "docx" is rejected with a 400 — it is a ' +
      'deferred enhancement, not a supported value.',
  })
  @IsOptional()
  @IsIn(EXPORT_FORMATS as unknown as string[], {
    message: `format must be one of: ${EXPORT_FORMATS.join(', ')} (DOCX export is not available yet)`,
  })
  format?: ExportFormat = 'pdf';
}

export class ExportResumeDocumentResponseDto {
  /** The Resume row created by this export. */
  resumeId: string;
  /** Signed, time-limited URL — the `resumes` bucket is private. */
  downloadUrl: string;
  fileName: string;
  fileSize: number;
}
