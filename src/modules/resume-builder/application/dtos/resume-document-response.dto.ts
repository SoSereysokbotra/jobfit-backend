// src/modules/resume-builder/application/dtos/resume-document-response.dto.ts
//
// API projection of a builder document. Two shapes:
//   ResumeDocumentSummaryDto — settings only, for the list endpoint
//   ResumeDocumentDetailDto  — settings PLUS all six sections, so the editor loads
//                              everything in one call
//
// Sections always come back sorted by `order`, so the client renders the array as-is.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DegreeLevel,
  ResumeDocumentStatus,
  ResumeLineSpacing,
  ResumeMargin,
} from '@prisma/client';
import { ResumeDocumentWithSections, ResumeDocumentRow } from '../../infrastructure/repositories/resume-document.repository';

export class ResumeDocumentListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() title: string;
  @ApiProperty() templateId: string;
  @ApiProperty() colorScheme: string;
  @ApiProperty({ enum: ResumeLineSpacing }) lineSpacing: ResumeLineSpacing;
  @ApiProperty({ enum: ResumeMargin }) margin: ResumeMargin;
  @ApiPropertyOptional() fontFamily?: string;
  @ApiProperty({ enum: ResumeDocumentStatus }) status: ResumeDocumentStatus;

  @ApiPropertyOptional({
    description: 'The Resume row produced by the most recent export, if any.',
  })
  exportedResumeId?: string;

  // ── Résumé header (snapshotted at creation, owned by the document) ─────────
  @ApiPropertyOptional() fullName?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() linkedinUrl?: string;
  @ApiPropertyOptional() portfolioUrl?: string;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(row: ResumeDocumentRow) {
    this.id = row.id;
    this.userId = row.userId;
    this.title = row.title;
    this.templateId = row.templateId;
    this.colorScheme = row.colorScheme;
    this.lineSpacing = row.lineSpacing;
    this.margin = row.margin;
    this.fontFamily = row.fontFamily ?? undefined;
    this.status = row.status;
    this.exportedResumeId = row.exportedResumeId ?? undefined;
    this.fullName = row.fullName ?? undefined;
    this.email = row.email ?? undefined;
    this.phone = row.phone ?? undefined;
    this.location = row.location ?? undefined;
    this.linkedinUrl = row.linkedinUrl ?? undefined;
    this.portfolioUrl = row.portfolioUrl ?? undefined;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }
}

class ExperienceDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() company: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() location?: string;
  @ApiProperty() startDate: Date;
  @ApiPropertyOptional() endDate?: Date;
  @ApiProperty() isCurrentJob: boolean;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: [String] }) technologies: string[];
}

class EducationDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() institution: string;
  @ApiProperty({ enum: DegreeLevel }) degreeLevel: DegreeLevel;
  @ApiProperty() fieldOfStudy: string;
  @ApiProperty() startDate: Date;
  @ApiPropertyOptional() endDate?: Date;
  @ApiPropertyOptional() gpa?: number;
  @ApiPropertyOptional() description?: string;
}

class SkillDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional() proficiencyLevel?: string;
}

class CertificationDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() name: string;
  @ApiProperty() issuer: string;
  @ApiProperty() issueDate: Date;
  @ApiPropertyOptional() expirationDate?: Date;
  @ApiPropertyOptional() credentialId?: string;
  @ApiPropertyOptional() credentialUrl?: string;
}

class ProjectDto {
  @ApiProperty() id: string;
  @ApiProperty() order: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: [String] }) technologies: string[];
  @ApiPropertyOptional() url?: string;
}

export class ResumeDocumentDetailDto extends ResumeDocumentListItemDto {
  @ApiProperty({ description: 'Empty string when the section has never been set.' })
  summary: string;

  @ApiProperty({ type: [ExperienceDto] }) experiences: ExperienceDto[];
  @ApiProperty({ type: [EducationDto] }) educations: EducationDto[];
  @ApiProperty({ type: [SkillDto] }) skills: SkillDto[];
  @ApiProperty({ type: [CertificationDto] }) certifications: CertificationDto[];
  @ApiProperty({ type: [ProjectDto] }) projects: ProjectDto[];

  constructor(row: ResumeDocumentWithSections) {
    super(row);

    this.summary = row.summary?.content ?? '';

    this.experiences = row.experiences.map((e) => ({
      id: e.id,
      order: e.order,
      company: e.company,
      title: e.title,
      location: e.location ?? undefined,
      startDate: e.startDate,
      endDate: e.endDate ?? undefined,
      isCurrentJob: e.isCurrentJob,
      description: e.description ?? undefined,
      technologies: e.technologies,
    }));

    this.educations = row.educations.map((e) => ({
      id: e.id,
      order: e.order,
      institution: e.institution,
      degreeLevel: e.degreeLevel,
      fieldOfStudy: e.fieldOfStudy,
      startDate: e.startDate,
      endDate: e.endDate ?? undefined,
      gpa: e.gpa ?? undefined,
      description: e.description ?? undefined,
    }));

    this.skills = row.skills.map((s) => ({
      id: s.id,
      order: s.order,
      name: s.name,
      proficiencyLevel: s.proficiencyLevel ?? undefined,
    }));

    this.certifications = row.certifications.map((c) => ({
      id: c.id,
      order: c.order,
      name: c.name,
      issuer: c.issuer,
      issueDate: c.issueDate,
      expirationDate: c.expirationDate ?? undefined,
      credentialId: c.credentialId ?? undefined,
      credentialUrl: c.credentialUrl ?? undefined,
    }));

    this.projects = row.projects.map((p) => ({
      id: p.id,
      order: p.order,
      name: p.name,
      description: p.description ?? undefined,
      technologies: p.technologies,
      url: p.url ?? undefined,
    }));
  }
}
