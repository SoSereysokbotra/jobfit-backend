import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ActiveResumeService } from '../../../resume/application/services/active-resume.service';
import { AiClient } from '@infra/ai/ai.client';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';
import { cosineSimilarity } from '../../domain/scoring/skills-scorer';
import { scoreExperience } from '../../domain/scoring/experience-scorer';
import { scoreLocation } from '../../domain/scoring/location-scorer';
import { scoreSalary } from '../../domain/scoring/salary-scorer';
import { scoreOther, weightedMatch } from '../../domain/scoring/weighted-match.calculator';

/**
 * Spread the skills sub-score for EXTERNAL jobs.
 *
 * The job vector is embedded from a very short string ("<title> at <company>
 * <location>") because we never scrape the posting, so BGE-M3 cosines cluster in
 * a narrow band (~0.30–0.55) even for a clearly-relevant role. A linear
 * cosine×100 therefore collapses every job into 30–45% and the badge can't tell
 * a real fit from a poor one. Re-map that band across 0–100 (monotonic, so
 * ranking is preserved) to restore separation.
 */
const SKILLS_COSINE_FLOOR = 0.3;
const SKILLS_COSINE_CEIL = 0.5;
function externalSkillsScore(cosineSim: number): number {
  const t = (cosineSim - SKILLS_COSINE_FLOOR) / (SKILLS_COSINE_CEIL - SKILLS_COSINE_FLOOR);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/**
 * Field-forward blend for external jobs when we have NO company data (the common
 * case — LinkedIn SMEs aren't in our DB). Salary/industry would just be neutral
 * 50s that flatten the total, so we score on the signals we actually have.
 *
 * Skills DOMINATES (75%): for a job we can't compute salary/industry for, the
 * candidate↔role fit IS the answer. Experience is only 10% because for external
 * jobs it's a constant CV-derived value (no per-job requirement), so weighting it
 * heavily just puts a floor under every job and flattens the ranking.
 */
function fieldForwardScore(skills: number, experience: number, location: number): number {
  return Math.round(skills * 0.75 + location * 0.15 + experience * 0.1);
}

/**
 * What the `skills` sub-score reports when it could not be measured.
 *
 * Deliberately mid-scale and deliberately NOT part of any total: consumers key off
 * `semantic: false` and render it as "not computed". Anything nearer 0 or 100 reads as a
 * verdict on a comparison that never ran.
 *
 * MEASURED FAILURE, 2026-08-12 — why there is no total at all in that case. The degraded
 * path used to substitute a "neutral" cosine of 0.5 and score it like a measurement. But
 * 0.5 IS `SKILLS_COSINE_CEIL`, so the remap returned a PERFECT 100, and at 75% of the
 * field-forward blend every unknown job landed in the high 80s/90s: with the AI service
 * down, a Software Engineer's CV scored 95% against a Food & Beverage Manager post and
 * 89% against two other unrelated ones.
 *
 * Reweighting the remaining sub-scores was tried first and is NOT enough — experience and
 * location are generous by construction (a CV with any jobs on it, a role in your city),
 * so the same F&B posting still came out at 92%. Skills is the only component that
 * measures fit to THIS role; without it there is no honest percentage to print, so
 * `score` is null and the UI says so.
 */
const SKILLS_NOT_MEASURED = 50;

/**
 * Score a job the user is looking at on an EXTERNAL site (e.g. a LinkedIn post)
 * against their profile — without that job existing in our database.
 *
 * Why this exists: ingestion only covers TheMuse, and we must never scrape or
 * store third-party listings. So a LinkedIn `externalId` will never match a
 * `Job` row and a lookup-based endpoint would return "not found" for virtually
 * every post the browser extension sees.
 *
 * Instead we score ad hoc, from the identifiers the extension is allowed to
 * send (title, company, and optionally location/remote type):
 *   · skills (40%) — cosine similarity between the candidate's stored profile
 *     vector and a freshly embedded vector for "<title> at <company>".
 *   · experience / location / salary / other — the same deterministic scorers
 *     used by the normal recommendation pipeline.
 *
 * Nothing about the external posting is persisted.
 */

export interface ExternalJobInput {
  title: string;
  company: string | null;
  location: string | null;
  /** "REMOTE" | "HYBRID" | "ON_SITE" — the scorers treat unknown as ON_SITE. */
  remoteType: string | null;
}

export interface ExternalMatchResult {
  /** Null when it could not be computed — see SKILLS_NOT_MEASURED. */
  score: number | null;
  breakdown: SubScores;
  /** False when the semantic part could not be computed (see `skills` caveat). */
  semantic: boolean;
  /**
   * Whether the company was known to us (salary/industry meaningful). Exposed so a caller
   * that REFINES a sub-score — the match report, which reads the posting text and can
   * check a stated years bar — can re-blend through `blendExternal` instead of writing a
   * second copy of the weights.
   */
  companyData: boolean;
}

/**
 * The external total for a set of sub-scores. One definition, used by this use-case and
 * by any caller that improves a sub-score after the fact, so a report can never show
 * sub-scores that don't add up to the number above them.
 */
export function blendExternal(
  breakdown: SubScores,
  opts: { semantic: boolean; companyData: boolean },
): number | null {
  // With no skills measurement there is no honest total to print at all.
  if (!opts.semantic) return null;
  return opts.companyData
    ? weightedMatch(breakdown)
    : fieldForwardScore(breakdown.skills, breakdown.experience, breakdown.location);
}

@Injectable()
export class MatchExternalJobUseCase {
  private readonly logger = new Logger(MatchExternalJobUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
    private readonly activeResume: ActiveResumeService,
  ) {}

  async execute(
    userId: string,
    job: ExternalJobInput,
  ): Promise<ExternalMatchResult | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        city: true,
        country: true,
        desiredRemoteTypes: true,
        minSalary: true,
        maxSalary: true,
        desiredIndustries: true,
      },
    });
    // No profile means we have nothing to match against — the caller turns this
    // into an empty response rather than inventing a score.
    if (!profile) return null;

    const candidate: CandidateContext = {
      city: profile.city,
      country: profile.country,
      desiredRemoteTypes: profile.desiredRemoteTypes,
      minSalary: profile.minSalary,
      maxSalary: profile.maxSalary,
      desiredIndustries: profile.desiredIndustries,
      experienceCount: await this.experienceCount(userId),
    };

    const company = job.company ? await this.findCompany(job.company) : null;

    const jobContext: JobContext = {
      remoteType: job.remoteType ?? 'ON_SITE',
      location: job.location,
      // The external posting's salary is unknown; fall back to what we know
      // about this company's other roles so the salary sub-score isn't blind.
      minSalary: company?.minSalary ?? null,
      maxSalary: company?.maxSalary ?? null,
      industry: company?.industry ?? null,
    };

    const { cosineSim, semantic } = await this.semanticSimilarity(userId, job);

    // Skills spread for the short, title-only external vector (see externalSkillsScore).
    // When the embedding was unavailable there is nothing to spread — see
    // SKILLS_NOT_MEASURED for why this reports a placeholder rather than a score.
    const skills = semantic ? externalSkillsScore(cosineSim) : SKILLS_NOT_MEASURED;
    const breakdown: SubScores = {
      skills,
      experience: scoreExperience(candidate),
      location: scoreLocation(candidate, jobContext),
      salary: scoreSalary(candidate, jobContext),
      other: scoreOther(candidate, jobContext),
    };

    // With company data (salary/industry meaningful) the full calibrated blend applies;
    // without it, field-forward so the total reflects what we actually know.
    const companyData = company !== null;
    const score = blendExternal(breakdown, { semantic, companyData });

    return { score, breakdown, semantic, companyData };
  }

  /**
   * Cosine similarity between the candidate's stored vector and a freshly
   * embedded vector for the external job. Degrades gracefully: if the AI service
   * is down or the candidate has no embedding we report `semantic: false` and
   * fall back to a neutral 0.5, so the deterministic sub-scores still stand.
   */
  private async semanticSimilarity(
    userId: string,
    job: ExternalJobInput,
  ): Promise<{ cosineSim: number; semantic: boolean }> {
    const NEUTRAL = 0.5;
    try {
      const profileVec = await this.readProfileVector(userId);
      if (!profileVec) return { cosineSim: NEUTRAL, semantic: false };

      const text = [job.title, job.company && `at ${job.company}`, job.location]
        .filter(Boolean)
        .join(' ');
      const { embeddings } = await this.aiClient.embed([text]);
      const jobVec = embeddings?.[0];
      if (!jobVec?.length) return { cosineSim: NEUTRAL, semantic: false };

      return { cosineSim: cosineSimilarity(profileVec, jobVec), semantic: true };
    } catch (error) {
      this.logger.warn(
        `External-job embedding failed; falling back to deterministic scores: ${String(error)}`,
      );
      return { cosineSim: NEUTRAL, semantic: false };
    }
  }

  /** pgvector columns are unreadable through Prisma, so pull it as text. */
  private async readProfileVector(userId: string): Promise<number[] | null> {
    const rows = await this.prisma.$queryRaw<{ embedding: string | null }[]>`
      SELECT embedding::text AS embedding FROM profiles WHERE "userId" = ${userId}
    `;
    const raw = rows[0]?.embedding;
    if (!raw) return null;
    // pgvector renders as "[0.1,0.2,...]".
    return raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n));
  }

  /** Resolve a display company name to our Company row (case-insensitive). */
  private async findCompany(name: string) {
    const company = await this.prisma.company.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true, industry: true },
    });
    if (!company) return null;

    // Salary band across this company's published jobs, as a stand-in for the
    // external posting's undisclosed range.
    const agg = await this.prisma.job.aggregate({
      where: { companyId: company.id, status: 'PUBLISHED' },
      _min: { minSalary: true },
      _max: { maxSalary: true },
    });
    return {
      industry: company.industry,
      minSalary: agg._min.minSalary,
      maxSalary: agg._max.maxSalary,
    };
  }

  /**
   * Best-known experience count: structured Experience rows, else résumé-derived.
   * Mirrors RecomputeUserMatchesUseCase so a job scored here and the same job
   * scored by the normal pipeline can't disagree on the experience sub-score.
   */
  private async experienceCount(userId: string): Promise<number> {
    const structured = await this.prisma.experience.count({ where: { userId } });
    if (structured > 0) return structured;

    const resumeId = await this.activeResume.findActiveResumeId(userId);
    if (!resumeId) return 0;
    const parsed = await this.prisma.parsedResumeData.findUnique({
      where: { resumeId },
      select: { experiences: true },
    });
    const json = parsed?.experiences;
    if (!json) return 0;
    try {
      const parsed: unknown = JSON.parse(json);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
}
