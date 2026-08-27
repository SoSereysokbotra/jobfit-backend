// src/modules/matching/application/services/matching-embedding.service.ts
//
// Builds and persists BGE-M3 (1024-dim) embeddings for jobs and candidates.
// - Job vector  = title + description + skills.
// - Candidate vector = profile (headline/bio/industries) + the user's active parsed
//   résumé (summary/skills/experience titles) — their default one where they set it,
//   see ActiveResumeService.
// Vectors are written via raw SQL (Prisma can't read/write the pgvector type).
// Every embed call degrades gracefully: if the AI service is down the item is
// simply left un-embedded (returns false) rather than throwing.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';
import { logAiFallback } from '@infra/ai/ai-degradation.logger';
import { ActiveResumeService } from '../../../resume/application/services/active-resume.service';
import { toExperienceTitles, toStringArray } from '../../domain/parsed-resume-json';

type EmbeddableTable = 'jobs' | 'profiles';

interface JobTextInput {
  title: string;
  description: string;
  skills: { skill: { name: string } }[];
}

interface CandidateResume {
  summary: string | null;
  skills: string[];
  experienceTitles: string[];
}

const MAX_EMBED_CHARS = 8000; // keep prompts bounded
// Ollama embeds inputs sequentially, so a large batch can exceed the 10s embed
// timeout. Keep batches small enough that one /embed call stays well under it.
const JOB_BATCH = 4;

@Injectable()
export class MatchingEmbeddingService {
  private readonly logger = new Logger(MatchingEmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
    private readonly activeResume: ActiveResumeService,
  ) {}

  // ── Single-item embedding (event-driven) ───────────────────────────────────

