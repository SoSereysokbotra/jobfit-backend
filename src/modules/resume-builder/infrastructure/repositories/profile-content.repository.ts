// src/modules/resume-builder/infrastructure/repositories/profile-content.repository.ts
//
// Read-only projections of the user's profile content, shaped for import into a
// builder document.
//
// Why its own repository rather than reusing the user module's: those repositories
// return domain entities (and there is no CertificationRepository at all), whereas
// import needs flat rows with exactly the columns the builder's child tables take —
// including the UserSkill -> Skill join for the display name, which no existing
// repository exposes. Going through entities would mean mapping twice and still not
// solving the join.
//
// TWO INVARIANTS, both easy to get wrong:
//   * every one of these models soft-deletes, so `deletedAt: null` is mandatory —
//     without it a user's deleted job history reappears on their résumé;
//   * all four FK to **User**, not Profile, so they key off userId.
//
// Ordering is résumé convention — most recent first for anything dated — so an
// imported section reads correctly without the user reordering it by hand.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface ProfileExperienceRow {
  company: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  isCurrentJob: boolean;
  description: string | null;
  technologies: string[];
}

export interface ProfileEducationRow {
  institution: string;
  degreeLevel: string;
  fieldOfStudy: string;
  startDate: Date;
  endDate: Date | null;
  gpa: number | null;
  description: string | null;
}

export interface ProfileSkillRow {
  name: string;
  proficiencyLevel: string | null;
}

export interface ProfileCertificationRow {
  name: string;
  issuer: string;
  issueDate: Date;
  expirationDate: Date | null;
  credentialId: string | null;
  credentialUrl: string | null;
}

@Injectable()
export class ProfileContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async experiences(userId: string): Promise<ProfileExperienceRow[]> {
    const rows = await this.prisma.experience.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'desc' },
      select: {
        company: true,
        title: true,
        startDate: true,
        endDate: true,
        isCurrentJob: true,
        description: true,
        technologies: true,
      },
    });
    // jobLevel/employmentType/industry are deliberately not carried across — they
    // live on Experience but are not printed on a résumé line.
    return rows;
  }

  async educations(userId: string): Promise<ProfileEducationRow[]> {
    return this.prisma.education.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'desc' },
      select: {
        institution: true,
        degreeLevel: true,
        fieldOfStudy: true,
        startDate: true,
        endDate: true,
        gpa: true,
        description: true,
      },
    });
  }

  /**
   * Skills need the join: `UserSkill` holds only skillId/proficiencyLevel/
   * yearsOfExperience/endorsementCount — the display name lives on `Skill`.
   *
   * Ordered by name so the imported list is stable and alphabetical; endorsement
   * count is an in-app signal, not something a résumé should sort by.
   */
  async skills(userId: string): Promise<ProfileSkillRow[]> {
    const rows = await this.prisma.userSkill.findMany({
      where: { userId, deletedAt: null },
      orderBy: { skill: { name: 'asc' } },
      select: {
        proficiencyLevel: true,
        skill: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      name: row.skill.name,
      proficiencyLevel: row.proficiencyLevel,
    }));
  }

  async certifications(userId: string): Promise<ProfileCertificationRow[]> {
    return this.prisma.certification.findMany({
      where: { userId, deletedAt: null },
      orderBy: { issueDate: 'desc' },
      select: {
        name: true,
        issuer: true,
        issueDate: true,
        expirationDate: true,
        credentialId: true,
        credentialUrl: true,
      },
    });
  }

  /**
   * The summary source: `Profile.bio`, falling back to `Profile.headline` when bio
   * is null or blank. Both empty (or no profile at all) yields '' — an empty
   * summary is a legitimate import result, not an error.
   */
  async summaryText(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { bio: true, headline: true },
    });

    const bio = profile?.bio?.trim();
    if (bio) return bio;

    return profile?.headline?.trim() ?? '';
  }
}
