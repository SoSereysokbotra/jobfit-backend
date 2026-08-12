import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { SalaryIntelDto } from './dto/salary.dto';

/** Nearest-rank percentile on an ascending-sorted array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.round((p / 100) * (sortedAsc.length - 1)),
  );
  return Math.round(sortedAsc[idx]);
}

const k = (n: number) => Math.round(n / 1000);

@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Market salary for a company + role, derived from PUBLISHED postings with a
   * salary. Returns null (→ empty state) when the company is unknown or no
   * postings carry salary data.
   */
  async getSalary(company: string, role: string | undefined): Promise<SalaryIntelDto | null> {
    const co = await this.prisma.company.findFirst({
      where: { name: { equals: company.trim(), mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!co) return null;

    const roleTrim = role?.trim() || null;
    // Prefer role-specific postings; fall back to all roles at the company.
    let rows = await this.fetchSalaryRows(co.id, roleTrim);
    if (rows.length === 0 && roleTrim) rows = await this.fetchSalaryRows(co.id, null);
    if (rows.length === 0) return null;

    const mids = rows
      .map((r) => (r.minSalary! + (r.maxSalary ?? r.minSalary!)) / 2)
      .sort((a, b) => a - b);

    const p25 = percentile(mids, 25);
    const p50 = percentile(mids, 50);
    const p75 = percentile(mids, 75);
    const totalCompAvg = Math.round(mids.reduce((a, b) => a + b, 0) / mids.length);

    return {
      company: co.name,
      role: roleTrim ?? co.name,
      listed: null,
      market: { p25, p50, p75, totalCompAvg, currency: 'USD', dataPoints: mids.length },
      // No per-user salary expectation wired yet — neutral default.
      fitPercentile: 'P50',
      tip: `Aim for $${k(p50)}K–$${k(p75)}K based on ${mids.length} market data point${mids.length === 1 ? '' : 's'}.`,
    };
  }

  private fetchSalaryRows(companyId: string, role: string | null) {
    const where: Prisma.JobWhereInput = {
      companyId,
      status: 'PUBLISHED',
      minSalary: { not: null },
    };
    if (role) where.title = { contains: role, mode: 'insensitive' };
    return this.prisma.job.findMany({
      where,
      select: { minSalary: true, maxSalary: true },
      take: 500,
    });
  }
}
