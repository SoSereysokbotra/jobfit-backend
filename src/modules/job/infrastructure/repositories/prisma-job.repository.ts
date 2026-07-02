import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { Job } from '../../domain/entities/job.entity';
import { JobFilters, IJobRepository } from '../../domain/job.repository.interface';
import { JobStatus } from '../../domain/value-objects/job-status.vo';
import { RemoteType } from '../../domain/value-objects/remote-type.vo';
import { SalaryRange } from '@shared-kernel/value-objects/salary-range.vo';
import { Job as PrismaJob, JobSkill } from '@prisma/client';

type PrismaJobWithSkills = PrismaJob & { skills: JobSkill[] };

@Injectable()
export class PrismaJobRepository implements IJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Job | null> {
    const row = await this.prisma.job.findUnique({
      where: { id },
      include: { skills: true },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findMany(filters: JobFilters, limit: number, offset: number): Promise<Job[]> {
    const rows = await this.prisma.job.findMany({
      where: {
        ...(filters.status    && { status: filters.status as any }),
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.remoteType && { remoteType: filters.remoteType }),
        ...(filters.minSalary !== undefined && { minSalary: { gte: filters.minSalary } }),
        ...(filters.maxSalary !== undefined && { maxSalary: { lte: filters.maxSalary } }),
        ...(filters.skillIds?.length && {
          skills: { some: { skillId: { in: filters.skillIds } } },
        }),
      },
      include: { skills: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(job: Job): Promise<void> {
    const salary = job.salaryRange;
    await this.prisma.job.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        companyId: job.companyId,
        title: job.title,
        description: job.description,
        status: job.status.value as any,
        remoteType: job.remoteType.value,
        location: job.location,
        minSalary: salary?.min ?? null,
        maxSalary: salary?.max ?? null,
        skills: {
          create: job.skillIds.map((skillId) => ({ skillId })),
        },
      },
      update: {
        title: job.title,
        description: job.description,
        status: job.status.value as any,
        remoteType: job.remoteType.value,
        location: job.location,
        minSalary: salary?.min ?? null,
        maxSalary: salary?.max ?? null,
        updatedAt: job.props.updatedAt,
        skills: {
          deleteMany: {},
          create: job.skillIds.map((skillId) => ({ skillId })),
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.job.delete({ where: { id } });
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private toDomain(row: PrismaJobWithSkills): Job {
    const salaryRange =
      row.minSalary !== null && row.maxSalary !== null
        ? SalaryRange.create(row.minSalary, row.maxSalary).value
        : undefined;

    return Job.create(
      {
        companyId: row.companyId,
        title: row.title,
        description: row.description,
        status: JobStatus.fromString(row.status).value,
        remoteType: RemoteType.fromString(row.remoteType).value,
        location: row.location ?? undefined,
        salaryRange,
        skillIds: row.skills.map((s) => s.skillId),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  }
}
