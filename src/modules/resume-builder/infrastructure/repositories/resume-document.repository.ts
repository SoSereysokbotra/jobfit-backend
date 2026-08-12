// src/modules/resume-builder/infrastructure/repositories/resume-document.repository.ts
//
// Prisma persistence for builder documents and their six content sections.
//
// OWNERSHIP IS A QUERY TERM, NOT A LATER CHECK. Every read takes a userId and puts
// it in the `where`, so "find by id" cannot return another user's row at all. That
// is why the service can turn a miss straight into a 404 without a second check —
// there is no code path where a document is fetched and then compared.
//
// Soft delete: every read filters `deletedAt: null`.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

/** Sections always read back in their stored order. */
const SECTION_INCLUDE = {
  summary: true,
  experiences: { orderBy: { order: 'asc' } },
  educations: { orderBy: { order: 'asc' } },
  skills: { orderBy: { order: 'asc' } },
  certifications: { orderBy: { order: 'asc' } },
  projects: { orderBy: { order: 'asc' } },
} satisfies Prisma.ResumeDocumentInclude;

export type ResumeDocumentRow = Prisma.ResumeDocumentGetPayload<object>;
export type ResumeDocumentWithSections = Prisma.ResumeDocumentGetPayload<{
  include: typeof SECTION_INCLUDE;
}>;

/** The child tables a section PUT can target, and their Prisma delegates. */
export type SectionName =
  | 'experiences'
  | 'educations'
  | 'skills'
  | 'certifications'
  | 'projects';

/**
 * The two operations replaceSection needs, structurally.
 *
 * The five generated delegates have incompatible generic signatures, so a union of
 * them is not callable — TypeScript refuses `delegate.deleteMany(...)`. Narrowing to
 * the shape we actually use keeps the call sites typed and confines the cast to one
 * place. Row contents stay unchecked here on purpose: the service builds them from
 * validated DTOs, and Prisma rejects anything the column will not take.
 */
interface SectionDelegate {
  deleteMany(args: {
    where: { resumeDocumentId: string };
  }): Prisma.PrismaPromise<unknown>;
  createMany(args: {
    data: Record<string, unknown>[];
  }): Prisma.PrismaPromise<unknown>;
}

