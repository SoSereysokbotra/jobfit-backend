// src/modules/resume/infrastructure/repositories/parsed-resume-data.repository.ts
//
// Prisma-backed persistence for the ParsedResumeData row (1:1 with Resume, populated by the
// parsing worker in Phase 5C). Also owns the helper that transitions the Resume's parsing
// status, since the two are updated together.

import { Injectable } from '@nestjs/common';
import { $Enums, ParsedResumeData as PrismaParsedResumeData } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ResumeParsingStatus } from '../../domain/entities/resume.entity';

export interface ParsedResumeDataInput {
  resumeId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experiences?: string; // JSON string
  educations?: string; // JSON string
  skills?: string; // JSON string
  certifications?: string; // JSON string
  rawText?: string;
}

@Injectable()
export class ParsedResumeDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Insert or replace the parsed data for a resume (keyed by resumeId). */
  async save(data: ParsedResumeDataInput): Promise<void> {
    const fields = {
      fullName: data.fullName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      location: data.location ?? null,
      summary: data.summary ?? null,
      experiences: data.experiences ?? null,
      educations: data.educations ?? null,
      skills: data.skills ?? null,
      certifications: data.certifications ?? null,
      rawText: data.rawText ?? null,
    };
    await this.prisma.parsedResumeData.upsert({
      where: { resumeId: data.resumeId },
      update: fields,
      create: { resumeId: data.resumeId, ...fields },
    });
  }

  async findByResumeId(
    resumeId: string,
  ): Promise<PrismaParsedResumeData | null> {
    return this.prisma.parsedResumeData.findUnique({ where: { resumeId } });
  }

  /** Transition the parent Resume's parsing status (error kept only for FAILED). */
  async updateParsingStatus(
    resumeId: string,
    status: ResumeParsingStatus,
    error?: string,
  ): Promise<void> {
    await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        parsingStatus: status as $Enums.ResumeParsingStatus,
        parsingError: status === 'FAILED' ? (error ?? null) : null,
      },
    });
  }
}
