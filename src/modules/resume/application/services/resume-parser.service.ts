// src/modules/resume/application/services/resume-parser.service.ts
//
// Downloads a resume file, extracts plain text (PDF via pdf-parse, DOCX via mammoth), pulls
// out best-effort structured fields, persists ParsedResumeData, flips the Resume to SUCCESS,
// and emits ResumeParsedEvent. All failures are caught and recorded as FAILED.

import { Injectable, Logger } from '@nestjs/common';
import pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { StorageService } from '@infra/storage/storage.service';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { ResumeParsedEvent } from '../../domain/events/resume-parsed.event';
import { VALIDATION } from '@common/constants/validation';

interface ParsedData {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experiences?: string[];
  educations?: string[];
  skills?: string[];
}

// Lines that start a new resume section (used to bound section bodies).
const SECTION_HEADER =
  /^(work experience|experience|employment|education|skills|projects|certifications|summary|objective|contact|awards)\b/i;

@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly parsedResumeDataRepository: ParsedResumeDataRepository,
    private readonly storage: StorageService,
    private readonly eventBus: DomainEventBus,
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
      const parsed = this.extractStructuredData(text);

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
      const data = await pdfParse(buffer);
      return data.text;
    }
    if (fileType === 'DOCX') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    throw new Error(`Unsupported file type for parsing: ${fileType}`);
  }

  private extractStructuredData(text: string): ParsedData {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return {
      fullName: this.extractName(lines),
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      location: this.extractLocation(text),
      summary: this.sectionBody(lines, /^(summary|objective)\b/i).join(' ') || undefined,
      experiences: this.orUndefined(
        this.sectionBody(lines, /^(work experience|experience|employment)\b/i),
      ),
      educations: this.orUndefined(this.sectionBody(lines, /^education\b/i)),
      skills: this.orUndefined(this.extractSkills(lines)),
    };
  }

  private extractName(lines: string[]): string | undefined {
    // First line that looks like "Firstname Lastname" (2–4 alpha words, no digits/@).
    return lines.find(
      (l) =>
        /^[A-Za-z][A-Za-z.'-]+(\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(l) &&
        !l.includes('@'),
    );
  }

  private extractEmail(text: string): string | undefined {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m?.[0];
  }

  private extractPhone(text: string): string | undefined {
    const m = text.match(/\+?\d[\d\s().-]{7,}\d/);
    if (!m) return undefined;
    const cleaned = m[0].replace(/[\s().-]/g, '');
    return VALIDATION.PHONE_REGEX.test(cleaned) ? cleaned : undefined;
  }

  private extractLocation(text: string): string | undefined {
    // Rough "City, ST" / "City, Country" pattern.
    const m = text.match(/[A-Z][a-zA-Z]+,\s*[A-Z][a-zA-Z]{1,}/);
    return m?.[0];
  }

  private extractSkills(lines: string[]): string[] {
    const body = this.sectionBody(lines, /^skills\b/i);
    return body
      .join(',')
      .split(/[,;•|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /** Lines between a section header and the next known section header. */
  private sectionBody(lines: string[], startRe: RegExp): string[] {
    const start = lines.findIndex((l) => startRe.test(l));
    if (start === -1) return [];
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (SECTION_HEADER.test(lines[i])) break;
      body.push(lines[i]);
    }
    return body;
  }

  private orUndefined(arr: string[]): string[] | undefined {
    return arr.length > 0 ? arr : undefined;
  }
}
