// src/modules/resume/application/services/resume-parser.service.ts
//
// Downloads a resume file, extracts plain text (PDF via pdf.js in reading order, DOCX via
// mammoth), structures it via the AI service, persists ParsedResumeData, flips the Resume to
// SUCCESS, and emits ResumeParsedEvent. All failures are caught and recorded as FAILED.
//
// NO FALLBACK: structuring is AI-only. If the AI service fails, the parse FAILS — it does
// not silently degrade to a regex approximation. A quiet fallback hides AI outages and
// writes low-fidelity data that is indistinguishable downstream from a real parse.

import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { StorageService } from '@infra/storage/storage.service';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { ResumeParsedEvent } from '../../domain/events/resume-parsed.event';
import { AiClient } from '@infra/ai/ai.client';
import { FileType, ParseResumeResponse } from '@infra/ai/ai.types';
import { PositionedTextItem, toReadingOrder } from './pdf-reading-order';

// pdf.js v3's CommonJS legacy build. Required lazily (and typed loosely) because it is a
// large browser-oriented bundle with no first-class CJS types; only getDocument is used.
interface PdfJsModule {
  getDocument(src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PdfDocument> };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: PositionedTextItem[] }>;
  }>;
  destroy(): Promise<void>;
}

// experiences/educations are JSON-serialized into a single column. Rows written before
// the heuristic fallback was removed may still hold raw section lines (strings), so the
// type stays loose for backward compatibility with existing data.
interface ParsedData {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experiences?: unknown[];
  educations?: unknown[];
  skills?: string[];
}

@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly parsedResumeDataRepository: ParsedResumeDataRepository,
    private readonly storage: StorageService,
    private readonly eventBus: DomainEventBus,
    private readonly aiClient: AiClient,
  ) {}

  async parseResume(
    resumeId: string,
    _fileUrl: string,
    fileType: string,
  ): Promise<void> {
    try {
      const resume = await this.resumeRepository.findById(resumeId);
      if (!resume) {
        this.logger.warn(`Resume ${resumeId} not found; skipping parse`);
        return;
      }

      await this.parsedResumeDataRepository.updateParsingStatus(
        resumeId,
        'PROCESSING',
      );

      // Storage path is deterministic (see ResumeService.storagePath).
      const path = `${resume.userId}/${resume.id}/${resume.fileName}`;
      const buffer = await this.storage.download('resumes', path);

      const text = await this.extractText(buffer, fileType);
      // AI-only: an AiServiceError propagates to the catch below and fails the job.
      const ai = await this.aiClient.parseResume(text, fileType as FileType);
      const parsed = this.fromAiResponse(ai);

      await this.parsedResumeDataRepository.save({
        resumeId,
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        summary: parsed.summary,
        experiences: parsed.experiences && JSON.stringify(parsed.experiences),
        educations: parsed.educations && JSON.stringify(parsed.educations),
        skills: parsed.skills && JSON.stringify(parsed.skills),
        rawText: text,
        parsedBy: 'ai',
      });

      await this.parsedResumeDataRepository.updateParsingStatus(
        resumeId,
        'SUCCESS',
      );
      await this.eventBus.publish(
        new ResumeParsedEvent(resumeId, parsed.fullName, parsed.email),
      );
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Resume parse failed for ${resumeId}: ${message}`);
      await this.parsedResumeDataRepository.updateParsingStatus(
        resumeId,
        'FAILED',
        message,
      );
    }
  }

  private async extractText(buffer: Buffer, fileType: string): Promise<string> {
    if (fileType === 'PDF') {
      return this.extractPdfText(buffer);
    }
    if (fileType === 'DOCX') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    throw new Error(`Unsupported file type for parsing: ${fileType}`);
  }

  /**
   * Extract PDF text in reading order (see pdf-reading-order.ts for why that is not
   * what a plain text dump gives you).
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfJsModule;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      // Resumes are untrusted input; never let embedded content evaluate.
      isEvalSupported: false,
    }).promise;

    try {
      const pages: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push(toReadingOrder(content.items));
      }
      return pages.join('\n');
    } finally {
      await doc.destroy();
    }
  }

  /** Map the AI service's parse response onto the persisted ParsedData shape. */
  private fromAiResponse(ai: ParseResumeResponse): ParsedData {
    return {
      fullName: ai.fullName ?? undefined,
      email: ai.email ?? undefined,
      phone: ai.phone ?? undefined,
      location: ai.location ?? undefined,
      summary: ai.summary ?? undefined,
      experiences: ai.experiences.length > 0 ? ai.experiences : undefined,
      educations: ai.educations.length > 0 ? ai.educations : undefined,
      skills: ai.skills.length > 0 ? ai.skills : undefined,
    };
  }

}
