// src/modules/admin/application/services/admin-company.service.spec.ts
//
// The behaviour these pin is the whole point of the change:
//
//   same name  + different website  -> two companies, allowed
//   same name  + same website       -> refused, existing company returned
//   different name + same website   -> refused, surfaced for review
//   two same-named companies        -> both exist
//   same IP                         -> irrelevant; never consulted
//
// A regression here does not throw — it quietly hands a recruiter someone else's company.

import { ConflictException } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'co-1',
  name: 'Acme Robotics',
  website: 'https://acme-kh.com',
  domain: 'acme-kh.com',
  city: 'Phnom Penh',
  country: 'Cambodia',
  isVerified: false,
  _count: { employers: 0 },
  ...over,
});

describe('AdminCompanyService', () => {
  let prisma: {
    company: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };
  let service: AdminCompanyService;

  beforeEach(() => {
    prisma = {
      company: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(row({ id: 'co-new', name: data.name, domain: data.domain })),
        ),
      },
    };
    service = new AdminCompanyService(prisma as never);
  });

  describe('match', () => {
    it('reports a same-name row as a candidate, not a conflict', async () => {
      prisma.company.findMany.mockResolvedValue([row({ domain: 'acme-kh.com' })]);

      const r = await service.match('Acme Robotics', 'https://acme-si.com');

      expect(r.nameMatches).toHaveLength(1);
      expect(r.domainMatch).toBeNull();
      expect(r.conflict).toBe('NONE'); // different website => different company
    });

    it('matches names through punctuation and casing drift', async () => {
      prisma.company.findMany.mockResolvedValue([row({ name: 'ACME  Robotics.' })]);
      const r = await service.match('acme robotics', null);
      expect(r.nameMatches).toHaveLength(1);
    });

    it('does not treat a merely similar name as a match', async () => {
      // `contains` is a coarse query; the normalized comparison is what decides.
      prisma.company.findMany.mockResolvedValue([row({ name: 'Acme Robotics Co Ltd' })]);
      const r = await service.match('Acme Robotics', null);
      expect(r.nameMatches).toHaveLength(0);
    });

    it('flags same domain + same name', async () => {
      prisma.company.findFirst.mockResolvedValue(row());
      const r = await service.match('Acme Robotics', 'https://www.acme-kh.com/jobs');
      expect(r.conflict).toBe('SAME_DOMAIN_SAME_NAME');
      expect(r.domainMatch?.id).toBe('co-1');
    });

    it('flags same domain + different name', async () => {
      prisma.company.findFirst.mockResolvedValue(row({ name: 'Acme Holdings' }));
      const r = await service.match('Acme Robotics', 'acme-kh.com');
      expect(r.conflict).toBe('SAME_DOMAIN_DIFFERENT_NAME');
    });

    it('uses the email domain when matching, not just the website', async () => {
      prisma.company.findFirst.mockResolvedValue(row({ domain: 'github.com', name: 'GitHub' }));

      const r = await service.match('GitHub', undefined, 'hr@github.com');

      expect(r.normalizedDomain).toBe('github.com');
      expect(r.conflict).toBe('SAME_DOMAIN_SAME_NAME');
    });

    it('never consults an IP — identity is name and domain only', async () => {
      await service.match('Acme Robotics', 'acme-kh.com');
      const where = JSON.stringify(prisma.company.findFirst.mock.calls);
      expect(where).not.toMatch(/ip/i);
    });
  });

  describe('create', () => {
    // The headline requirement.
    it('allows a second company with the same name and a different website', async () => {
      prisma.company.findFirst.mockResolvedValue(null); // no domain clash

      const created = await service.create({
        name: 'Acme Robotics',
        website: 'https://acme-si.com',
      });

      expect(created.id).toBe('co-new');
      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.domain).toBe('acme-si.com');
      expect(data.identityKey).toBe('domain:acme-si.com');
    });

    it('refuses a website that already belongs to a company, and says whose', async () => {
      prisma.company.findFirst.mockResolvedValue(row());

      const err = await service
        .create({ name: 'Acme Robotics', website: 'https://acme-kh.com' })
        .catch((e) => e as ConflictException);

      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.conflict).toBe('SAME_DOMAIN_SAME_NAME');
      expect((body.existingCompany as { id: string }).id).toBe('co-1');
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('refuses a shared website under a different name, for review', async () => {
      prisma.company.findFirst.mockResolvedValue(row({ name: 'Acme Holdings' }));

      const err = await service
        .create({ name: 'Acme Robotics', website: 'acme-kh.com' })
        .catch((e) => e as ConflictException);

      const body = (err as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.conflict).toBe('SAME_DOMAIN_DIFFERENT_NAME');
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('stores the weak key when no website is given — the scraped shape', async () => {
      await service.create({ name: 'Acme Robotics' });
      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.identityKey).toBe('name:acme robotics');
      expect(data.domain).toBeNull();
      // No website means no domain lookup to make.
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });

    // The whole point of the email fallback: the website is optional and gets skipped.
    it('takes the domain from the contact email when no website was given', async () => {
      await service.create({ name: 'GitHub', contactEmail: 'hr@github-kh.com' });

      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.domain).toBe('github-kh.com');
      expect(data.identityKey).toBe('domain:github-kh.com');
    });

    it('checks the email-derived domain for a conflict too', async () => {
      prisma.company.findFirst.mockResolvedValue(row({ domain: 'github-kh.com' }));

      await expect(
        service.create({ name: 'GitHub', contactEmail: 'hr@github-kh.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('ignores a consumer address and keeps the weak key', async () => {
      await service.create({ name: 'GitHub', contactEmail: 'mygithub@gmail.com' });

      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.domain).toBeNull();
      expect(data.identityKey).toBe('name:github');
      // No domain resolved, so there was nothing to check for a conflict.
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });

    it('normalizes the stored domain rather than trusting the typed URL', async () => {
      await service.create({
        name: 'Acme Robotics',
        website: '  HTTPS://WWW.Acme-KH.com/careers/  ',
      });
      const { data } = prisma.company.create.mock.calls[0][0];
      expect(data.domain).toBe('acme-kh.com');
    });
  });
});
