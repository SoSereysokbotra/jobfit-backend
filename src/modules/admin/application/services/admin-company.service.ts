// src/modules/admin/application/services/admin-company.service.ts
//
// Company lookup and creation for the admin panel, and the conflict rules that decide
// whether two rows are the same company.
//
// THE PRINCIPLE: same name is a CANDIDATE. Same domain is an IDENTITY.
//
// A name match is shown to the admin and never acted on — "Acme Robotics" in Phnom Penh and
// "Acme Robotics" in Siem Reap are different businesses, and silently reusing the first
// would hand a recruiter someone else's company. A domain match is different: a website
// belongs to one business, so it stops the write and asks a human.

import { ConflictException, Injectable } from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import {
  buildIdentityKey,
  domainFromEmail,
  normalizeCompanyName,
  normalizeDomain,
} from '@shared/utils/company-identity';

/** What a proposed company collides with, if anything. */
export type CompanyConflictKind =
  /** Nothing in the way — safe to create. */
  | 'NONE'
  /** Same domain, same name. Almost certainly the company they mean. */
  | 'SAME_DOMAIN_SAME_NAME'
  /** Same domain, different name. Could be a rebrand, a subsidiary, or a mistake. */
  | 'SAME_DOMAIN_DIFFERENT_NAME';

export interface CompanyCandidate {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  city: string | null;
  country: string | null;
  isVerified: boolean;
  isClaimed: boolean;
}

export interface CompanyMatchResult {
  /** Rows sharing the normalized NAME. Advisory — the admin decides. */
  nameMatches: CompanyCandidate[];
  /** The row already holding this domain, if any. Blocking. */
  domainMatch: CompanyCandidate | null;
  conflict: CompanyConflictKind;
  /** The domain we resolved, so the UI can show what was actually compared. */
  normalizedDomain: string | null;
}

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  website: true,
  domain: true,
  city: true,
  country: true,
  isVerified: true,
  _count: { select: { employers: true } },
} satisfies Prisma.CompanySelect;

type CandidateRow = Prisma.CompanyGetPayload<{ select: typeof CANDIDATE_SELECT }>;

function toCandidate(row: CandidateRow): CompanyCandidate {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    domain: row.domain,
    city: row.city,
    country: row.country,
    isVerified: row.isVerified,
    // One employer per company is the MVP rule, so the picker must show it.
    isClaimed: row._count.employers > 0,
  };
}

@Injectable()
export class AdminCompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Free-text search for the approve dialog's picker. Name is a display attribute. */
  async search(search: string | undefined, take: number): Promise<CompanyCandidate[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      select: CANDIDATE_SELECT,
      orderBy: { name: 'asc' },
      take,
    });
    return rows.map(toCandidate);
  }

  /**
   * What would happen if this company were created — asked BEFORE the write, so the admin
   * sees candidates and conflicts instead of a bare error.
   *
   * Name and domain are answered separately on purpose. They mean different things:
   * a shared name is a coincidence worth showing; a shared domain is the same business.
   */
  async match(
    name: string,
    website?: string | null,
    /** The employer's contact address, used as the domain when no website was given. */
    contactEmail?: string | null,
  ): Promise<CompanyMatchResult> {
    const domain = normalizeDomain(website) ?? domainFromEmail(contactEmail);
    const normalizedName = normalizeCompanyName(name);

    // Contains, then filtered on the normalized form — Postgres cannot apply our
    // punctuation rules, so the coarse query is narrowed in memory.
    const nameRows = await this.prisma.company.findMany({
      where: { deletedAt: null, name: { contains: name.trim(), mode: 'insensitive' } },
      select: CANDIDATE_SELECT,
      take: 20,
    });
    const nameMatches = nameRows
      .filter((r) => normalizeCompanyName(r.name) === normalizedName)
      .map(toCandidate);

    const domainRow = domain
      ? await this.prisma.company.findFirst({
          where: { deletedAt: null, domain },
          select: CANDIDATE_SELECT,
        })
      : null;
    const domainMatch = domainRow ? toCandidate(domainRow) : null;

    let conflict: CompanyConflictKind = 'NONE';
    if (domainMatch) {
      conflict =
        normalizeCompanyName(domainMatch.name) === normalizedName
          ? 'SAME_DOMAIN_SAME_NAME'
          : 'SAME_DOMAIN_DIFFERENT_NAME';
    }

    return { nameMatches, domainMatch, conflict, normalizedDomain: domain };
  }

  /**
   * Create a company.
   *
   * REFUSES on a domain collision, and only on a domain collision. A name collision is
   * allowed through deliberately: that is the whole point of the change — two businesses
   * may share a name, and the admin has already been shown the candidates by `match`.
   *
   * The refusal carries the conflicting company so the caller can offer the real choices
   * (use that one / this is a different company) rather than a dead end.
   */
  async create(input: {
    name: string;
    website?: string | null;
    industry?: string | null;
    /**
     * The employer's contact address. Falls back to this for the domain when no website
     * was given — the website is optional on the intake form and routinely skipped, while
     * the email is required and says which business they are just as well.
     */
    contactEmail?: string | null;
  }): Promise<CompanyCandidate> {
    const name = input.name.trim();
    const website = input.website?.trim() || null;
    const domain = normalizeDomain(website) ?? domainFromEmail(input.contactEmail);

    if (domain) {
      const existing = await this.prisma.company.findFirst({
        where: { deletedAt: null, domain },
        select: CANDIDATE_SELECT,
      });
      if (existing) {
        throw new ConflictException({
          message:
            `${domain} already belongs to "${existing.name}". A website identifies one ` +
            'business, so this needs a decision rather than a second row.',
          conflict:
            normalizeCompanyName(existing.name) === normalizeCompanyName(name)
              ? 'SAME_DOMAIN_SAME_NAME'
              : 'SAME_DOMAIN_DIFFERENT_NAME',
          existingCompany: toCandidate(existing),
        });
      }
    }

    try {
      const created = await this.prisma.company.create({
        data: {
          name,
          website,
          domain,
          industry: input.industry?.trim() || null,
          identityKey: buildIdentityKey({
            name,
            website,
            email: input.contactEmail,
          }),
        },
        select: CANDIDATE_SELECT,
      });
      return toCandidate(created);
    } catch (err) {
      // The unique index on identityKey. Reachable when two companies with NO website
      // normalize to the same weak key — the domain check above cannot see that case.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A company named "${name}" already exists, and neither has a website or a ` +
            'company email to tell them apart. Add the website, or select the existing one.',
        );
      }
      throw err;
    }
  }

  /** Load one, for the caller that needs the full row. */
  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { id, deletedAt: null } });
  }
}
