// src/modules/resume/application/services/resume-scorer.service.ts
//
// Heuristic ATS + quality scoring for a parsed resume. Both scores are 0-100 weighted
// composites (see BACKEND_PART2) and are cached back onto Resume.atsScore/qualityScore.
// NOTE: the sub-scores are intentionally simple heuristics — a real scorer would use NLP.

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ParsedResumeData as PrismaParsedResumeData } from '@prisma/client';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { Resume } from '../../domain/entities/resume.entity';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';

/** Which path produced the scores — surfaced so callers/analytics can tell them apart. */
export type ScoredBy = 'ai' | 'heuristic';

/**
 * Full scoring result. `atsScore`/`qualityScore` are persisted onto the Resume;
 * `breakdown` and `suggestions` are returned to the caller. `suggestions` is
 * premium content — the presentation layer gates it by subscription tier.
 */
export interface ResumeScoreResult {
  atsScore: number;
  qualityScore: number;
  breakdown: Record<string, number>;
  suggestions: string[];
  scoredBy: ScoredBy;
}

const COMMON_KEYWORDS = [
  'experience',
  'education',
  'skills',
  'project',
  'managed',
  'developed',
  'team',
  'responsible',
  'led',
  'achieved',
  'design',
  'implemented',
];

const ACTION_VERBS = [
  'led',
  'managed',
  'built',
  'developed',
  'designed',
  'launched',
  'improved',
  'created',
  'delivered',
  'achieved',
  'increased',
  'reduced',
];

