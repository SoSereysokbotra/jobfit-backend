// src/modules/matching/application/services/matching-embedding.service.ts
//
// Builds and persists BGE-M3 (1024-dim) embeddings for jobs and candidates.
// - Job vector  = title + description + skills.
// - Candidate vector = profile (headline/bio/industries) + latest parsed résumé
//   (summary/skills/experience titles).
// Vectors are written via raw SQL (Prisma can't read/write the pgvector type).
// Every embed call degrades gracefully: if the AI service is down the item is
// simply left un-embedded (returns false) rather than throwing.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';

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
    if (!vec) return false;
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

  /** Embed one candidate (profile + latest parsed résumé). Returns false if not embedded. */
  async embedCandidate(userId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return false;

    const resume = await this.latestParsedResume(userId);
    const [vec] = await this.embedTexts([this.buildCandidateText(profile, resume)]);
    if (!vec) return false;
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
        this.logger.warn(
          `Embedding unavailable (${err.code}); skipping ${inputs.length} item(s)`,
        );
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
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "embedding" = $1::vector WHERE "id" = $2`,
      literal,
      id,
    );
  }

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

  private async latestParsedResume(userId: string): Promise<CandidateResume | null> {
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!resume) return null;

    const parsed = await this.prisma.parsedResumeData.findUnique({
      where: { resumeId: resume.id },
    });
    if (!parsed) return null;

    return {
      summary: parsed.summary,
      skills: toStringArray(parsed.skills),
      experienceTitles: toExperienceTitles(parsed.experiences),
    };
  }
}

// ── JSON-column helpers (shared shape with the resume DTO) ─────────────────────

function parseJson(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function toStringArray(json: string | null): string[] {
  const v = parseJson(json);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Experience entries may be AI objects ({title,...}) or heuristic raw strings. */
function toExperienceTitles(json: string | null): string[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (item && typeof item === 'object') {
        const title = (item as Record<string, unknown>).title;
        return typeof title === 'string' ? title : '';
      }
      return typeof item === 'string' ? item : '';
    })
    .filter((t) => t.length > 0);
}
