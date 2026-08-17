// src/modules/resume-builder/application/services/resume-export.service.ts
//
// Renders a builder document to PDF, stores it, and turns it into a normal `Resume`
// row so the result flows into ATS scoring and the "select résumé when applying"
// picker with no special-casing downstream.
//
// ORDER OF OPERATIONS IS THE ERROR HANDLING. Rendering happens FIRST, before any
// upload or database write. If the renderer throws there is nothing to unwind — no
// orphaned file, no half-built Resume row, no broken link on the document. Only once
// we hold the bytes do we touch storage and the database.
//
// TWO THINGS THAT ARE EASY TO GET WRONG, both settled in Phase 0:
//
//   * NO RE-PARSE (decision 2). The upload flow enqueues a BullMQ 'resume-parsing'
//     job; export must not. The document is already structured, so running the PDF
//     we just generated back through the AI parser would cost a call, require Redis,
//     and can only degrade data we authored. We write ParsedResumeData ourselves —
//     INCLUDING rawText, because ResumeScorerService reads it for five sub-scores
//     and the AI scorer call. Structured fields alone score a well-formed résumé
//     near zero on ATS formatting.
//
//   * RE-EXPORT SUPERSEDES (decision A). If the document already points at a
//     Resume, that row is soft-deleted before the new one is created, so the user's
//     picker shows one current file per document. SOFT, never hard:
//     `Application.resume` is onDelete SetNull, so hard-deleting would silently
//     strip the résumé off applications they already submitted with it.

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@infra/prisma/prisma.service';
import { StorageService } from '@infra/storage/storage.service';

import { ResumeDocumentRepository } from '../../infrastructure/repositories/resume-document.repository';
import { ResumeDocumentService } from './resume-document.service';
import { ResumePdfRenderer } from './resume-pdf.renderer';
import { ExportResumeDocumentResponseDto } from '../dtos/export-resume-document.dto';

/** Same private bucket the upload flow uses. */
const BUCKET = 'resumes' as const;
const CONTENT_TYPE = 'application/pdf';

/**
 * Marks ParsedResumeData written by the builder rather than by the AI parser
 * ("ai") or the regex fallback ("heuristic"), so a row can be traced to its origin.
 */
const PARSED_BY = 'resume-builder';

@Injectable()
export class ResumeExportService {
  private readonly logger = new Logger(ResumeExportService.name);

  constructor(
    private readonly documents: ResumeDocumentService,
    private readonly repository: ResumeDocumentRepository,
    private readonly renderer: ResumePdfRenderer,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async export(
    documentId: string,
    userId: string,
  ): Promise<ExportResumeDocumentResponseDto> {
    // Ownership-scoped: a document the caller does not own is a 404 here, same as
    // everywhere else in this module.
    const document = await this.documents.get(documentId, userId);

    const template = await this.prisma.resumeTemplate.findUnique({
      where: { id: document.templateId },
      select: { layoutConfig: true },
    });

    // ── 1. Render first, so a failure leaves nothing behind ──────────────────
    let rendered;
    try {
      rendered = await this.renderer.render(document, template?.layoutConfig);
    } catch (error) {
      this.logger.error(
        `Resume render failed for document ${documentId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Could not render this résumé to PDF. Nothing was saved — please try again.',
      );
    }

    // ── 2. Upload ────────────────────────────────────────────────────────────
    // The id is minted up front because it is part of the storage path, matching
    // ResumeService.storagePath(userId, resumeId, fileName) so the file can be
    // located again for deletion.
    const resumeId = randomUUID();
    const fileName = `${slugify(document.title)}.pdf`;
    const path = `${userId}/${resumeId}/${fileName}`;

    await this.storage.upload(BUCKET, path, rendered.pdf, CONTENT_TYPE);

    // ── 3. Persist: supersede the old export, create the new Resume, link it ──
    await this.prisma.$transaction(async (tx) => {
      if (document.exportedResumeId) {
        // Soft delete — see the header note on Application.resume.
        await tx.resume.update({
          where: { id: document.exportedResumeId },
          data: { deletedAt: new Date() },
        });
      }

      await tx.resume.create({
        data: {
          id: resumeId,
          userId,
          fileName,
          // The bucket is private, so this is a storage pointer, not a fetchable
          // link. The caller gets a signed URL below.
          fileUrl: path,
          fileSize: rendered.pdf.length,
          fileType: 'PDF',
          title: document.title,
          // SUCCESS, and the parsed row written by hand — no parsing job.
          parsingStatus: 'SUCCESS',
          parsedData: {
            create: {
              fullName: document.fullName,
              email: document.email,
              phone: document.phone,
              location: document.location,
              summary: document.summary?.content ?? null,
              // These columns are JSON *strings*, not Json columns.
              experiences: JSON.stringify(
                document.experiences.map((e) => ({
                  company: e.company,
                  title: e.title,
                  location: e.location,
                  startDate: e.startDate,
                  endDate: e.endDate,
                  isCurrentJob: e.isCurrentJob,
                  description: e.description,
                  technologies: e.technologies,
                })),
              ),
              educations: JSON.stringify(
                document.educations.map((e) => ({
                  institution: e.institution,
                  degreeLevel: e.degreeLevel,
                  fieldOfStudy: e.fieldOfStudy,
                  startDate: e.startDate,
                  endDate: e.endDate,
                  gpa: e.gpa,
                })),
              ),
              skills: JSON.stringify(
                document.skills.map((s) => ({
                  name: s.name,
                  proficiencyLevel: s.proficiencyLevel,
                })),
              ),
              certifications: JSON.stringify(
                document.certifications.map((c) => ({
                  name: c.name,
                  issuer: c.issuer,
                  issueDate: c.issueDate,
                  expirationDate: c.expirationDate,
                })),
              ),
              // Null for MVP: there is no profile-side project data, and the parser
              // shape for this column is not yet contracted.
              projects: null,
              // The reason this renderer emits text at all — see its header.
              rawText: rendered.text,
              parsedBy: PARSED_BY,
            },
          },
        },
      });

      await tx.resumeDocument.update({
        where: { id: documentId },
        data: { exportedResumeId: resumeId },
      });
    });

    // ── 4. Signed URL ────────────────────────────────────────────────────────
    // NOT the value upload() returns — that is a public URL and this bucket is
    // private, so it would not resolve.
    const downloadUrl = await this.storage.getSignedUrl(BUCKET, path);

    return {
      resumeId,
      downloadUrl,
      fileName,
      fileSize: rendered.pdf.length,
    };
  }
}

/** "Frontend Engineer — Google" -> "frontend-engineer-google". */
function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'resume';
}
