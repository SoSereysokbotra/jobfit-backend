// Tests for ApplicationScreeningService — the AI Recruiter's screening step.
//
// The properties that matter are safety ones: it must never cost a candidate their
// application, it must never reject anyone, and it must never overwrite an assessment the
// employer may already have acted on.

import { ApplicationScreeningService } from './application-screening.service';

describe('ApplicationScreeningService', () => {
  const application = {
    id: 'a1',
    userId: 'u1',
    jobId: 'j1',
    status: 'SUBMITTED',
    screenedAt: null as Date | null,
  };

  const build = (opts: {
    application?: unknown;
    match?: unknown;
    gap?: unknown;
    updateThrows?: boolean;
  } = {}) => {
    const prisma: any = {
      application: {
        findUnique: jest
          .fn()
          .mockResolvedValue('application' in opts ? opts.application : application),
        update: opts.updateThrows
          ? jest.fn().mockRejectedValue(new Error('db down'))
          : jest.fn().mockResolvedValue(undefined),
      },
      applicationTimeline: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const jobMatch: any = {
      matchForJob: jest
        .fn()
        .mockResolvedValue('match' in opts ? opts.match : { score: 72.4 }),
    };
    const skillGap: any = {
      analyse: jest.fn().mockResolvedValue(
        'gap' in opts
          ? opts.gap
          : {
              requirements: [{}, {}, {}, {}, {}, {}, {}],
              matchedCount: 6,
              missing: ['Experience mentoring junior engineers'],
              requirementsSource: 'EMPLOYER',
            },
      ),
    };
    return { service: new ApplicationScreeningService(prisma, jobMatch, skillGap), prisma };
  };

  it('stores the assessment and advances SUBMITTED to SCREENING', async () => {
    const { service, prisma } = build();

    const out = await service.screen('a1');

    expect(out.screened).toBe(true);
    expect(out.requirementsCovered).toBe(6);
    expect(out.requirementsTotal).toBe(7);

    const data = prisma.application.update.mock.calls[0][0].data;
    expect(data.status).toBe('SCREENING');
    expect(data.screenMatchScore).toBe(72); // rounded
    expect(data.screenRequirementsSource).toBe('EMPLOYER');
    expect(data.screenedAt).toBeInstanceOf(Date);
  });

  it('records a timeline entry the candidate can see', async () => {
    const { service, prisma } = build();

    await service.screen('a1');

    const entry = prisma.applicationTimeline.create.mock.calls[0][0].data;
    expect(entry.status).toBe('SCREENING');
    expect(entry.eventType).toBe('SCREENED');
    expect(entry.description).toContain('6 of 7');
  });

  it('NEVER rejects — only ever moves to SCREENING', async () => {
    // A pipeline built on a small model's reading of a CV must not end an application.
    const { service, prisma } = build({
      gap: { requirements: [{}, {}], matchedCount: 0, missing: ['a', 'b'], requirementsSource: 'EMPLOYER' },
      match: { score: 3 },
    });

    await service.screen('a1');

    expect(prisma.application.update.mock.calls[0][0].data.status).toBe('SCREENING');
  });

  it('does not re-screen an application that already has an assessment', async () => {
    // The snapshot records the moment of applying; rewriting it would change the record
    // the employer already acted on.
    const { service, prisma } = build({
      application: { ...application, screenedAt: new Date() },
    });

    const out = await service.screen('a1');

    expect(out.skipped).toBe('ALREADY_SCREENED');
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it('leaves a non-SUBMITTED application on its current status', async () => {
    const { service, prisma } = build({
      application: { ...application, status: 'INTERVIEW' },
    });

    await service.screen('a1');

    // The assessment is still stored, but the employer's own status is untouched.
    const data = prisma.application.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.screenedAt).toBeInstanceOf(Date);
    expect(prisma.applicationTimeline.create).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND rather than throwing for an unknown application', async () => {
    const { service } = build({ application: null });

    expect((await service.screen('missing')).skipped).toBe('NOT_FOUND');
  });

  it('NEVER throws when scoring fails — the application must survive', async () => {
    // The caller is the apply flow. An unscreened row is recoverable; a lost submission
    // is not.
    const { service } = build({ updateThrows: true });

    const out = await service.screen('a1');

    expect(out.skipped).toBe('ERROR');
    expect(out.screened).toBe(false);
  });

  it('records a null score when there is no profile to match against', async () => {
    const { service, prisma } = build({ match: null });

    const out = await service.screen('a1');

    expect(out.matchScore).toBeNull();
    expect(prisma.application.update.mock.calls[0][0].data.screenMatchScore).toBeNull();
    // The requirement comparison still ran and is still worth storing.
    expect(out.requirementsCovered).toBe(6);
  });
});
