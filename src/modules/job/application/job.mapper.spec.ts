// A job we know nothing about must not look like a job we know something about.
//
// The frontend hardcoded `type: "Full-time"` and `level: "Mid-level"` in its mapper
// because the API had nothing to give it, so every job card asserted both regardless of
// the posting — including on a part-time teaching post. The columns exist now. This pins
// the half of the fix that lives on this side: an unset field is ABSENT in the response,
// and no layer between the row and the wire quietly supplies a plausible value.

import { JobMapper } from './job.mapper';
import { Job } from '../domain/entities/job.entity';
import { JobStatus } from '../domain/value-objects/job-status.vo';
import { RemoteType } from '../domain/value-objects/remote-type.vo';
import { SalaryRange } from '@shared-kernel/value-objects/salary-range.vo';

const job = (over: Partial<Parameters<typeof Job.create>[0]> = {}) =>
  Job.create({
    companyId: 'co-1',
    title: 'Primary School Mathematics Teacher',
    description: 'Teach mathematics to primary years.',
    status: JobStatus.published(),
    remoteType: RemoteType.fromString('ON_SITE').value,
    skillIds: [],
    responsibilities: [],
    requirements: [],
    benefits: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...over,
  });

describe('JobMapper — unset fields stay unset', () => {
  it('omits employmentType and experienceLevel when the employer has not said', () => {
    const dto = JobMapper.toResponse(job());

    expect(dto.employmentType).toBeUndefined();
    expect(dto.experienceLevel).toBeUndefined();
    // Absent, not "FULL_TIME" and not the empty string — a client testing truthiness and
    // a client testing `!== undefined` must reach the same conclusion.
    expect(Object.values(dto)).not.toContain('FULL_TIME');
    expect(Object.values(dto)).not.toContain('MID');
  });

  it('carries them through faithfully when the employer HAS said', () => {
    const dto = JobMapper.toResponse(
      job({ employmentType: 'PART_TIME', experienceLevel: 'SENIOR' }),
    );

    expect(dto.employmentType).toBe('PART_TIME');
    expect(dto.experienceLevel).toBe('SENIOR');
  });

  it('does not invent a full-time default for a part-time posting', () => {
    // The concrete case from the handoff: a real part-time teaching posting whose card
    // read "Full-time · Mid-level".
    const dto = JobMapper.toResponse(job({ employmentType: 'PART_TIME' }));

    expect(dto.employmentType).toBe('PART_TIME');
    expect(dto.experienceLevel).toBeUndefined();
  });

  // ── Salary: the currency and the period must reach the client (§12) ─────────

  it('omits salaryRange entirely when the job has no salary', () => {
    // 348 of 367 jobs. The client must render nothing, not "$0K – $0K".
    expect(JobMapper.toResponse(job()).salaryRange).toBeUndefined();
  });

  it('sends the currency alongside the amounts', () => {
    const dto = JobMapper.toResponse(
      job({ salaryRange: SalaryRange.create(400, 800, 'KHR', 'MONTHLY').value }),
    );
    expect(dto.salaryRange).toEqual({
      min: 400,
      max: 800,
      currency: 'KHR',
      period: 'MONTHLY',
    });
  });

  it('sends the amounts ABSOLUTE, never divided into thousands', () => {
    const dto = JobMapper.toResponse(
      job({ salaryRange: SalaryRange.create(140000, 185000, 'USD', 'ANNUAL').value }),
    );
    expect(dto.salaryRange?.min).toBe(140000);
    expect(dto.salaryRange?.max).toBe(185000);
  });

  it('leaves period undefined when the posting did not state one', () => {
    const dto = JobMapper.toResponse(
      job({ salaryRange: SalaryRange.create(1000, 2000).value }),
    );
    expect(dto.salaryRange?.period).toBeUndefined();
    // Not "ANNUAL" by way of any default between the entity and the wire.
    expect(Object.values(dto.salaryRange ?? {})).not.toContain('ANNUAL');
  });
});
