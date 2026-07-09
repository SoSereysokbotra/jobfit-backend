// src/modules/user/infrastructure/repositories/user-skill.repository.ts
//
// Prisma-backed persistence for the UserSkill entity. Maps rows to domain entities.
// Soft delete via deletedAt. Also exposes a Skill (shared kernel) lookup used by the
// service to validate the FK and read the skill's display name for events.

import { Injectable } from '@nestjs/common';
import { UserSkill as PrismaUserSkill } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { UserSkill } from '../../domain/entities/user-skill.entity';

@Injectable()
export class UserSkillRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(skill: UserSkill): Promise<void> {
    await this.prisma.userSkill.upsert({
      where: { id: skill.id },
      update: {
        endorsementCount: skill.endorsementCount,
        proficiencyLevel: skill.proficiencyLevel,
        yearsOfExperience: skill.yearsOfExperience ?? null,
        updatedAt: skill.updatedAt,
      },
      create: {
        id: skill.id,
        userId: skill.userId,
        skillId: skill.skillId,
        endorsementCount: skill.endorsementCount,
        proficiencyLevel: skill.proficiencyLevel,
        yearsOfExperience: skill.yearsOfExperience ?? null,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<UserSkill | null> {
    const row = await this.prisma.userSkill.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** All non-deleted skills for a user, most-endorsed first. */
  async findByUserId(userId: string): Promise<UserSkill[]> {
    const rows = await this.prisma.userSkill.findMany({
      where: { userId, deletedAt: null },
      orderBy: { endorsementCount: 'desc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  async findByUserAndSkill(
    userId: string,
    skillId: string,
  ): Promise<UserSkill | null> {
    const row = await this.prisma.userSkill.findFirst({
      where: { userId, skillId, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.userSkill.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Look up a Skill (shared kernel) by id — validates the FK and reads its name. */
  async findSkillById(
    skillId: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true, name: true },
    });
  }

  private mapToDomain(raw: PrismaUserSkill): UserSkill {
    return new UserSkill(
      {
        userId: raw.userId,
        skillId: raw.skillId,
        endorsementCount: raw.endorsementCount,
        proficiencyLevel: raw.proficiencyLevel,
        yearsOfExperience: raw.yearsOfExperience ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
