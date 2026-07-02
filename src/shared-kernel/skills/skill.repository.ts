import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { SkillEntity } from './skill.entity';

@Injectable()
export class SkillRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SkillEntity[]> {
    const rows = await this.prisma.skill.findMany({ orderBy: { name: 'asc' } });
    return rows.map((r) => SkillEntity.create({ name: r.name, slug: r.slug }, r.id));
  }

  async findBySlug(slug: string): Promise<SkillEntity | null> {
    const row = await this.prisma.skill.findUnique({ where: { slug } });
    if (!row) return null;
    return SkillEntity.create({ name: row.name, slug: row.slug }, row.id);
  }

  async findByIds(ids: string[]): Promise<SkillEntity[]> {
    const rows = await this.prisma.skill.findMany({ where: { id: { in: ids } } });
    return rows.map((r) => SkillEntity.create({ name: r.name, slug: r.slug }, r.id));
  }
}
