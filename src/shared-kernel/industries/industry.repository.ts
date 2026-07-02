import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface IndustryRecord {
  id: string;
  name: string;
  slug: string;
}

@Injectable()
export class IndustryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<IndustryRecord[]> {
    return this.prisma.industry.findMany({ orderBy: { name: 'asc' } });
  }

  async findBySlug(slug: string): Promise<IndustryRecord | null> {
    return this.prisma.industry.findUnique({ where: { slug } });
  }
}
