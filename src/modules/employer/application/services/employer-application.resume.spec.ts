// src/modules/employer/application/services/employer-application.resume.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §9: `grep -rn "resume" src/modules/employer` returned nothing.
// An employer got a name, an email and a screening number the DTO itself describes as
// varying "by only 4 points" between a senior engineer and a graphic designer — an AI
// triage with the human review step removed. Reading the CV is the employer's actual job.
//
// The load-bearing tests here are the authorisation ones. This route hands out a bearer
// credential to a private file belonging to a third party (the candidate), so "which
// employer may mint it, for which application" is the whole security surface.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployerApplicationService } from './employer-application.service';

const RESUME = {
  id: 'r-1',
  userId: 'candidate-1',
  fileName: 'Jane Doe CV.pdf',
  fileType: 'PDF',
  fileSize: 240_000,
  deletedAt: null,
};

describe('EmployerApplicationService.getResumeDownload', () => {
  let context: { requireContext: jest.Mock };
  let appRepo: { findByIdWithResume: jest.Mock };
  let storage: { getSignedUrl: jest.Mock };
  let service: EmployerApplicationService;

  const application = (over: Record<string, unknown> = {}) => ({
    id: 'a-1',
    job: { companyId: 'company-mine' },
    resume: RESUME,
    ...over,
  });

  beforeEach(() => {
    context = {
      requireContext: jest.fn().mockResolvedValue({ companyId: 'company-mine' }),
    };
    appRepo = { findByIdWithResume: jest.fn().mockResolvedValue(application()) };
    storage = {
      getSignedUrl: jest.fn().mockResolvedValue('https://storage/signed?token=abc'),
    };
    service = new EmployerApplicationService(
      context as never,
      appRepo as never,
      { transition: jest.fn() } as never,
      storage as never,
    );
  });

  describe('authorisation', () => {
    it('refuses an application to another company’s job', async () => {
      appRepo.findByIdWithResume.mockResolvedValue(
        application({ job: { companyId: 'company-theirs' } }),
      );

      await expect(service.getResumeDownload('emp-1', 'a-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Critical: the URL must never be minted before the company check passes.
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('404s an application that does not exist, without signing anything', async () => {
      appRepo.findByIdWithResume.mockResolvedValue(null);

      await expect(service.getResumeDownload('emp-1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('propagates the employer-context check (no company, no access)', async () => {
      context.requireContext.mockRejectedValue(new ForbiddenException('no company'));

      await expect(service.getResumeDownload('emp-1', 'a-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(appRepo.findByIdWithResume).not.toHaveBeenCalled();
    });
  });

  describe('which document', () => {
    it('signs the path of the résumé recorded on the application', async () => {
      await service.getResumeDownload('emp-1', 'a-1');

      // Built from the résumé's OWNER (the candidate), not the requesting employer, and
      // from Application.resumeId — the CV actually submitted (§5), not today's default.
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'resumes',
        'candidate-1/r-1/Jane Doe CV.pdf',
        expect.any(Number),
      );
    });

    it('returns the filename and type alongside the link', async () => {
      const result = await service.getResumeDownload('emp-1', 'a-1');

      expect(result).toMatchObject({
        url: 'https://storage/signed?token=abc',
        fileName: 'Jane Doe CV.pdf',
        fileType: 'PDF',
      });
    });

    it('says so when the candidate applied without a CV', async () => {
      appRepo.findByIdWithResume.mockResolvedValue(application({ resume: null }));

      await expect(service.getResumeDownload('emp-1', 'a-1')).rejects.toThrow(
        /applied without one/,
      );
    });

    it('distinguishes a deleted résumé from one that never existed', async () => {
      appRepo.findByIdWithResume.mockResolvedValue(
        application({ resume: { ...RESUME, deletedAt: new Date() } }),
      );

      // Conflating the two would misdescribe the candidate to the employer.
      await expect(service.getResumeDownload('emp-1', 'a-1')).rejects.toThrow(
        /has deleted the résumé/,
      );
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('the link itself', () => {
    it('is short-lived, and says when it expires', async () => {
      const before = Date.now();
      const result = await service.getResumeDownload('emp-1', 'a-1');

      const ttlSeconds = storage.getSignedUrl.mock.calls[0][2] as number;
      // A bearer credential to someone else's private file should outlive a click and
      // little else.
      expect(ttlSeconds).toBeGreaterThan(0);
      expect(ttlSeconds).toBeLessThanOrEqual(600);

      // expiresAt must describe the URL actually minted, not a different window.
      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + ttlSeconds * 1000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttlSeconds * 1000);
    });
  });
});

// ── The board itself now shows there IS a CV, and the cover letter ────────────
describe('EmployerApplicationService.list — résumé metadata and cover letter', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a-1',
    jobId: 'j-1',
    job: { id: 'j-1', title: 'Engineer', companyId: 'company-mine' },
    user: { id: 'candidate-1', name: 'Jane', email: 'jane@x.com' },
    status: 'SUBMITTED',
    archivedByEmployerAt: null,
    offer: null,
    employerNotes: null,
    coverLetter: 'I would love to work here.',
    resume: RESUME,
    screenedAt: null,
    screenMatchScore: null,
    screenRequirementsTotal: null,
    screenRequirementsCovered: null,
    screenMissingRequirements: [],
    screenRequirementsSource: null,
    appliedAt: new Date('2026-08-01'),
    ...over,
  });

  const build = (rows: unknown[]) =>
    new EmployerApplicationService(
      { requireContext: jest.fn().mockResolvedValue({ companyId: 'company-mine' }) } as never,
      { findForCompany: jest.fn().mockResolvedValue(rows) } as never,
      { transition: jest.fn() } as never,
      { getSignedUrl: jest.fn() } as never,
    );

  it('exposes the submitted résumé’s metadata — but no URL', async () => {
    const [dto] = await build([row()]).list('emp-1', {} as never);

    expect(dto.resume).toEqual({
      id: 'r-1',
      fileName: 'Jane Doe CV.pdf',
      fileType: 'PDF',
      fileSize: 240_000,
    });
    // Minting a signed credential per card would put dozens of live URLs into a response
    // the employer will mostly not use.
    expect(dto.resume).not.toHaveProperty('url');
  });

  it('exposes the cover letter, which was on the row all along', async () => {
    const [dto] = await build([row()]).list('emp-1', {} as never);

    expect(dto.coverLetter).toBe('I would love to work here.');
  });

  it('reports null rather than a dead link when the résumé was deleted', async () => {
    const [dto] = await build([
      row({ resume: { ...RESUME, deletedAt: new Date() } }),
    ]).list('emp-1', {} as never);

    expect(dto.resume).toBeNull();
  });

  it('reports null when the candidate applied without a CV', async () => {
    const [dto] = await build([row({ resume: null })]).list('emp-1', {} as never);

    expect(dto.resume).toBeNull();
    expect(dto.coverLetter).toBe('I would love to work here.');
  });
});