  /** Embed one job (title + description + skills). Returns false if not embedded. */
  async embedJob(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { skills: { include: { skill: true } } },
    });
    if (!job) return false;

    const [vec] = await this.embedTexts([this.buildJobText(job)]);
    if (!vec) {
      await this.markEmbeddingFailed('jobs', jobId);
      return false;
    }
    await this.storeEmbedding('jobs', jobId, vec);
    return true;
  }

  /** Resolve a résumé's owner and (re-)embed that candidate. */
  async embedCandidateByResume(resumeId: string): Promise<boolean> {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: { userId: true },
    });
    return resume ? this.embedCandidate(resume.userId) : false;
  }

  /** Embed one candidate (profile + active parsed résumé). Returns false if not embedded. */
  async embedCandidate(userId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return false;

    const resume = await this.activeParsedResume(userId);
    const [vec] = await this.embedTexts([this.buildCandidateText(profile, resume)]);
    if (!vec) {
      await this.markEmbeddingFailed('profiles', profile.id);
      return false;
    }
    await this.storeEmbedding('profiles', profile.id, vec);
    return true;
  }

  // ── Backfill (one-off / batch) ─────────────────────────────────────────────

  async embedAllJobs(): Promise<{ embedded: number; total: number }> {
    const jobs = await this.prisma.job.findMany({
      include: { skills: { include: { skill: true } } },
    });
    let embedded = 0;
    for (let i = 0; i < jobs.length; i += JOB_BATCH) {
      const chunk = jobs.slice(i, i + JOB_BATCH);
      const vecs = await this.embedTexts(chunk.map((j) => this.buildJobText(j)));
      for (let k = 0; k < chunk.length; k++) {
        const vec = vecs[k];
        if (vec) {
          await this.storeEmbedding('jobs', chunk[k].id, vec);
          embedded++;
        } else {
          // A batch backfill is where a silent skip does the most damage: it looks like
          // it worked and leaves a subset permanently unmatchable.
          await this.markEmbeddingFailed('jobs', chunk[k].id);
        }
      }
    }
    return { embedded, total: jobs.length };
  }

  async embedAllCandidates(): Promise<{ embedded: number; total: number }> {
    const profiles = await this.prisma.profile.findMany({
      where: { deletedAt: null },
      select: { userId: true },
    });
    let embedded = 0;
    for (const p of profiles) {
      if (await this.embedCandidate(p.userId)) embedded++;
    }
    return { embedded, total: profiles.length };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Embed a batch of texts, preserving index alignment. Empty texts map to null
   * (the AI service rejects empty inputs). On AiServiceError the whole batch
   * returns nulls so callers skip rather than fail.
   */
  private async embedTexts(texts: string[]): Promise<(number[] | null)[]> {
    const out: (number[] | null)[] = texts.map(() => null);
    const idx: number[] = [];
    const inputs: string[] = [];
    texts.forEach((t, i) => {
      const trimmed = t.trim();
      if (trimmed) {
        idx.push(i);
        inputs.push(trimmed);
      }
    });
    if (inputs.length === 0) return out;

    try {
      const res = await this.aiClient.embed(inputs);
      idx.forEach((originalIndex, j) => {
        out[originalIndex] = res.embeddings[j] ?? null;
      });
    } catch (err) {
      if (err instanceof AiServiceError) {
        // The loudest of these in dev: a skipped embedding is not a worse answer, it
        // is NO answer — the row stays unmatchable until something re-embeds it.
        logAiFallback(
          this.logger,
          err,
          'Embedding',
          `skipping ${inputs.length} item(s) — they will not be matchable`,
        );
        // Kept so the CALLER can record why on the row. Without it a row could only say
        // "no vector", which is indistinguishable from "never attempted".
        this.lastEmbedError = `${err.code}: ${err.message}`;
        return out;
      }
      throw err;
    }
    return out;
  }

  private async storeEmbedding(
    table: EmbeddableTable,
    id: string,
    vec: number[],
  ): Promise<void> {
    // pgvector accepts the text form "[1,2,3]"; cast the bound param to ::vector.
    // `table` is a controlled union literal, so interpolating it is safe.
    const literal = `[${vec.join(',')}]`;
    // Vector and status in ONE statement. Two writes could leave a row with a vector and
    // a FAILED status, or the reverse — and the whole point of the column is that it
    // tells the truth about the vector sitting next to it.
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${table}"
          SET "embedding" = $1::vector,
              "embeddingStatus" = 'SUCCESS',
              "embeddedAt" = NOW(),
              "embeddingError" = NULL
        WHERE "id" = $2`,
      literal,
      id,
    );
  }

  /**
   * Record that embedding this row was attempted and did not work.
   *
   * THE VECTOR IS LEFT ALONE ON PURPOSE. A previously-good embedding is stale, not wrong,
   * and matching on slightly old data beats matching on nothing — the same reasoning that
   * makes recommendations serve stale rows rather than an empty page.
   *
   * Best-effort: if even this write fails the original failure is already logged, and
   * throwing from a path whose entire contract is "an AI outage must not break the
   * caller" would defeat the point.
   */
  private async markEmbeddingFailed(
    table: EmbeddableTable,
    id: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${table}"
            SET "embeddingStatus" = 'FAILED',
                "embeddingError" = $1
          WHERE "id" = $2`,
        this.lastEmbedError ?? 'Embedding unavailable',
        id,
      );
    } catch (err) {
      this.logger.error(
        `Could not record embedding failure for ${table}/${id}: ${(err as Error).message}`,
      );
    }
  }

  /** Why the last embedTexts call failed, so markEmbeddingFailed can record it. */
  private lastEmbedError?: string;

  private buildJobText(job: JobTextInput): string {
    const skills = job.skills.map((s) => s.skill.name).join(', ');
    return [job.title, job.description, skills ? `Skills: ${skills}` : '']
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_EMBED_CHARS);
  }

  private buildCandidateText(
    profile: { headline: string | null; bio: string | null; desiredIndustries: string[] },
    resume: CandidateResume | null,
  ): string {
    const parts: string[] = [];
    if (profile.headline) parts.push(profile.headline);
    if (profile.bio) parts.push(profile.bio);
    if (profile.desiredIndustries.length > 0) {
      parts.push(`Industries: ${profile.desiredIndustries.join(', ')}`);
    }
    if (resume?.summary) parts.push(resume.summary);
    if (resume && resume.skills.length > 0) {
      parts.push(`Skills: ${resume.skills.join(', ')}`);
    }
    if (resume && resume.experienceTitles.length > 0) {
      parts.push(`Experience: ${resume.experienceTitles.join('; ')}`);
    }
    return parts.join('\n').slice(0, MAX_EMBED_CHARS);
  }

  private async activeParsedResume(userId: string): Promise<CandidateResume | null> {
    const resumeId = await this.activeResume.findActiveResumeId(userId);
    if (!resumeId) return null;

    const parsed = await this.prisma.parsedResumeData.findUnique({
      where: { resumeId },
    });
    if (!parsed) return null;

    return {
      summary: parsed.summary,
      skills: toStringArray(parsed.skills),
      experienceTitles: toExperienceTitles(parsed.experiences),
    };
  }
}
