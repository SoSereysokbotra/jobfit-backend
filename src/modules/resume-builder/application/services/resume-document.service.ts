// src/modules/resume-builder/application/services/resume-document.service.ts
//
// Business logic for builder documents.
//
// OWNERSHIP: every method takes the authenticated userId and every lookup goes
// through a repository call that has userId in its `where`. A document belonging
// to someone else is indistinguishable from one that does not exist — both are a
// 404. This deliberately follows `ResumeService` (which 404s on an unowned résumé)
// rather than `ApplicationController` (which 403s); telling a stranger "this exists
// but is not yours" confirms the id for them.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

import {
  ResumeDocumentRepository,
  ResumeDocumentRow,
  ResumeDocumentWithSections,
  SectionName,
} from '../../infrastructure/repositories/resume-document.repository';
import {
  CreateResumeDocumentDto,
  UpdateResumeDocumentDto,
} from '../dtos/resume-document.dto';
import {
  PutCertificationsDto,
  PutEducationDto,
  PutExperienceDto,
  PutProjectsDto,
  PutSkillsDto,
  PutSummaryDto,
} from '../dtos/sections.dto';
import { DEFAULT_COLOR_PRESET } from '../dtos/color-presets';
import {
  ImportFromProfileDto,
  ImportableSection,
} from '../dtos/import-from-profile.dto';
import { ProfileContentRepository } from '../../infrastructure/repositories/profile-content.repository';

/** The résumé header copied onto a document at creation. All optional. */
interface HeaderSnapshot {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

@Injectable()
export class ResumeDocumentService {
  constructor(
    private readonly documents: ResumeDocumentRepository,
    private readonly profileContent: ProfileContentRepository,
    // Read directly for the header snapshot: it is a one-off projection across
    // User + Profile, not a repository concern either module owns.
    private readonly prisma: PrismaService,
  ) {}

  async list(userId: string): Promise<ResumeDocumentRow[]> {
    return this.documents.findByUser(userId);
  }

  async get(id: string, userId: string): Promise<ResumeDocumentWithSections> {
    return this.mustFindWithSections(id, userId);
  }

