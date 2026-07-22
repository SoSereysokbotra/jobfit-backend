// Verifies the Phase 1 AI-parsing seam in ResumeParserService:
//  - AI service up   -> structured data from AI, parsedBy: "ai"
//  - AiServiceError  -> graceful heuristic fallback, parsedBy: "heuristic", still SUCCESS
// pdf-parse is mocked so no real PDF bytes are needed.

jest.mock('pdf-parse', () =>
  jest.fn(async () => ({
    text: [
      'John Smith',
      'john.smith@example.com',
      'Skills',
      'Go, Kubernetes',
    ].join('\n'),
  })),
);

import { ResumeParserService } from './resume-parser.service';
import { AiServiceError } from '@infra/ai/ai.errors';
import { ParseResumeResponse } from '@infra/ai/ai.types';

describe('ResumeParserService (AI parse + fallback)', () => {
  const resume = { id: 'r1', userId: 'u1', fileName: 'cv.pdf' };

  let resumeRepository: { findById: jest.Mock };
  let parsedRepo: { updateParsingStatus: jest.Mock; save: jest.Mock };
  let storage: { download: jest.Mock };
  let eventBus: { publish: jest.Mock };
  let aiClient: { parseResume: jest.Mock };
  let service: ResumeParserService;

  beforeEach(() => {
    resumeRepository = { findById: jest.fn().mockResolvedValue(resume) };
    parsedRepo = {
      updateParsingStatus: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    storage = { download: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')) };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    aiClient = { parseResume: jest.fn() };

    service = new ResumeParserService(
      resumeRepository as never,
      parsedRepo as never,
      storage as never,
      eventBus as never,
      aiClient as never,
    );
  });

  const aiResult: ParseResumeResponse = {
    fullName: 'Jane Doe',
    email: 'jane@x.com',
    phone: '+85512345678',
    location: 'Phnom Penh, KH',
    summary: 'Backend engineer',
    skills: ['TypeScript', 'NestJS'],
    experiences: [
      {
        company: 'Acme',
        title: 'Backend Dev',
        startDate: '2021-01',
        endDate: null,
        highlights: ['Built microservices'],
      },
    ],
    educations: [
      {
        institution: 'RUPP',
        degree: 'BSc CS',
        fieldOfStudy: 'Computer Science',
        graduationYear: 2020,
      },
    ],
  };

  it('uses the AI result and marks parsedBy: "ai" when the AI service succeeds', async () => {
    aiClient.parseResume.mockResolvedValue(aiResult);

    await service.parseResume('r1', 'unused', 'PDF');

    expect(aiClient.parseResume).toHaveBeenCalledWith(
      expect.stringContaining('John Smith'),
      'PDF',
    );

    const saved = parsedRepo.save.mock.calls[0][0];
    expect(saved.parsedBy).toBe('ai');
    expect(saved.fullName).toBe('Jane Doe'); // AI value, not the heuristic "John Smith"
    // Structured experiences are persisted as JSON, not flattened lines.
    expect(JSON.parse(saved.experiences)[0].company).toBe('Acme');
    expect(JSON.parse(saved.skills)).toEqual(['TypeScript', 'NestJS']);

    expect(parsedRepo.updateParsingStatus).toHaveBeenLastCalledWith('r1', 'SUCCESS');
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('falls back to the heuristic and marks parsedBy: "heuristic" on AiServiceError', async () => {
    aiClient.parseResume.mockRejectedValue(
      new AiServiceError('MODEL_TIMEOUT', 'Ollama did not respond', undefined),
    );

    await service.parseResume('r1', 'unused', 'PDF');

    const saved = parsedRepo.save.mock.calls[0][0];
    expect(saved.parsedBy).toBe('heuristic');
    expect(saved.fullName).toBe('John Smith'); // from the mocked heuristic text
    expect(JSON.parse(saved.skills)).toContain('Go');

    // Fallback is not a failure: status is SUCCESS and the event still fires.
    expect(parsedRepo.updateParsingStatus).toHaveBeenLastCalledWith('r1', 'SUCCESS');
    expect(parsedRepo.updateParsingStatus).not.toHaveBeenCalledWith(
      'r1',
      'FAILED',
      expect.anything(),
    );
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('does NOT swallow non-AI errors (e.g. storage failure) as a fallback', async () => {
    storage.download.mockRejectedValue(new Error('storage down'));

    await service.parseResume('r1', 'unused', 'PDF');

    // No parse happened; the job is recorded FAILED, not silently heuristic.
    expect(parsedRepo.save).not.toHaveBeenCalled();
    expect(parsedRepo.updateParsingStatus).toHaveBeenLastCalledWith(
      'r1',
      'FAILED',
      'storage down',
    );
  });
});
