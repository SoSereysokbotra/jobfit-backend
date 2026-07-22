// Verifies the Phase 2 AI-scoring seam in ResumeScorerService:
//  - AI up          -> AI scores + breakdown + suggestions, scoredBy: "ai", persisted
//  - AiServiceError -> heuristic composite, scoredBy: "heuristic", no suggestions, persisted
//  - out-of-range AI scores are clamped to 0-100
//  - non-AI errors propagate (no silent fallback)

import { ResumeScorerService } from './resume-scorer.service';
import { AiServiceError } from '@infra/ai/ai.errors';
import { ScoreResumeResponse } from '@infra/ai/ai.types';

describe('ResumeScorerService (AI scoring + fallback)', () => {
  const parsed = {
    resumeId: 'r1',
    fullName: 'Jane Doe',
    email: 'jane@x.com',
    phone: '+85512345678',
    location: 'Phnom Penh',
    summary: 'Backend engineer',
    experiences: JSON.stringify([{ company: 'Acme' }]),
    educations: JSON.stringify([{ institution: 'RUPP' }]),
    skills: JSON.stringify(['TypeScript', 'NestJS']),
    certifications: null,
    rawText:
      'Jane Doe\n- led team\n- built NestJS services\nSkills\nTypeScript, NestJS',
    parsedBy: 'ai',
  };
  const resume = { id: 'r1', atsScore: null, qualityScore: null, updatedAt: new Date() };

  let resumeRepository: { findById: jest.Mock; save: jest.Mock };
  let parsedRepo: { findByResumeId: jest.Mock };
  let aiClient: { scoreResume: jest.Mock };
  let service: ResumeScorerService;

  beforeEach(() => {
    resume.atsScore = null;
    resume.qualityScore = null;
    resumeRepository = {
      findById: jest.fn().mockResolvedValue({ ...resume }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    parsedRepo = { findByResumeId: jest.fn().mockResolvedValue(parsed) };
    aiClient = { scoreResume: jest.fn() };

    service = new ResumeScorerService(
      resumeRepository as never,
      parsedRepo as never,
      aiClient as never,
    );
  });

  const aiResult: ScoreResumeResponse = {
    atsScore: 82,
    qualityScore: 76,
    breakdown: { formatting: 80, keywords: 74 },
    suggestions: ['Add measurable outcomes to your Acme role'],
  };

  it('uses AI scores + suggestions and persists, scoredBy "ai"', async () => {
    aiClient.scoreResume.mockResolvedValue(aiResult);

    const result = await service.scoreResume('r1', { targetRole: 'Backend Engineer' });

    expect(aiClient.scoreResume).toHaveBeenCalledWith(
      expect.stringContaining('Jane Doe'),
      'Backend Engineer',
    );
    expect(result).toEqual({
      atsScore: 82,
      qualityScore: 76,
      breakdown: { formatting: 80, keywords: 74 },
      suggestions: ['Add measurable outcomes to your Acme role'],
      scoredBy: 'ai',
    });
    // Persisted onto the resume.
    const saved = resumeRepository.save.mock.calls[0][0];
    expect(saved.atsScore).toBe(82);
    expect(saved.qualityScore).toBe(76);
  });

  it('clamps out-of-range AI scores to 0-100', async () => {
    aiClient.scoreResume.mockResolvedValue({
      ...aiResult,
      atsScore: 140,
      qualityScore: -5,
    });

    const result = await service.scoreResume('r1');

    expect(result.atsScore).toBe(100);
    expect(result.qualityScore).toBe(0);
  });

  it('falls back to heuristic (scoredBy "heuristic", no suggestions) on AiServiceError', async () => {
    aiClient.scoreResume.mockRejectedValue(
      new AiServiceError('MODEL_ERROR', 'Ollama 500', 500),
    );

    const result = await service.scoreResume('r1');

    expect(result.scoredBy).toBe('heuristic');
    expect(result.suggestions).toEqual([]);
    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
    expect(Object.keys(result.breakdown)).toEqual(
      expect.arrayContaining(['formatting', 'completeness', 'grammar']),
    );
    // Still persisted.
    expect(resumeRepository.save).toHaveBeenCalledTimes(1);
  });

  it('propagates non-AiServiceError (e.g. DB failure), no silent fallback', async () => {
    aiClient.scoreResume.mockRejectedValue(new Error('db exploded'));

    await expect(service.scoreResume('r1')).rejects.toThrow('db exploded');
    expect(resumeRepository.save).not.toHaveBeenCalled();
  });

  it('calculateATSScore / calculateQualityScore delegate to scoreResume', async () => {
    aiClient.scoreResume.mockResolvedValue(aiResult);

    await expect(service.calculateATSScore('r1')).resolves.toBe(82);
    await expect(service.calculateQualityScore('r1')).resolves.toBe(76);
  });
});
