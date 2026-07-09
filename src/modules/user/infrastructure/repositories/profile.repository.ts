// src/modules/user/infrastructure/repositories/profile.repository.ts
//
// Prisma-backed persistence for the Profile entity (1:1 with User). The Location and
// SalaryRange value objects are flattened to/from their columns
// (city/state/country/latitude/longitude, minSalary/maxSalary/salaryCurrency).
// Soft delete via deletedAt. Enum arrays are cast at the Prisma boundary.

import { Injectable } from '@nestjs/common';
import { $Enums, Profile as PrismaProfile } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { Profile } from '../../domain/entities/profile.entity';
import { Location } from '@shared/kernel/value-objects/location.vo';
import { SalaryRange } from '@shared/kernel/value-objects/salary-range.vo';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { RemoteType } from '@shared/kernel/enums/remote-type.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(profile: Profile): Promise<void> {
    const fields = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone ?? null,
      photoUrl: profile.photoUrl ?? null,
      bio: profile.bio ?? null,
      headline: profile.headline ?? null,
      // Location (flattened)
      city: profile.location?.city ?? null,
      state: profile.location?.state ?? null,
      country: profile.location?.country ?? null,
      latitude: profile.location?.latitude ?? null,
      longitude: profile.location?.longitude ?? null,
      // Work preferences
      desiredJobLevels: profile.desiredJobLevels as $Enums.JobLevel[],
      desiredRemoteTypes: profile.desiredRemoteTypes as $Enums.RemoteType[],
      desiredEmploymentTypes:
        profile.desiredEmploymentTypes as $Enums.EmploymentType[],
      desiredIndustries: profile.desiredIndustries,
      // Salary (flattened)
      minSalary: profile.salaryRange?.min ?? null,
      maxSalary: profile.salaryRange?.max ?? null,
      salaryCurrency: profile.salaryRange?.currency ?? 'USD',
      // Social links
      linkedinUrl: profile.linkedinUrl ?? null,
      githubUrl: profile.githubUrl ?? null,
      portfolioUrl: profile.portfolioUrl ?? null,
      updatedAt: profile.updatedAt,
    };
    await this.prisma.profile.upsert({
      where: { id: profile.id },
      update: fields,
      create: {
        id: profile.id,
        userId: profile.userId,
        createdAt: profile.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<Profile | null> {
    const row = await this.prisma.profile.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** The user's profile (1:1), or null when none / soft-deleted. */
  async findByUserId(userId: string): Promise<Profile | null> {
    const row = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.profile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapToDomain(raw: PrismaProfile): Profile {
    const location =
      raw.city && raw.country
        ? Location.create(
            raw.city,
            raw.state ?? '',
            raw.country,
            raw.latitude ?? undefined,
            raw.longitude ?? undefined,
          )
        : undefined;

    const salaryRange =
      raw.minSalary !== null && raw.maxSalary !== null
        ? SalaryRange.create(raw.minSalary, raw.maxSalary, raw.salaryCurrency)
        : undefined;

    return new Profile(
      {
        userId: raw.userId,
        firstName: raw.firstName,
        lastName: raw.lastName,
        phone: raw.phone ?? undefined,
        photoUrl: raw.photoUrl ?? undefined,
        bio: raw.bio ?? undefined,
        headline: raw.headline ?? undefined,
        location,
        desiredJobLevels: raw.desiredJobLevels as JobLevel[],
        desiredRemoteTypes: raw.desiredRemoteTypes as RemoteType[],
        desiredEmploymentTypes: raw.desiredEmploymentTypes as EmploymentType[],
        desiredIndustries: raw.desiredIndustries,
        salaryRange,
        linkedinUrl: raw.linkedinUrl ?? undefined,
        githubUrl: raw.githubUrl ?? undefined,
        portfolioUrl: raw.portfolioUrl ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
