// src/modules/matching/application/services/matching-embedding.status.spec.ts
//
// The 🔴 finding from docs/AI_DEGRADATION_PLAN.md §5: an embedding failure used to be
// invisible AND permanent. embedTexts caught the error, logged a warning and returned
// nulls — no status, no retry, no backfill trigger — so a job ingested during an AI
// outage was silently unmatchable forever, and the only symptom was an empty
// recommendations page indistinguishable from "no jobs match you".
//
// These pin the two halves of the fix: a success says so, and a FAILURE SAYS SO TOO.

import { Logger } from '@nestjs/common';
import { AiServiceError } from '@infra/ai/ai.errors';
import { MatchingEmbeddingService } from './matching-embedding.service';

describe('MatchingEmbeddingService — embedding status', () => {
  let sql: string[];
  let params: unknown[][];
  let prisma: Record<string, unknown>;
  let aiClient: { embed: jest.Mock };

  /** Every raw UPDATE this service issued, newest last. */
  const updates = () => sql.filter((q) => q.includes('UPDATE'));
  const lastUpdate = () => updates()[updates().length - 1] ?? '';

  const build = () => {
    sql = [];
    params = [];
    prisma = {
      $executeRawUnsafe: jest.fn((q: string, ...rest: unknown[]) => {
        sql.push(q);
        params.push(rest);
        return Promise.resolve(1);
      }),
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j1',
          title: 'Backend Engineer',
          description: 'TypeScript and Postgres',
          skills: [],
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'j1', title: 'A', description: 'x', skills: [] },
          { id: 'j2', title: 'B', description: 'y', skills: [] },
        ]),
      },
      profile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          userId: 'u1',
          headline: 'Backend Engineer',
          bio: null,
          desiredIndustries: [],
        }),
      },
      parsedResumeData: { findUnique: jest.fn().mockResolvedValue(null) },
      resume: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    };
    aiClient = { embed: jest.fn() };
    const activeResume = { findActiveResumeId: jest.fn().mockResolvedValue(null) };
    return new MatchingEmbeddingService(
      prisma as never,
      aiClient as never,
      activeResume as never,
    );
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('on success', () => {
    it('writes the vector and the status in ONE statement', async () => {
      const service = build();
      aiClient.embed.mockResolvedValue({ embeddings: [[0.1, 0.2]] });

      await expect(service.embedJob('j1')).resolves.toBe(true);

      // Two writes could leave a vector with a FAILED status, or the reverse — and the
      // column exists precisely to tell the truth about the vector beside it.
      expect(updates()).toHaveLength(1);
      expect(lastUpdate()).toMatch(/"embedding" = \$1::vector/);
      expect(lastUpdate()).toMatch(/"embeddingStatus" = 'SUCCESS'/);
      expect(lastUpdate()).toMatch(/"embeddedAt" = NOW\(\)/);
    });

    it('clears any previous error', async () => {
      const service = build();
      aiClient.embed.mockResolvedValue({ embeddings: [[0.1]] });

      await service.embedCandidate('u1');

      // A row that recovered must not keep advertising a stale reason.
      expect(lastUpdate()).toMatch(/"embeddingError" = NULL/);
    });
  });

  describe('on failure', () => {
    const outage = new AiServiceError('NETWORK', 'fetch failed');

    it('marks the job FAILED with the reason, instead of saying nothing', async () => {
      const service = build();
      aiClient.embed.mockRejectedValue(outage);

      await expect(service.embedJob('j1')).resolves.toBe(false);

      expect(lastUpdate()).toMatch(/"embeddingStatus" = 'FAILED'/);
      // The reason has to survive to the row: "no vector" alone cannot distinguish
      // "never attempted" from "the AI was down".
      expect(params[params.length - 1][0]).toMatch(/NETWORK.*fetch failed/);
    });

    it('marks the candidate FAILED too', async () => {
      const service = build();
      aiClient.embed.mockRejectedValue(outage);

      await expect(service.embedCandidate('u1')).resolves.toBe(false);
      expect(lastUpdate()).toMatch(/"embeddingStatus" = 'FAILED'/);
    });

    it('does NOT wipe an existing vector', async () => {
      const service = build();
      aiClient.embed.mockRejectedValue(outage);

      await service.embedJob('j1');

      // A previously-good embedding is stale, not wrong. Matching on slightly old data
      // beats matching on nothing — the same call as serving stale recommendations.
      expect(lastUpdate()).not.toMatch(/"embedding" =/);
    });

    it('marks every row a batch backfill could not embed', async () => {
      const service = build();
      aiClient.embed.mockRejectedValue(outage);

      const result = await service.embedAllJobs();

      expect(result).toEqual({ embedded: 0, total: 2 });
      // A backfill is where a silent skip does the most damage: it looks like it worked
      // and leaves a subset permanently unmatchable.
      expect(updates()).toHaveLength(2);
      expect(updates().every((q) => /'FAILED'/.test(q))).toBe(true);
    });

    it('does not mark anything when the row itself is missing', async () => {
      const service = build();
      (prisma.job as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);

      await expect(service.embedJob('gone')).resolves.toBe(false);

      // Nothing to record a status against, and inventing a FAILED row would be a lie.
      expect(updates()).toHaveLength(0);
      expect(aiClient.embed).not.toHaveBeenCalled();
    });

    it('survives the status write itself failing', async () => {
      const service = build();
      aiClient.embed.mockRejectedValue(outage);
      (prisma.$executeRawUnsafe as jest.Mock).mockRejectedValue(new Error('db gone'));

      // The contract of this whole path is that an AI outage does not break the caller.
      // Failing to record the failure must not break it either.
      await expect(service.embedJob('j1')).resolves.toBe(false);
    });
  });
});
