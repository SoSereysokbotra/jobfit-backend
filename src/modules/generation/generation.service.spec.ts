import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { AiServiceError } from '@infra/ai/ai.errors';

describe('GenerationService', () => {
  let prisma: any;
  let aiClient: any;
  let service: GenerationService;

  const application = {
    id: 'a1',
    userId: 'u1',
    resumeId: 'r1',
    job: { title: 'Backend Engineer', description: 'Build APIs', company: { name: 'Acme' } },
  };

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockResolvedValue(undefined),
      },
      job: {
        findUnique: jest.fn().mockResolvedValue({ title: 'Backend Engineer', description: 'Build APIs' }),
      },
      parsedResumeData: {
        findUnique: jest.fn().mockResolvedValue({ summary: 'Seasoned backend dev.' }),
      },
      resume: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    aiClient = { generateCoverLetter: jest.fn(), generateInterview: jest.fn() };
    service = new GenerationService(prisma, aiClient);
  });

  describe('coverLetterForApplication', () => {
    it('uses AI and persists when the service is up', async () => {
      aiClient.generateCoverLetter.mockResolvedValue({ coverLetter: 'Dear Acme…' });

      const result = await service.coverLetterForApplication('u1', 'a1', 'professional');

      expect(result).toEqual({ coverLetter: 'Dear Acme…', generatedBy: 'ai' });
      expect(aiClient.generateCoverLetter).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTitle: 'Backend Engineer',
          companyName: 'Acme',
          resumeSummary: 'Seasoned backend dev.',
          tone: 'professional',
        }),
      );
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { coverLetter: 'Dear Acme…' },
      });
    });

    it('falls back to a template on AiServiceError', async () => {
      aiClient.generateCoverLetter.mockRejectedValue(new AiServiceError('MODEL_TIMEOUT', 'down'));

      const result = await service.coverLetterForApplication('u1', 'a1');

      expect(result.generatedBy).toBe('template');
      expect(result.coverLetter).toContain('Backend Engineer');
      expect(result.coverLetter).toContain('Acme');
      expect(prisma.application.update).toHaveBeenCalled(); // still persisted
    });

    it('404s for a missing application', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(service.coverLetterForApplication('u1', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403s when the application belongs to another user', async () => {
      prisma.application.findUnique.mockResolvedValue({ ...application, userId: 'other' });
      await expect(service.coverLetterForApplication('u1', 'a1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('interview', () => {
    it('returns AI questions when up', async () => {
      aiClient.generateInterview.mockResolvedValue({
        questions: [{ question: 'Q1', category: 'tech', guidance: 'G' }],
        feedback: null,
      });
      const result = await service.interview('j1', 'SENIOR', 'questions');
      expect(result.generatedBy).toBe('ai');
      expect(result.questions).toHaveLength(1);
    });

    it('falls back to static questions on AiServiceError', async () => {
      aiClient.generateInterview.mockRejectedValue(new AiServiceError('MODEL_ERROR', 'boom', 500));
      const result = await service.interview('j1', 'SENIOR', 'questions');
      expect(result.generatedBy).toBe('static');
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('falls back to generic feedback on AiServiceError (kind=feedback)', async () => {
      aiClient.generateInterview.mockRejectedValue(new AiServiceError('MODEL_ERROR', 'boom', 500));
      const result = await service.interview('j1', 'SENIOR', 'feedback', 'my answer');
      expect(result.generatedBy).toBe('static');
      expect(result.feedback).toContain('STAR');
    });

    it('404s for a missing job', async () => {
      prisma.job.findUnique.mockResolvedValue(null);
      await expect(service.interview('x', 'SENIOR', 'questions')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