  async create(
    userId: string,
    dto: CreateResumeDocumentDto,
  ): Promise<ResumeDocumentRow> {
    await this.assertActiveTemplate(dto.templateId);
    const header = await this.snapshotHeader(userId);

    return this.documents.create({
      userId,
      title: dto.title,
      templateId: dto.templateId,
      colorScheme: dto.colorScheme ?? DEFAULT_COLOR_PRESET,
      lineSpacing: dto.lineSpacing ?? 'DEFAULT',
      margin: dto.margin ?? 'NORMAL',
      fontFamily: dto.fontFamily ?? null,
      ...header,
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateResumeDocumentDto,
  ): Promise<ResumeDocumentRow> {
    await this.mustFind(id, userId);

    // Changing template is allowed, but only to another live one.
    if (dto.templateId) await this.assertActiveTemplate(dto.templateId);

    // Every field here is optional; passing `undefined` leaves the column alone,
    // which is what a PATCH should do. Header fields are editable — after creation
    // they belong to the document, and writing them NEVER touches the user's Profile.
    return this.documents.update(id, { ...dto });
  }

  /** Soft delete. The exported Resume, if any, is deliberately untouched. */
  async remove(id: string, userId: string): Promise<void> {
    await this.mustFind(id, userId);
    await this.documents.softDelete(id);
  }

  async duplicate(id: string, userId: string): Promise<ResumeDocumentRow> {
    const source = await this.mustFindWithSections(id, userId);
    return this.documents.duplicate(source, `${source.title} (Copy)`);
  }

  // ── Content sections ───────────────────────────────────────────────────────
  // All six are bulk REPLACE. Each asserts ownership first, so a section write
  // cannot reach a document the caller does not own.

  async putSummary(id: string, userId: string, dto: PutSummaryDto): Promise<void> {
    await this.mustFind(id, userId);
    await this.documents.replaceSummary(id, dto.content);
  }

  async putExperience(id: string, userId: string, dto: PutExperienceDto): Promise<void> {
    await this.replace(id, userId, 'experiences', dto.items.map((i) => ({
      company: i.company,
      title: i.title,
      location: i.location ?? null,
      startDate: i.startDate,
      endDate: i.endDate ?? null,
      isCurrentJob: i.isCurrentJob ?? false,
      description: i.description ?? null,
      technologies: i.technologies ?? [],
    })));
  }

  async putEducation(id: string, userId: string, dto: PutEducationDto): Promise<void> {
    await this.replace(id, userId, 'educations', dto.items.map((i) => ({
      institution: i.institution,
      degreeLevel: i.degreeLevel,
      fieldOfStudy: i.fieldOfStudy,
      startDate: i.startDate,
      endDate: i.endDate ?? null,
      gpa: i.gpa ?? null,
      description: i.description ?? null,
    })));
  }

  async putSkills(id: string, userId: string, dto: PutSkillsDto): Promise<void> {
    await this.replace(id, userId, 'skills', dto.items.map((i) => ({
      name: i.name,
      proficiencyLevel: i.proficiencyLevel ?? null,
    })));
  }

  async putCertifications(
    id: string,
    userId: string,
    dto: PutCertificationsDto,
  ): Promise<void> {
    await this.replace(id, userId, 'certifications', dto.items.map((i) => ({
      name: i.name,
      issuer: i.issuer,
      issueDate: i.issueDate,
      expirationDate: i.expirationDate ?? null,
      credentialId: i.credentialId ?? null,
      credentialUrl: i.credentialUrl ?? null,
    })));
  }

  async putProjects(id: string, userId: string, dto: PutProjectsDto): Promise<void> {
    await this.replace(id, userId, 'projects', dto.items.map((i) => ({
      name: i.name,
      description: i.description ?? null,
      technologies: i.technologies ?? [],
      url: i.url ?? null,
    })));
  }

  // ── Import from profile ────────────────────────────────────────────────────

  /**
   * Prefill the named sections from the user's live profile data.
   *
   * A ONE-TIME COPY, never a live link. Each section is replaced with a snapshot of
   * the profile as it is right now; afterwards the document owns those rows outright.
   * Editing the document does not write back to the profile, and later profile edits
   * do not reach into an already-imported document. That is the whole point — a
   * résumé tailored for one application has to be able to diverge from the master
   * profile.
   *
   * CONTENT ONLY. It never touches the template, the presentation settings, or the
   * header fields snapshotted at creation. Sections not named are left alone.
   *
   * A section with no profile data imports as EMPTY — that is a successful import of
   * nothing, not an error. Clearing a section by importing an empty one is a
   * legitimate (if unusual) thing for a user to do.
   *
   * Replacement goes through the same repository calls the Phase 3 PUT endpoints
   * use, so the two paths cannot drift on replace semantics or transactionality.
   */
  async importFromProfile(
    id: string,
    userId: string,
    dto: ImportFromProfileDto,
  ): Promise<ResumeDocumentWithSections> {
    await this.mustFind(id, userId);

    // Deduplicate: asking for the same section twice should not run it twice.
    const sections = new Set<ImportableSection>(dto.sections);

    // Sequential, not Promise.all: each replace is its own transaction against the
    // same document row, and running them concurrently would have them contend on
    // the parent's updatedAt touch for no benefit — this is a handful of small writes.
    for (const section of sections) {
      // eslint-disable-next-line no-await-in-loop
      await this.importSection(id, userId, section);
    }

    return this.mustFindWithSections(id, userId);
  }

  private async importSection(
    documentId: string,
    userId: string,
    section: ImportableSection,
  ): Promise<void> {
    switch (section) {
      case 'summary': {
        // bio, falling back to headline; '' when the user has neither.
        const content = await this.profileContent.summaryText(userId);
        await this.documents.replaceSummary(documentId, content);
        return;
      }

      case 'experience': {
        const rows = await this.profileContent.experiences(userId);
        await this.documents.replaceSection(
          documentId,
          'experiences',
          rows.map((r) => ({
            company: r.company,
            title: r.title,
            // `Experience` has no location column — left empty for the user to fill in.
            location: null,
            startDate: r.startDate,
            endDate: r.endDate,
            isCurrentJob: r.isCurrentJob,
            description: r.description,
            technologies: r.technologies,
          })),
        );
        return;
      }

      case 'education': {
        const rows = await this.profileContent.educations(userId);
        await this.documents.replaceSection(
          documentId,
          'educations',
          // startDate/endDate, not a single graduationDate; degreeLevel/fieldOfStudy,
          // not degree/field. There is no `honors` column anywhere to carry over.
          rows.map((r) => ({
            institution: r.institution,
            degreeLevel: r.degreeLevel,
            fieldOfStudy: r.fieldOfStudy,
            startDate: r.startDate,
            endDate: r.endDate,
            gpa: r.gpa,
            description: r.description,
          })),
        );
        return;
      }

      case 'skills': {
        const rows = await this.profileContent.skills(userId);
        await this.documents.replaceSection(
          documentId,
          'skills',
          rows.map((r) => ({
            name: r.name,
            proficiencyLevel: r.proficiencyLevel,
          })),
        );
        return;
      }

      case 'certifications': {
        const rows = await this.profileContent.certifications(userId);
        await this.documents.replaceSection(
          documentId,
          'certifications',
          // issuer/issueDate, not organization/issuedDate.
          rows.map((r) => ({
            name: r.name,
            issuer: r.issuer,
            issueDate: r.issueDate,
            expirationDate: r.expirationDate,
            credentialId: r.credentialId,
            credentialUrl: r.credentialUrl,
          })),
        );
        return;
      }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async replace(
    id: string,
    userId: string,
    section: SectionName,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    await this.mustFind(id, userId);
    await this.documents.replaceSection(id, section, rows);
  }

  private async mustFind(id: string, userId: string): Promise<ResumeDocumentRow> {
    const row = await this.documents.findOwned(id, userId);
    if (!row) throw new NotFoundException('Resume document not found');
    return row;
  }

  private async mustFindWithSections(
    id: string,
    userId: string,
  ): Promise<ResumeDocumentWithSections> {
    const row = await this.documents.findOwnedWithSections(id, userId);
    if (!row) throw new NotFoundException('Resume document not found');
    return row;
  }

  /** Templates are ours. An unknown or retired id is a bad request, not a 404. */
  private async assertActiveTemplate(templateId: string): Promise<void> {
    const template = await this.documents.findActiveTemplate(templateId);
    if (!template) {
      throw new BadRequestException('Unknown or inactive template');
    }
  }

  /**
   * Copy the user's contact details onto the document at creation.
   *
   * A one-time snapshot, never a live link: a résumé tailored for one application
   * has to be editable without rewriting the master profile. Everything is
   * nullable, so a user who has not filled in a Profile still gets a usable
   * document with an empty header rather than an error.
   */
  private async snapshotHeader(userId: string): Promise<HeaderSnapshot> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            city: true,
            state: true,
            country: true,
            linkedinUrl: true,
            portfolioUrl: true,
          },
        },
      },
    });

    const profile = user?.profile;
    const fullName = profile
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : '';

    return {
      fullName: fullName || null,
      email: user?.email ?? null,
      phone: profile?.phone ?? null,
      location: joinLocation(profile),
      linkedinUrl: profile?.linkedinUrl ?? null,
      portfolioUrl: profile?.portfolioUrl ?? null,
    };
  }
}

/** "Phnom Penh, Cambodia" — skips the parts the user has not filled in. */
function joinLocation(
  profile?: { city: string | null; state: string | null; country: string | null } | null,
): string | null {
  if (!profile) return null;
  const parts = [profile.city, profile.state, profile.country].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}
