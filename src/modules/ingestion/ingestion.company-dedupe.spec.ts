// Dropping `companies.name @unique` must not turn every scraped job into a new company.
//
// Ingestion used to `upsert({ where: { name } })`, which only worked because the name was
// unique. Now that two businesses may share a name, the key is `identityKey` — and for a
// scraped row that is the WEAK key built from the normalized name, because no source in
// `ingestion.types.ts` publishes a company website.
//
// If this regresses, nothing throws. The job board simply grows one company per posting,
// and the employer picker fills with hundreds of near-identical rows.

import { IngestionService } from './ingestion.service';
import { JobSource } from './ingestion.types';

/**
 * Drives the real service against a Prisma stub that behaves like the unique index:
 * one row per identityKey, returned again on the next upsert with the same key.
 */
function harness() {
  const companies = new Map<string, { id: string; name: string }>();

  const prisma = {
    company: {
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { identityKey: string };
          create: { name: string; identityKey: string };
        }) => {
          const hit = companies.get(where.identityKey);
          if (hit) return hit;
          const made = { id: `co-${companies.size + 1}`, name: create.name };
          companies.set(where.identityKey, made);
          return made;
        },
      ),
    },
    job: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jest.fn(),
    },
  };

  const ingest = async (companyNames: string[]) => {
    const source = {
      fetchJobs: jest.fn().mockResolvedValue(
        companyNames.map((companyName, i) => ({
          source: 'BONGTHOM' as JobSource,
          externalId: `bt-${i}`,
          title: 'Sales Officer',
          companyName,
          description: 'Sell things.',
          location: 'Phnom Penh',
          remoteType: 'ON_SITE',
          externalUrl: `https://bongthom.com/jobs/bt-${i}`,
        })),
      ),
    };
    const service = new IngestionService(
      prisma as never,
      source as never,
      source as never,
      source as never,
    );
    await service.ingest('BONGTHOM' as JobSource, companyNames.length);
  };

  return { prisma, companies, ingest };
}

describe('ingestion — company dedupe survives the name being non-unique', () => {
  it('groups three jobs from one employer onto ONE company', async () => {
    const h = harness();
    await h.ingest(['Acme Robotics', 'Acme Robotics', 'Acme Robotics']);

    expect(h.prisma.company.upsert).toHaveBeenCalledTimes(3);
    expect(h.companies.size).toBe(1);
  });

  it('dedupes on identityKey, not on name', async () => {
    const h = harness();
    await h.ingest(['Acme Robotics']);

    const { where, create } = h.prisma.company.upsert.mock.calls[0][0];
    expect(where).toEqual({ identityKey: 'name:acme robotics' });
    // The human-readable name is still stored verbatim — normalization is for the key only.
    expect(create.name).toBe('Acme Robotics');
    expect(where).not.toHaveProperty('name');
  });

  // The improvement over the old behaviour: these were three rows before, because the
  // unique index compared raw strings.
  it('collapses casing and punctuation drift from the same employer', async () => {
    const h = harness();
    await h.ingest(['Acme Robotics', 'ACME  Robotics', 'Acme Robotics.']);

    expect(h.companies.size).toBe(1);
  });

  it('keeps genuinely different employers apart', async () => {
    const h = harness();
    await h.ingest(['Acme Robotics', 'Acme Holdings', 'Beta Logistics']);

    expect(h.companies.size).toBe(3);
  });

  // A scraped row never has a website, so it must never claim a domain identity — that
  // would let a scrape hijack the key belonging to a real employer's verified company.
  it('never writes a domain key for a scraped company', async () => {
    const h = harness();
    await h.ingest(['Acme Robotics']);

    const { where, create } = h.prisma.company.upsert.mock.calls[0][0];
    expect(where.identityKey.startsWith('name:')).toBe(true);
    expect(create).not.toHaveProperty('domain');
  });
});
