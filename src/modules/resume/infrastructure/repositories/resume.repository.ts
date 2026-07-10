// src/modules/resume/infrastructure/repositories/resume.repository.ts
//
// Prisma-backed persistence for the Resume aggregate. Soft delete via deletedAt. The
// parsingStatus enum is cast at the boundary between the domain union type and Prisma's
// generated enum.

import { Injectable } from '@nestjs/common';
import { $Enums, Resume as PrismaResume } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { IRepository } from '@common/abstracts/repository';
import {
  Resume,
  ResumeFileType,
  ResumeParsingStatus,
} from '../../domain/entities/resume.entity';

@Injectable()
export class ResumeRepository implements IRepository<Resume> {
  constructor(private readonly prisma: PrismaService) {}

  async save(resume: Resume): Promise<void> {
    const fields = {
      fileName: resume.fileName,
      fileUrl: resume.fileUrl,
      fileSize: resume.fileSize,
      fileType: resume.fileType,
      title: resume.title ?? null,
      isDefault: resume.isDefault,
      parsingStatus: resume.parsingStatus as $Enums.ResumeParsingStatus,
      parsingError: resume.parsingError ?? null,
      atsScore: resume.atsScore ?? null,
      qualityScore: resume.qualityScore ?? null,
      version: resume.version,
      updatedAt: resume.updatedAt,
    };
    await this.prisma.resume.upsert({
      where: { id: resume.id },
      update: fields,
      create: {
        id: resume.id,
        userId: resume.userId,
        createdAt: resume.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<Resume | null> {
    const row = await this.prisma.resume.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** All non-deleted resumes for a user, newest first. */
  async findByUserId(userId: string): Promise<Resume[]> {
    const rows = await this.prisma.resume.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  /** The user's default resume, or null if none is flagged. */
  async findDefaultByUserId(userId: string): Promise<Resume | null> {
    const row = await this.prisma.resume.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.resume.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapToDomain(raw: PrismaResume): Resume {
    return new Resume(
      {
        userId: raw.userId,
        fileName: raw.fileName,
        fileUrl: raw.fileUrl,
        fileSize: raw.fileSize,
        fileType: raw.fileType as ResumeFileType,
        title: raw.title ?? undefined,
        isDefault: raw.isDefault,
        parsingStatus: raw.parsingStatus as ResumeParsingStatus,
        parsingError: raw.parsingError ?? undefined,
        atsScore: raw.atsScore ?? undefined,
        qualityScore: raw.qualityScore ?? undefined,
        version: raw.version,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
