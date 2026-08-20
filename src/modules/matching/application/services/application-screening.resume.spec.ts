// src/modules/matching/application/services/application-screening.resume.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §5: screening selected { id, userId, jobId, status,
// screenedAt } and never read `resumeId`, so the requirements-coverage summary an
// employer sees described whichever CV was default at read time. Apply with your design
// CV, get screened on your engineering one.
//
// These tests assert the CV IDENTITY that reaches SkillGapService, which is the thing
// that was wrong — not the scoring itself, which SkillGapService's own specs cover.

import { ApplicationScreeningService } from './application-screening.service';

const GAP = {
  requirements: [{ text: 'Figma', matchedSkills: ['Figma'] }],
  matchedCount: 1,
  missing: [],
  requirementsSource: 'EMPLOYER',
};

describe('ApplicationScreeningService — screens the submitted résumé', () => {
  let prisma: {
    application: { findUnique: jest.Mock; update: jest.Mock };
  };
  let skillGap: { analyse: jest.Mock };
  let jobMatch: { matchForJob: jest.Mock };
  let transitions: { transition: jest.Mock };
  let service: ApplicationScreeningService;

  const application = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    userId: 'u1',
    jobId: 'j1',
    resumeId: 'r-design',
    status: 'SUBMITTED',
    screenedAt: null,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(application()),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    skillGap = { analyse: jest.fn().mockResolvedValue(GAP) };
    jobMatch = { matchForJob: jest.fn().mockResolvedValue({ score: 71.4 }) };
    transitions = { transition: jest.fn().mockResolvedValue({}) };
    service = new ApplicationScreeningService(
      prisma as never,
      jobMatch as never,
      skillGap as never,
      transitions as never,
    );
  });

  it('reads resumeId off the application row', async () => {
    await service.screen('a1');

    const select = prisma.application.findUnique.mock.calls[0][0].select;
    // If this column stops being selected, the id below silently becomes undefined and
    // the gap analysis quietly reverts to the user's active CV.
    expect(select.resumeId).toBe(true);
  });

  it('passes the SUBMITTED résumé to the gap analysis, not just the user id', async () => {
    await service.screen('a1');

    expect(skillGap.analyse).toHaveBeenCalledWith('u1', 'j1', 'r-design');
  });

  it('screens the submitted CV even when it is no longer the user’s default', async () => {
    // The whole point: the candidate has since switched their default to r-engineering.
    prisma.application.findUnique.mockResolvedValue(
      application({ resumeId: 'r-design' }),
    );

    await service.screen('a1');

    const [, , resumeId] = skillGap.analyse.mock.calls[0];
    expect(resumeId).toBe('r-design');
    expect(resumeId).not.toBe('r-engineering');
  });

  it('passes null through when the application recorded no résumé', async () => {
    prisma.application.findUnique.mockResolvedValue(
      application({ resumeId: null }),
    );

    await service.screen('a1');

    // Null, not omitted: SkillGapService then falls back to the active résumé, which is
    // the best available answer when the row records no document at all.
    expect(skillGap.analyse).toHaveBeenCalledWith('u1', 'j1', null);
  });

  it('still records the requirement counts from that résumé', async () => {
    const outcome = await service.screen('a1');

    expect(outcome.requirementsCovered).toBe(1);
    expect(outcome.requirementsTotal).toBe(1);
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          screenRequirementsCovered: 1,
          screenRequirementsTotal: 1,
        }),
      }),
    );
  });

  it('leaves the match score profile-level — it is NOT per-résumé', async () => {
    await service.screen('a1');

    // Documented limitation, asserted so nobody later assumes otherwise: matchForJob
    // scores profiles.embedding (one vector per user, built from the ACTIVE résumé).
    // Making it per-document needs per-résumé embeddings, which PHASE_DEFAULT_RESUME.md
    // rejected. If this signature ever gains a resumeId, revisit the DTO wording too.
    expect(jobMatch.matchForJob).toHaveBeenCalledWith('u1', 'j1');
  });
});
