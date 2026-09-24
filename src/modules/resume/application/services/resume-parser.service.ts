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
import { OcrService, type RawImage } from './ocr.service';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { StorageService } from '@infra/storage/storage.service';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { ResumeParsedEvent } from '../../domain/events/resume-parsed.event';
import { AiClient } from '@infra/ai/ai.client';
import { aiFailuresAreLoud } from '@infra/ai/ai-degradation.logger';
import { AiServiceError } from '@infra/ai/ai.errors';
import { FileType, ParseResumeResponse } from '@infra/ai/ai.types';
import { PositionedTextItem, toReadingOrder } from './pdf-reading-order';
import { splitSkillEntry } from '@modules/matching/domain/parsed-resume-json';

// pdf.js v3's CommonJS legacy build. Required lazily (and typed loosely) because it is a
// large browser-oriented bundle with no first-class CJS types; only getDocument is used.
interface PdfJsModule {
  getDocument(src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PdfDocument> };
  /** Operator ids. Only paintImageXObject is read — see ocrPdfPages. */
  OPS: { paintImageXObject: number };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: PositionedTextItem[] }>;
    /** Drawing operations for the page; how an embedded image is located. */
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    /** Resolved page objects, keyed by the name the operator list gives. */
    objs: { get(name: string, cb: (obj: RawImage) => void): void };
  }>;
  destroy(): Promise<void>;
}

// experiences/educations are JSON-serialized into a single column. Rows written before
// the heuristic fallback was removed may still hold raw section lines (strings), so the
// type stays loose for backward compatibility with existing data.
/**
 * One skill per entry, deduplicated, or undefined when there are none.
 *
 * Dedupe is case-insensitive and keeps the first spelling: a CV listing "Python" both in
 * a labelled line and on its own would otherwise store it twice, which reads downstream
 * as more evidence than there is.
 */
function normaliseSkills(skills: string[]): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of skills.flatMap(splitSkillEntry)) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

interface ParsedData {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experiences?: unknown[];
  educations?: unknown[];
  projects?: unknown[];
  skills?: string[];
  promptVersion?: string;
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
    private readonly ocr: OcrService,
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
      const ai = await this.aiClient.parseResume(
        text,
        // No longer a blind cast: FileType carries IMAGE too, so a new résumé kind
        // fails to compile here rather than 422-ing at the AI boundary at runtime.
        fileType as FileType,
      );
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
        projects: parsed.projects && JSON.stringify(parsed.projects),
        skills: parsed.skills && JSON.stringify(parsed.skills),
        rawText: text,
        parsedBy: 'ai',
        promptVersion: parsed.promptVersion,
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
      // Already at error level — a FAILED parse is a dead end for that user until they
      // re-upload, in every environment. What dev adds is naming the cause, but ONLY
      // when the AI actually is the cause: this path also fails on storage and PDF
      // extraction, and blaming the AI for those would send someone to restart the wrong
      // process.
      const blameTheAi = err instanceof AiServiceError && aiFailuresAreLoud();
      this.logger.error(
        `Resume parse failed for ${resumeId}: ${message}` +
          (blameTheAi
            ? ' — the AI service did not answer. If it is not running, THIS IS WHY, and no résumé will parse.'
            : ''),
      );
      await this.parsedResumeDataRepository.updateParsingStatus(
        resumeId,
        'FAILED',
        message,
      );
    }
  }

  /**
   * Shortest length that counts as a real text layer.
   *
   * A scanned PDF is not always empty: a phone's "scan" often stamps a few characters of
   * metadata, and a cover page may carry a stray label. Testing for `=== ''` therefore
   * misses the common case. Forty characters is comfortably below any real résumé and
   * comfortably above that noise.
   */
  private static readonly MIN_TEXT_LAYER_CHARS = 40;

  private async extractText(buffer: Buffer, fileType: string): Promise<string> {
    if (fileType === 'PDF') {
      const text = await this.extractPdfText(buffer);
      if (text.trim().length >= ResumeParserService.MIN_TEXT_LAYER_CHARS) {
        return text;
      }
      // No usable text layer: this is a photograph wrapped in a PDF, which is how a
      // phone "scans" a document. It used to reach the AI with an empty string and fail
      // with a message that blamed the AI service.
      this.logger.log(
        'PDF carries no usable text layer — falling back to OCR on the page images',
      );
      const ocr = await this.ocrPdfPages(buffer);
      if (ocr.trim().length >= ResumeParserService.MIN_TEXT_LAYER_CHARS) return ocr;
      throw new Error(
        'This PDF contains no readable text. If it is a scan or a photo, try a ' +
          'clearer image, or upload the original Word or PDF file.',
      );
    }
    if (fileType === 'DOCX') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    if (fileType === 'IMAGE') {
      const text = await this.ocr.readImage(buffer);
      if (text.trim().length >= ResumeParserService.MIN_TEXT_LAYER_CHARS) return text;
      throw new Error(
        'No readable text was found in this image. Try a sharper photo taken ' +
          'straight on, in good light.',
      );
    }
    throw new Error(`Unsupported file type for parsing: ${fileType}`);
  }

  /**
   * OCR every page image of a PDF that has no text layer.
   *
   * Reads the page's embedded image objects rather than RENDERING the page. Rendering
   * would need a canvas implementation — a native dependency in the deploy — to redraw
   * pixels that are already sitting in the file. A scanned page is one full-page image,
   * which is exactly what this finds.
   *
   * Capped at MAX_OCR_PAGES: OCR costs seconds per page, and a résumé that runs past
   * three pages is not one the first three pages fail to describe.
   */
  private async ocrPdfPages(buffer: Buffer): Promise<string> {
    const MAX_OCR_PAGES = 3;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfJsModule;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    try {
      const out: string[] = [];
      const pageCount = Math.min(doc.numPages, MAX_OCR_PAGES);
      for (let n = 1; n <= pageCount; n++) {
        const page = await doc.getPage(n);
        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const name = ops.argsArray[i][0] as string;
          const img = await new Promise<RawImage | null>((resolve) => {
            try {
              page.objs.get(name, (o: RawImage) => resolve(o));
            } catch {
              // An image the worker never resolved. Skip it rather than fail the page.
              resolve(null);
            }
          });
          if (!img?.data || !img.width || !img.height) continue;
          out.push(await this.ocr.readRawImage(img));
        }
      }
      return out.filter(Boolean).join('\n');
    } finally {
      await doc.destroy();
    }
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
      // Optional on the wire so an older AI service (no `projects`) still works.
      projects: ai.projects?.length ? ai.projects : undefined,
      // Split before storing. Résumés group skills on one line behind a label, and the
      // model returns "Languages: C++, Python, TypeScript" as a SINGLE skill roughly half
      // the time — three real skills that then evidence nothing, because no employer
      // writes that string. Measured across two prompt versions; see splitSkillEntry for
      // why the fix is here and not in the prompt.
      skills: normaliseSkills(ai.skills),
      promptVersion: ai.promptVersion,
    };
  }

}
