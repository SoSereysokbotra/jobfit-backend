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
});