@Injectable()
export class ResumeDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Documents owned by this user, newest first. */
  async findByUser(userId: string): Promise<ResumeDocumentRow[]> {
    return this.prisma.resumeDocument.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * One document WITH all six sections — the editor's single load.
   * Returns null when it does not exist, is deleted, OR belongs to someone else;
   * the caller cannot tell those apart, which is the point.
   */
  async findOwnedWithSections(
    id: string,
    userId: string,
  ): Promise<ResumeDocumentWithSections | null> {
    return this.prisma.resumeDocument.findFirst({
      where: { id, userId, deletedAt: null },
      include: SECTION_INCLUDE,
    });
  }

  /** Same ownership scoping, without the section joins. */
  async findOwned(id: string, userId: string): Promise<ResumeDocumentRow | null> {
    return this.prisma.resumeDocument.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async create(
    data: Prisma.ResumeDocumentUncheckedCreateInput,
  ): Promise<ResumeDocumentRow> {
    return this.prisma.resumeDocument.create({ data });
  }

  async update(
    id: string,
    data: Prisma.ResumeDocumentUncheckedUpdateInput,
  ): Promise<ResumeDocumentRow> {
    return this.prisma.resumeDocument.update({ where: { id }, data });
  }

  /** Soft delete. The exported Resume, if any, is deliberately left alone. */
  async softDelete(id: string): Promise<void> {
    await this.prisma.resumeDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** An ACTIVE template, or null. Inactive templates are invisible to selection. */
  async findActiveTemplate(templateId: string): Promise<{ id: string } | null> {
    return this.prisma.resumeTemplate.findFirst({
      where: { id: templateId, isActive: true },
      select: { id: true },
    });
  }

  /**
   * Replace one array section wholesale, in a transaction.
   *
   * Delete-then-insert rather than diffing: the editor owns the whole section and
   * sends it entire, and `order` is the array index. Doing it in a transaction is
   * what stops a failure halfway leaving the section with the old rows gone and
   * the new ones missing.
   */
  async replaceSection(
    documentId: string,
    section: SectionName,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const delegate = this.sectionDelegate(section);

    await this.prisma.$transaction([
      delegate.deleteMany({ where: { resumeDocumentId: documentId } }),
      ...(rows.length > 0
        ? [
            delegate.createMany({
              data: rows.map((row, index) => ({
                ...row,
                resumeDocumentId: documentId,
                order: index,
              })),
            }),
          ]
        : []),
      // Touch the parent so `updatedAt` reflects the edit — the list is ordered by
      // it, and a delta sync would otherwise miss a content-only change.
      this.prisma.resumeDocument.update({
        where: { id: documentId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  /** Summary is 1:1, so "replace" is an upsert of a single row. */
  async replaceSummary(documentId: string, content: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.resumeDocumentSummary.upsert({
        where: { resumeDocumentId: documentId },
        update: { content },
        create: { resumeDocumentId: documentId, content },
      }),
      this.prisma.resumeDocument.update({
        where: { id: documentId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  /**
   * Deep-copy a document and every child row as a new DRAFT.
   *
   * One transaction: a half-copied résumé is worse than no copy. Child ids are not
   * carried over — these are new rows — but `order` is, so the copy reads identically.
   */
  async duplicate(
    source: ResumeDocumentWithSections,
    title: string,
  ): Promise<ResumeDocumentRow> {
    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.resumeDocument.create({
        data: {
          userId: source.userId,
          title,
          templateId: source.templateId,
          colorScheme: source.colorScheme,
          lineSpacing: source.lineSpacing,
          margin: source.margin,
          fontFamily: source.fontFamily,
          // A copy is always a fresh draft, and it has never been exported —
          // carrying the parent's exportedResumeId would point two documents at
          // one résumé and make re-export soft-delete a file the original owns.
          status: 'DRAFT',
          exportedResumeId: null,
          fullName: source.fullName,
          email: source.email,
          phone: source.phone,
          location: source.location,
          linkedinUrl: source.linkedinUrl,
          portfolioUrl: source.portfolioUrl,
        },
      });

      if (source.summary) {
        await tx.resumeDocumentSummary.create({
          data: { resumeDocumentId: copy.id, content: source.summary.content },
        });
      }

      if (source.experiences.length > 0) {
        await tx.resumeDocumentExperience.createMany({
          data: source.experiences.map((e) => ({
            resumeDocumentId: copy.id,
            order: e.order,
            company: e.company,
            title: e.title,
            location: e.location,
            startDate: e.startDate,
            endDate: e.endDate,
            isCurrentJob: e.isCurrentJob,
            description: e.description,
            technologies: e.technologies,
          })),
        });
      }

      if (source.educations.length > 0) {
        await tx.resumeDocumentEducation.createMany({
          data: source.educations.map((e) => ({
            resumeDocumentId: copy.id,
            order: e.order,
            institution: e.institution,
            degreeLevel: e.degreeLevel,
            fieldOfStudy: e.fieldOfStudy,
            startDate: e.startDate,
            endDate: e.endDate,
            gpa: e.gpa,
            description: e.description,
          })),
        });
      }

      if (source.skills.length > 0) {
        await tx.resumeDocumentSkill.createMany({
          data: source.skills.map((s) => ({
            resumeDocumentId: copy.id,
            order: s.order,
            name: s.name,
            proficiencyLevel: s.proficiencyLevel,
          })),
        });
      }

      if (source.certifications.length > 0) {
        await tx.resumeDocumentCertification.createMany({
          data: source.certifications.map((c) => ({
            resumeDocumentId: copy.id,
            order: c.order,
            name: c.name,
            issuer: c.issuer,
            issueDate: c.issueDate,
            expirationDate: c.expirationDate,
            credentialId: c.credentialId,
            credentialUrl: c.credentialUrl,
          })),
        });
      }

      if (source.projects.length > 0) {
        await tx.resumeDocumentProject.createMany({
          data: source.projects.map((p) => ({
            resumeDocumentId: copy.id,
            order: p.order,
            name: p.name,
            description: p.description,
            technologies: p.technologies,
            url: p.url,
          })),
        });
      }

      return copy;
    });
  }

  /**
   * Map the section name to its delegate, narrowed to SectionDelegate.
   *
   * The switch is exhaustive over SectionName, so adding a section without wiring
   * it here is a compile error rather than a runtime surprise.
   */
  private sectionDelegate(section: SectionName): SectionDelegate {
    switch (section) {
      case 'experiences':
        return this.prisma.resumeDocumentExperience as unknown as SectionDelegate;
      case 'educations':
        return this.prisma.resumeDocumentEducation as unknown as SectionDelegate;
      case 'skills':
        return this.prisma.resumeDocumentSkill as unknown as SectionDelegate;
      case 'certifications':
        return this.prisma
          .resumeDocumentCertification as unknown as SectionDelegate;
      case 'projects':
        return this.prisma.resumeDocumentProject as unknown as SectionDelegate;
    }
  }
}
