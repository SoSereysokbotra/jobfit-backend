// Verifies the AI-parsing seam in ResumeParserService:
//  - AI service up   -> structured data from AI, parsedBy: "ai"
//  - AiServiceError  -> the job FAILS. There is no heuristic fallback: structuring is
//    AI-only, so an AI outage must be visible rather than silently degraded.
// pdf.js is mocked so no real PDF bytes are needed.

// pdf.js is mocked with positioned text items — the same shape the real library
// returns — so the service's reading-order path runs without real PDF bytes.
// One item per visual row, descending y (PDF origin is bottom-left).
const textItem = (str: string, y: number) => ({
  str,
  transform: [10, 0, 0, 10, 50, y],
  width: str.length * 5,
  height: 10,
});

jest.mock(
  'pdfjs-dist/legacy/build/pdf.js',
  () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [
              textItem('John Smith', 700),
              textItem('john.smith@example.com', 685),
              textItem('Skills', 670),
              textItem('Go, Kubernetes', 655),
            ],
          }),
        }),
        destroy: async () => undefined,
      }),
    }),
  }),
  { virtual: true },
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

  it('FAILS the job on AiServiceError — no heuristic fallback', async () => {
    aiClient.parseResume.mockRejectedValue(
      new AiServiceError('MODEL_TIMEOUT', 'Ollama did not respond', undefined),
    );

    await service.parseResume('r1', 'unused', 'PDF');

    // Nothing is persisted: a partial/approximate parse is worse than none, because
    // downstream consumers cannot tell it apart from a real one.
    expect(parsedRepo.save).not.toHaveBeenCalled();
    expect(parsedRepo.updateParsingStatus).toHaveBeenLastCalledWith(
      'r1',
      'FAILED',
      'Ollama did not respond',
    );
    // No ResumeParsedEvent — there is no parsed resume to announce.
    expect(eventBus.publish).not.toHaveBeenCalled();
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
