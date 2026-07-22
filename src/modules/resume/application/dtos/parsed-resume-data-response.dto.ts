// src/modules/resume/application/dtos/parsed-resume-data-response.dto.ts
//
// API response projection of ParsedResumeData. The DB stores experiences/
// educations/skills/certifications as JSON strings whose *shape* depends on who
// produced them: the AI service returns structured objects, the heuristic
// fallback returns raw section lines (plain strings). This DTO deserializes both
// into one UI-friendly shape so the frontend never has to branch on origin.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ParsedResumeData as PrismaParsedResumeData } from '@prisma/client';

export interface ExperienceView {
  company: string;
  title: string;
  dates?: string;
}

export interface EducationView {
  institution: string;
  degree: string;
  dates?: string;
}

export class ParsedResumeDataResponseDto {
  @ApiPropertyOptional()
  fullName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  location?: string;

  @ApiPropertyOptional()
  summary?: string;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiProperty()
  experiences: ExperienceView[];

  @ApiProperty()
  educations: EducationView[];

  @ApiProperty({ type: [String] })
  certifications: string[];

  @ApiPropertyOptional({
    enum: ['ai', 'heuristic'],
    description: 'Which pipeline produced the data.',
  })
  parsedBy?: string;

  constructor(p: PrismaParsedResumeData) {
    this.fullName = p.fullName ?? undefined;
    this.email = p.email ?? undefined;
    this.phone = p.phone ?? undefined;
    this.location = p.location ?? undefined;
    this.summary = p.summary ?? undefined;
    this.skills = toStringArray(p.skills);
    this.experiences = toExperiences(p.experiences);
    this.educations = toEducations(p.educations);
    this.certifications = toStringArray(p.certifications);
    this.parsedBy = p.parsedBy ?? undefined;
  }
}

// ── JSON-column helpers ────────────────────────────────────────────────────────

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

/** "2021-01 — Present" / "2021-01 — 2023-04" / undefined, from AI start/end dates. */
function formatDates(start?: unknown, end?: unknown): string | undefined {
  const s = typeof start === 'string' && start ? start : undefined;
  const e = typeof end === 'string' && end ? end : undefined;
  if (s && e) return `${s} — ${e}`;
  if (s) return `${s} — Present`;
  return e;
}

function toExperiences(json: string | null): ExperienceView[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v.map((item) => {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return {
        company: typeof o.company === 'string' ? o.company : '',
        title: typeof o.title === 'string' ? o.title : '',
        dates: formatDates(o.startDate, o.endDate),
      };
    }
    // Heuristic fallback stored a raw section line.
    return { company: '', title: typeof item === 'string' ? item : '' };
  });
}

function toEducations(json: string | null): EducationView[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v.map((item) => {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const year = o.graduationYear;
      return {
        institution: typeof o.institution === 'string' ? o.institution : '',
        degree: typeof o.degree === 'string' ? o.degree : '',
        dates: year != null ? String(year) : undefined,
      };
    }
    return { institution: typeof item === 'string' ? item : '', degree: '' };
  });
}