@Injectable()
export class ResumeScorerService {
  private readonly logger = new Logger(ResumeScorerService.name);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly parsedResumeDataRepository: ParsedResumeDataRepository,
    private readonly aiClient: AiClient,
  ) {}

  /**
   * Score a resume via the AI service (Qwen), falling back to the heuristic
   * composite when the AI service is unavailable. One AI call yields both
   * scores + breakdown + suggestions. Persists ats/quality onto the Resume.
   * Only AiServiceError triggers the fallback; other errors propagate.
   */
  async scoreResume(
    resumeId: string,
    opts?: { targetRole?: string },
  ): Promise<ResumeScoreResult> {
    const { resume, parsed } = await this.load(resumeId);
    const text = parsed.rawText ?? '';

    let result: ResumeScoreResult;
    try {
      const ai = await this.aiClient.scoreResume(text, opts?.targetRole);
      result = {
        atsScore: this.clampScore(ai.atsScore),
        qualityScore: this.clampScore(ai.qualityScore),
        breakdown: ai.breakdown ?? {},
        suggestions: ai.suggestions ?? [],
        scoredBy: 'ai',
      };
    } catch (err) {
      if (!(err instanceof AiServiceError)) throw err;
      this.logger.warn(
        `AI resume scoring unavailable (${err.code}); falling back to heuristic`,
      );
      result = this.heuristicScore(parsed, text);
    }

    resume.atsScore = result.atsScore;
    resume.qualityScore = result.qualityScore;
    resume.updatedAt = new Date();
    await this.resumeRepository.save(resume);
    return result;
  }

  /** ATS score only (persists both). Kept for the single-metric endpoint. */
  async calculateATSScore(resumeId: string): Promise<number> {
    return (await this.scoreResume(resumeId)).atsScore;
  }

  /** Quality score only (persists both). Kept for the single-metric endpoint. */
  async calculateQualityScore(resumeId: string): Promise<number> {
    return (await this.scoreResume(resumeId)).qualityScore;
  }

  /**
   * Heuristic composite (fallback when AI is down):
   * ATS = 20% formatting + 30% keywords + 20% parsing + 15% length + 15% contact.
   * Quality = 30% content + 25% completeness + 20% grammar + 25% keyword quality.
   */
  private heuristicScore(
    parsed: PrismaParsedResumeData,
    text: string,
  ): ResumeScoreResult {
    const formatting = this.scoreFormatting(text);
    const keywords = this.scoreKeywords(parsed);
    const parsability = this.scoreParsability(parsed);
    const length = this.scoreLength(text);
    const contact = this.scoreContactInfo(parsed);
    const atsScore = Math.round(
      formatting * 0.2 +
        keywords * 0.3 +
        parsability * 0.2 +
        length * 0.15 +
        contact * 0.15,
    );

    const content = this.scoreContent(parsed);
    const completeness = this.scoreCompleteness(parsed);
    const grammar = this.scoreGrammar(text);
    const keywordQuality = this.scoreKeywordsQuality(parsed);
    const qualityScore = Math.round(
      content * 0.3 +
        completeness * 0.25 +
        grammar * 0.2 +
        keywordQuality * 0.25,
    );

    return {
      atsScore,
      qualityScore,
      breakdown: {
        formatting,
        keywords,
        parsability,
        length,
        contact,
        content,
        completeness,
        grammar,
        keywordQuality,
      },
      suggestions: [], // heuristic path produces no AI suggestions
      scoredBy: 'heuristic',
    };
  }

  /** Coerce a model-provided score into a safe 0-100 integer. */
  private clampScore(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private async load(
    resumeId: string,
  ): Promise<{ resume: Resume; parsed: PrismaParsedResumeData }> {
    const resume = await this.resumeRepository.findById(resumeId);
    if (!resume) throw new NotFoundException('Resume not found');

    const parsed =
      await this.parsedResumeDataRepository.findByResumeId(resumeId);
    if (!parsed) {
      throw new BadRequestException('Resume has not been parsed yet');
    }
    return { resume, parsed };
  }

  // ── ATS sub-scores ────────────────────────────────────────────────────────────

  private scoreFormatting(text: string): number {
    let score = 0;
    if (/[•\-*]\s/.test(text)) score += 40; // uses bullet points
    if (text.split('\n').filter((l) => l.trim()).length >= 10) score += 30; // structured
    if (!/\n{3,}/.test(text)) score += 30; // no large blank gaps
    return Math.min(100, score);
  }

  private scoreKeywords(parsed: PrismaParsedResumeData): number {
    const text = (parsed.rawText ?? '').toLowerCase();
    const hits = COMMON_KEYWORDS.filter((k) => text.includes(k)).length;
    return Math.round((hits / COMMON_KEYWORDS.length) * 100);
  }

  private scoreParsability(parsed: PrismaParsedResumeData): number {
    return this.ratioScore([
      !!parsed.fullName,
      !!parsed.email,
      !!parsed.phone,
      this.hasItems(parsed.experiences),
      this.hasItems(parsed.skills),
    ]);
  }

  private scoreLength(text: string): number {
    const len = text.length;
    if (len >= 1500 && len <= 6000) return 100; // ~1-2 pages
    if (len < 1500) return Math.round((len / 1500) * 100);
    return Math.max(40, Math.round(100 - ((len - 6000) / 6000) * 60));
  }

  private scoreContactInfo(parsed: PrismaParsedResumeData): number {
    return this.ratioScore([!!parsed.email, !!parsed.phone, !!parsed.location]);
  }

  // ── Quality sub-scores ────────────────────────────────────────────────────────

  private scoreContent(parsed: PrismaParsedResumeData): number {
    return this.ratioScore([
      this.hasItems(parsed.experiences),
      this.hasItems(parsed.educations),
      this.hasItems(parsed.skills),
    ]);
  }

  private scoreCompleteness(parsed: PrismaParsedResumeData): number {
    return this.ratioScore([
      !!parsed.fullName,
      !!parsed.email,
      !!parsed.phone,
      !!parsed.location,
      !!parsed.summary,
      this.hasItems(parsed.experiences),
      this.hasItems(parsed.educations),
      this.hasItems(parsed.skills),
    ]);
  }

  private scoreGrammar(text: string): number {
    let score = 100;
    score -= Math.min(20, (text.match(/ {2,}/g) ?? []).length); // double spaces
    score -= (text.match(/\b(teh|recieve|definately|seperate)\b/gi) ?? []).length * 5;
    score -= Math.min(10, (text.match(/\bi\b/g) ?? []).length); // lone lowercase "i"
    return Math.max(0, Math.round(score));
  }

  private scoreKeywordsQuality(parsed: PrismaParsedResumeData): number {
    const text = (parsed.rawText ?? '').toLowerCase();
    const verbScore = Math.min(
      60,
      ACTION_VERBS.filter((v) => text.includes(v)).length * 10,
    );
    const skillScore = Math.min(40, this.parseArray(parsed.skills).length * 5);
    return verbScore + skillScore;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Parse a JSON-string array column (experiences/educations/skills) safely. */
  private parseArray(json: string | null): string[] {
    if (!json) return [];
    try {
      const parsed: unknown = JSON.parse(json);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private hasItems(json: string | null): boolean {
    return this.parseArray(json).length > 0;
  }

  /** Percentage of truthy checks, rounded to 0-100. */
  private ratioScore(checks: boolean[]): number {
    if (checks.length === 0) return 0;
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }
}
