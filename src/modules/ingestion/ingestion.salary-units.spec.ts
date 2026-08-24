// A salary integer with no units is an ambiguous number, and ingestion is where the
// ambiguity would enter (MENTOR_REVIEW_2026-08-18 §12).
//
// No adapter emits pay today — all 305 ingested postings are silent about it. These
// tests exist for the first one that does: the Cambodian boards quote MONTHLY in the
// hundreds and TheMuse quotes ANNUAL in the tens of thousands, so "500" from BongThom
// and "500" from TheMuse are three orders of magnitude apart. If units can be dropped
// silently, that difference is unrecoverable once it is in the column.
//
// The rule pinned here: UNITS FOLLOW AMOUNTS. Never written without them, never
// defaulted, never overwriting a value someone else put there.

import { IngestionService } from './ingestion.service';
import { JobSource } from './ingestion.types';

type Row = Record<string, unknown>;

/**
 * Drives the real service against a stub Prisma and a stub source, returning whatever
 * data reached `job.create`. The `stated` spread is the thing under test, so the test
 * reads the payload rather than restating the rule.
 */
async function ingestOne(over: Record<string, unknown> = {}): Promise<Row> {
  const created: Row[] = [];
  const prisma = {
    company: { upsert: jest.fn().mockResolvedValue({ id: 'co-1' }) },
    job: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: Row }) => {
        created.push(data);
        return { id: 'job-1' };
      }),
      update: jest.fn(),
    },
  };

  const source = {
    fetchJobs: jest.fn().mockResolvedValue([
      {
        source: 'BONGTHOM' as JobSource,
        externalId: 'bt-1',
        title: 'Sales Officer',
        companyName: 'Acme Cambodia',
        description: 'Sell things.',
        location: 'Phnom Penh',
        remoteType: 'ON_SITE',
        externalUrl: 'https://bongthom.com/jobs/bt-1',
        ...over,
      },
    ]),
  };

  const service = new IngestionService(
    prisma as never,
    source as never,
    source as never,
    source as never,
  );
  await service.ingest('BONGTHOM' as JobSource, 1);
  return created[0] ?? {};
}

describe('ingestion — salary units travel with the amount', () => {
  it('writes neither currency nor period when the source states no pay', () => {
    // The live case for all 305 rows. Writing "USD" here would describe a number that
    // is not there, and would look identical to a source that really said USD.
    return ingestOne().then((data) => {
      expect(data).not.toHaveProperty('minSalary');
      expect(data).not.toHaveProperty('salaryCurrency');
      expect(data).not.toHaveProperty('salaryPeriod');
    });
  });

  it('carries the units through when the source states pay', async () => {
    const data = await ingestOne({
      minSalary: 300,
      maxSalary: 500,
      salaryCurrency: 'USD',
      salaryPeriod: 'MONTHLY',
    });

    expect(data.minSalary).toBe(300);
    expect(data.maxSalary).toBe(500);
    expect(data.salaryCurrency).toBe('USD');
    expect(data.salaryPeriod).toBe('MONTHLY');
  });

  it('does not scale the amount — 300 monthly stays 300', async () => {
    // The frontend used to divide by 1000 and round, turning this into 0. Nothing in
    // the ingestion path may pre-scale to compensate for a display bug.
    const data = await ingestOne({
      minSalary: 300,
      maxSalary: 500,
      salaryCurrency: 'USD',
      salaryPeriod: 'MONTHLY',
    });
    expect(data.minSalary).toBe(300);
  });

  it('keeps an amount whose period the source did not state, without inventing one', async () => {
    // Half-known is still better than unknown: the number is real, the period is not
    // guessed, and the client renders no "/yr" suffix.
    const data = await ingestOne({ minSalary: 24000, maxSalary: 42000 });

    expect(data.minSalary).toBe(24000);
    expect(data).not.toHaveProperty('salaryPeriod');
    expect(data).not.toHaveProperty('salaryCurrency');
  });

  it('ignores units offered WITHOUT an amount', async () => {
    // A currency with nothing to count is not a fact about this job, and storing it
    // would make an unpaid-unknown row look partially specified.
    const data = await ingestOne({ salaryCurrency: 'KHR', salaryPeriod: 'MONTHLY' });

    expect(data).not.toHaveProperty('salaryCurrency');
    expect(data).not.toHaveProperty('salaryPeriod');
  });

  it('accepts a non-USD currency unchanged', async () => {
    const data = await ingestOne({
      minSalary: 1200000,
      maxSalary: 2000000,
      salaryCurrency: 'KHR',
      salaryPeriod: 'MONTHLY',
    });

    expect(data.salaryCurrency).toBe('KHR');
    expect(data.minSalary).toBe(1200000);
  });
});
