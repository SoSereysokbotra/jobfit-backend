// src/modules/resume/application/services/resume-scorer.service.ts
//
// Heuristic ATS + quality scoring for a parsed resume. Both scores are 0-100 weighted
// composites (see BACKEND_PART2) and are cached back onto Resume.atsScore/qualityScore.
// NOTE: the sub-scores are intentionally simple heuristics — a real scorer would use NLP.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ParsedResumeData as PrismaParsedResumeData } from '@prisma/client';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { Resume } from '../../domain/entities/resume.entity';

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
  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly parsedResumeDataRepository: ParsedResumeDataRepository,
  ) {}

  /** ATS score: 20% formatting + 30% keywords + 20% parsing + 15% length + 15% contact. */
  async calculateATSScore(resumeId: string): Promise<number> {
    const { resume, parsed } = await this.load(resumeId);
    const text = parsed.rawText ?? '';

    const score = Math.round(
      this.scoreFormatting(text) * 0.2 +
        this.scoreKeywords(parsed) * 0.3 +
        this.scoreParsability(parsed) * 0.2 +
        this.scoreLength(text) * 0.15 +
        this.scoreContactInfo(parsed) * 0.15,
    );

    resume.atsScore = score;
    resume.updatedAt = new Date();
    await this.resumeRepository.save(resume);
    return score;
  }

  /** Quality score: 30% content + 25% completeness + 20% grammar + 25% keyword quality. */
  async calculateQualityScore(resumeId: string): Promise<number> {
    const { resume, parsed } = await this.load(resumeId);
    const text = parsed.rawText ?? '';

    const score = Math.round(
      this.scoreContent(parsed) * 0.3 +
        this.scoreCompleteness(parsed) * 0.25 +
        this.scoreGrammar(text) * 0.2 +
        this.scoreKeywordsQuality(parsed) * 0.25,
    );

    resume.qualityScore = score;
    resume.updatedAt = new Date();
    await this.resumeRepository.save(resume);
    return score;
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
