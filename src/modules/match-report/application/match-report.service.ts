// src/modules/match-report/application/match-report.service.ts
//
// Composes the full-page match report from parts that already exist: the external match
// scorer (the badge's number), the résumé scorer (ATS + quality + suggestions), the AI
// requirement extractor, and the skill-gap matcher. Nothing here scores anything new —
// this file is wiring, and it stays that way so the report can never disagree with the
// badge about the same job.
//
// EVERY PART DEGRADES INDEPENDENTLY. A user with no profile, a user with no parsed
// résumé and an AI service that is down are three different partial reports; each one
// still renders the sections it can answer. A report that 500s because one dependency
// blinked is worse than a report with one honest gap in it.
//
// NO TIER GATE. The extension has no premium tier, so `suggestions` — which the web
// app's own résumé endpoints gate — is surfaced in full here. That is a deliberate,
// locked product decision, not an oversight.

import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ParsedResumeData } from '@prisma/client';
import { AiClient } from '@infra/ai/ai.client';
import { PrismaService } from '@infra/prisma/prisma.service';
import {
  blendExternal,
  ExternalMatchResult,
  MatchExternalJobUseCase,
} from '@modules/matching/application/use-cases/match-external-job.use-case';
import {
  matchRequirements,
  resumeEvidence,
} from '@modules/matching/application/services/skill-gap.service';
import { ResumeRepository } from '@modules/resume/infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from '@modules/resume/infrastructure/repositories/parsed-resume-data.repository';
import {
  ResumeScorerService,
  ResumeScoreResult,
} from '@modules/resume/application/services/resume-scorer.service';
import { Resume } from '@modules/resume/domain/entities/resume.entity';
import {
  MatchReportPayload,
  ReportMatchRate,
  ReportSearchability,
  ReportSkill,
  ReportSkills,
  SearchabilityCheck,
} from '../domain/match-report-payload';
import { mentionCount, requirementCount, scanSoftSkills } from '../domain/keyword-scan';
import {
  DatedExperience,
  parseYearsRequired,
  scoreYearsAgainstRequirement,
  totalExperienceYears,
} from '../domain/experience-requirement';
import { MatchReportRepository } from '../infrastructure/match-report.repository';

export interface GenerateMatchReportInput {
  externalId: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  /** The visible posting text, used once for extraction and never stored as a listing. */
  jobDescription: string;
}

/** Share of a job title's words that must appear in the résumé to count as present. */
const TITLE_PRESENT_SHARE = 0.6;

/**
 * The dedupe key for a posting's text.
 *
 * Whitespace is normalised first, so the same posting re-rendered with different line
 * wrapping (which job boards do constantly, and which every one of our five site
 * adapters can produce from the same page) still hits the cache. Case is NOT folded —
 * a posting edited from "Junior" to "Senior" must miss.
 *
 * SHA-256 rather than a cheap hash: a collision would serve one posting's report for
 * another, and the cost of the strong hash is invisible next to the LLM call it avoids.
 */
export function hashDescription(description: string): string {
  return createHash('sha256')
    .update(description.replace(/\s+/g, ' ').trim())
    .digest('hex');
}

@Injectable()
export class MatchReportService {
  private readonly logger = new Logger(MatchReportService.name);

  constructor(
    private readonly reports: MatchReportRepository,
    private readonly resumes: ResumeRepository,
    private readonly parsedResumes: ParsedResumeDataRepository,
    private readonly scorer: ResumeScorerService,
    private readonly matchExternalJob: MatchExternalJobUseCase,
    private readonly ai: AiClient,
    private readonly prisma: PrismaService,
  ) {}

  /** Generate + persist a report, returning its id for the web app URL. */
  async generate(userId: string, input: GenerateMatchReportInput): Promise<string> {
    const resume = await this.pickResume(userId);
    const parsed = resume ? await this.parsedResumes.findByResumeId(resume.id) : null;

    // ── Dedupe, BEFORE anything expensive ────────────────────────────────────
    // Re-opening the same posting is the common case and used to cost a full round of
    // AI calls every time (MENTOR_REVIEW_2026-08-18 §11) — including the requirement
    // extraction, which is a metered DeepSeek call by default, not just GPU time.
    //
    // This runs after pickResume only because the freshness bar needs the résumé; it
    // still runs before every AI call, which is the part that matters.
    const descriptionHash = hashDescription(input.jobDescription);
    const cachedId = await this.reports.findReusable({
      userId,
      source: input.source,
      externalId: input.externalId,
      descriptionHash,
      notBefore: await this.inputsChangedAt(userId, resume, parsed),
    });
    if (cachedId) {
      this.logger.debug(
        `Reusing match report ${cachedId} — posting and résumé both unchanged`,
      );
      return cachedId;
    }

    // What the CV evidences, read out of THE RÉSUMÉ THIS REPORT IS ABOUT. Reading the
    // user's newest parse instead would let the report say "scored against cv-2024.pdf"
    // while the skills table came from a different file.
    const resumeSkills = parsed ? resumeEvidence(parsed) : [];

    // Independent of each other and each allowed to fail on its own, so they run
    // together rather than making the user wait for a serial chain of AI calls.
    const [scores, match, requirements] = await Promise.all([
      this.scoreResume(resume, parsed),
      this.matchRate(userId, input),
      this.extractRequirements(input),
    ]);

    const payload: MatchReportPayload = {
      job: {
        externalId: input.externalId,
        source: input.source,
        title: input.title,
        company: input.company,
        location: input.location,
      },
      matchRate: this.withExperienceRequirement(match, input, requirements, parsed),
      searchability: scores ? this.searchability(scores, parsed, input.title) : null,
      skills: this.skillsTable(input.jobDescription, requirements, resumeSkills, parsed),
      recruiterTips: scores
        ? { qualityScore: scores.qualityScore, suggestions: scores.suggestions }
        : null,
      resume: resume
        ? {
            id: resume.id,
            fileName: resume.fileName,
            summaryPresent: !!parsed?.summary?.trim(),
          }
        : null,
      needsResume: parsed === null,
      generatedAt: new Date().toISOString(),
    };

    return this.reports.create({
      userId,
      externalId: input.externalId,
      source: input.source,
      title: input.title,
      company: input.company,
      payload,
      descriptionHash,
    });
  }

  /**
   * The latest moment any INPUT to a report changed, used as the cache freshness bar.
   *
   * A report is one résumé judged against one posting. The description hash pins the
   * posting; this pins the candidate side — the résumé row, its parse, and the profile
   * (which feeds the match score through `profiles.embedding`). A report created before
   * the newest of those is stale and must be regenerated, otherwise uploading a better
   * CV would leave the user staring at a report about the old one.
   *
   * Returns the epoch when there is nothing to compare against — a user with no résumé
   * and no profile has no input that can go stale, so any prior report for the same text
   * is still valid.
   */
  private async inputsChangedAt(
    userId: string,
    resume: Resume | null,
    parsed: ParsedResumeData | null,
  ): Promise<Date> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    const timestamps = [resume?.updatedAt, parsed?.updatedAt, profile?.updatedAt].filter(
      (d): d is Date => d instanceof Date,
    );
    if (timestamps.length === 0) return new Date(0);
    return new Date(Math.max(...timestamps.map((d) => d.getTime())));
  }

  // ── Parts ──────────────────────────────────────────────────────────────────

  /**
   * The résumé the report is about: the user's default one, or — when they never marked
   * a default, or marked one that never parsed — the newest that did parse. Scoring an
   * unparsed résumé would fail, and reporting "no résumé" to someone who has three of
   * them is worse than reporting on the one we can actually read.
   */
  private async pickResume(userId: string): Promise<Resume | null> {
    const preferred = await this.resumes.findDefaultByUserId(userId);
    if (preferred?.parsingStatus === 'SUCCESS') return preferred;

    const all = await this.resumes.findByUserId(userId); // newest first
    return all.find((r) => r.parsingStatus === 'SUCCESS') ?? preferred ?? null;
  }

  /** ATS + quality + suggestions, or null when there is nothing parsed to score. */
  private async scoreResume(
    resume: Resume | null,
    parsed: ParsedResumeData | null,
  ): Promise<ResumeScoreResult | null> {
    if (!resume || !parsed) return null;
    try {
      return await this.scorer.scoreResume(resume.id);
    } catch (error) {
      // The scorer already falls back to heuristics when the AI is down, so reaching
      // here means something structural. The rest of the report is still worth showing.
      this.logger.warn(`Résumé scoring failed for report: ${String(error)}`);
      return null;
    }
  }

  /** The same number the extension badge shows, from the same scorer. */
  private async matchRate(userId: string, input: GenerateMatchReportInput) {
    try {
      const result = await this.matchExternalJob.execute(userId, {
        title: input.title,
        company: input.company,
        location: input.location,
        // The posting's remote type is not among the identifiers the extension reads;
        // the scorers treat unknown as ON_SITE.
        remoteType: null,
      });
      return result;
    } catch (error) {
      this.logger.warn(`External match failed for report: ${String(error)}`);
      return null;
    }
  }

  /**
   * Replace the count-of-entries experience score with a real per-job one, where the
   * posting states a years bar and the CV can be dated.
   *
   * The shared scorer answers "how many jobs are on your CV" (2 entries → 80) and returns
   * that same number for every posting the user opens — see experience-requirement.ts for
   * the measurement. Here we have the description, so the bar can be read out and checked.
   * When either side is unknown the original value stands, labelled CV_DEPTH so the page
   * can say what it is rather than implying a fit it never measured.
   */
  private withExperienceRequirement(
    match: ExternalMatchResult | null,
    input: GenerateMatchReportInput,
    requirements: string[] | null,
    parsed: ParsedResumeData | null,
  ): ReportMatchRate | null {
    if (!match) return null;

    // BOTH the extracted requirements and the raw description. Requirements-only was
    // tried and is unreliable: extraction is an LLM capped at 12 items, so the same
    // Chemical Engineer posting yielded "4+ years of professional chemical engineering
    // experience" on one scan and dropped it on the next — the bar flickered between
    // REQUIREMENT and CV_DEPTH for an unchanged job. The description always holds it, and
    // the requirement-context check is what keeps a benefits-section number out.
    const requiredYears = parseYearsRequired([
      ...(requirements ?? []),
      input.jobDescription,
    ]);
    const candidateYears = totalExperienceYears(datedExperiences(parsed));

    if (requiredYears === null || candidateYears === null) {
      return {
        overall: match.score,
        subScores: match.breakdown,
        semantic: match.semantic,
        experience: { basis: 'CV_DEPTH', requiredYears, candidateYears, met: null },
      };
    }

    const subScores = {
      ...match.breakdown,
      experience: scoreYearsAgainstRequirement(candidateYears, requiredYears),
    };
    return {
      // Re-blended through the scorer's own function, so the total on the page is the
      // total of the rows under it rather than the pre-refinement one.
      overall: blendExternal(subScores, {
        semantic: match.semantic,
        companyData: match.companyData,
      }),
      subScores,
      semantic: match.semantic,
      experience: {
        basis: 'REQUIREMENT',
        requiredYears,
        candidateYears,
        met: candidateYears >= requiredYears,
      },
    };
  }

  /**
   * Requirements read out of the posting, or null when the AI service is unavailable.
   *
   * Null and [] mean different things and must not be collapsed: [] is "this posting
   * states no checkable requirement", which is a real answer, while null is "we could
   * not look" — the page says so instead of showing an empty table.
   */
  private async extractRequirements(
    input: GenerateMatchReportInput,
  ): Promise<string[] | null> {
    try {
      const { requirements } = await this.ai.extractJobRequirements({
        jobTitle: input.title,
        jobDescription: input.jobDescription,
      });
      return requirements;
    } catch (error) {
      this.logger.warn(`Requirement extraction unavailable for report: ${String(error)}`);
      return null;
    }
  }

  /**
   * The hard/soft skills tables.
   *
   * Hard rows are the extracted requirements run through the SAME matcher the skill-gap
   * badge uses (EXACT/PARTIAL and the theme-word guard included). Soft rows are a
   * deterministic scan of the description, because the extractor is told to skip exactly
   * that kind of phrase — see keyword-scan.ts.
   */
  private skillsTable(
    description: string,
    requirements: string[] | null,
    resumeSkills: string[],
    parsed: ParsedResumeData | null,
  ): ReportSkills {
    if (requirements === null) {
      return { available: false, hard: [], soft: [], matchedCount: 0, missingCount: 0 };
    }

    const hard: ReportSkill[] = matchRequirements(requirements, resumeSkills).map(
      (m) => ({
        skill: m.text,
        inResume: m.matchedSkills.length > 0,
        count: requirementCount(m.text, description),
        ...(m.matchedSkills.length > 0
          ? { matchedSkills: m.matchedSkills, matchQuality: m.matchQuality }
          : {}),
      }),
    );

    const soft: ReportSkill[] = scanSoftSkills(description, this.resumeText(parsed, resumeSkills));

    const rows = [...hard, ...soft];
    return {
      available: true,
      hard,
      soft,
      matchedCount: rows.filter((r) => r.inResume).length,
      missingCount: rows.filter((r) => !r.inResume).length,
    };
  }

  /**
   * What the soft-skill scan reads. Raw text rather than the parsed skill list, because
   * "collaborated with a cross-functional team" is where a CV evidences teamwork — it is
   * almost never listed as a skill.
   */
  private resumeText(parsed: ParsedResumeData | null, resumeSkills: string[]): string {
    return [parsed?.rawText ?? '', parsed?.summary ?? '', resumeSkills.join(' ')].join(' ');
  }

  /** ATS score + the pass/warn/fail checks behind it. */
  private searchability(
    scores: ResumeScoreResult,
    parsed: ParsedResumeData | null,
    jobTitle: string,
  ): ReportSearchability {
    return {
      atsScore: scores.atsScore,
      breakdown: scores.breakdown,
      checks: this.checks(parsed, jobTitle),
    };
  }

  /**
   * Per-section checks derived from the parse, not from the score.
   *
   * The score answers "how well does this read to an ATS"; these answer "what exactly is
   * missing" — which is the only half a user can act on. Each one is a fact about the
   * parsed résumé, so a `fail` is always something they can go and fix.
   */
  private checks(parsed: ParsedResumeData | null, jobTitle: string): SearchabilityCheck[] {
    if (!parsed) return [];

    const hasEmail = !!parsed.email?.trim();
    const hasPhone = !!parsed.phone?.trim();
    const contact: SearchabilityCheck =
      hasEmail && hasPhone
        ? { label: 'Contact info', status: 'pass' }
        : hasEmail || hasPhone
          ? {
              label: 'Contact info',
              status: 'warn',
              hint: `Add your ${hasEmail ? 'phone number' : 'email address'} — recruiters filter on it.`,
            }
          : {
              label: 'Contact info',
              status: 'fail',
              hint: 'No email or phone found. An ATS cannot route a résumé it cannot contact.',
            };

    const raw = parsed.rawText ?? '';
    const length = raw.length;

    return [
      contact,
      section('Work experience section', hasEntries(parsed.experiences),
        'No work experience was parsed — check the section heading is a plain "Experience".'),
      section('Education section', hasEntries(parsed.educations),
        'No education was parsed — add a plain "Education" heading with dates.'),
      section('Skills section', hasEntries(parsed.skills),
        'No skills were parsed — list them plainly, one per line or comma-separated.'),
      {
        label: 'Summary section',
        // A missing summary is a weakness, not a parsing failure — an ATS still reads
        // the résumé, so calling it "fail" would overstate the damage.
        status: parsed.summary?.trim() ? 'pass' : 'warn',
        ...(parsed.summary?.trim()
          ? {}
          : { hint: 'Add a 2–3 line summary naming your target role.' }),
      },
      this.titleCheck(raw, jobTitle),
      {
        label: 'Résumé length',
        status: length >= 1500 && length <= 6000 ? 'pass' : 'warn',
        ...(length >= 1500 && length <= 6000
          ? {}
          : {
              hint:
                length < 1500
                  ? 'Short for an ATS to work with — aim for roughly one to two pages.'
                  : 'Longer than two pages; ATS keyword weight is diluted across the extra text.',
            }),
      },
    ];
  }

  /**
   * Does the résumé say the job's title anywhere?
   *
   * Word-level, not phrase-level: "Senior Frontend Engineer" almost never appears
   * verbatim, but a résumé that says neither "frontend" nor "engineer" genuinely is not
   * targeting this job — which is the thing worth telling the user.
   *
   * Judged against the CORE title, never the posting's headline (see coreTitle): nobody
   * writes "[Open for Expat]" on a CV, and quoting the raw headline back at the user made
   * a sound word-level check read like naive exact-phrase matching.
   */
  private titleCheck(resumeText: string, jobTitle: string): SearchabilityCheck {
    const core = coreTitle(jobTitle);
    const words = core
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((w) => w.length >= 3 && !TITLE_FILLER.has(w));
    if (words.length === 0 || !resumeText) {
      return { label: 'Job title present in résumé', status: 'warn' };
    }
    const present = words.filter((w) => mentionCount(w, resumeText) > 0).length;
    const share = present / words.length;
    if (share >= TITLE_PRESENT_SHARE) {
      return { label: 'Job title present in résumé', status: 'pass' };
    }
    return {
      label: 'Job title present in résumé',
      status: present > 0 ? 'warn' : 'fail',
      hint: `Your résumé doesn't use the words "${core}". If this role is what you're targeting, mirroring the posting's own title is the cheapest ATS win there is.`,
    };
  }
}

/** Title words that carry no matching signal on their own. */
const TITLE_FILLER = new Set(['and', 'the', 'for', 'with', 'our', 'you']);

/**
 * Words a posting decorates its title with that say nothing about the ROLE — work mode,
 * contract type, urgency, and the recruiter-speak that gets bolted on for the feed.
 */
const TITLE_DECORATION = new Set([
  'remote', 'hybrid', 'onsite', 'on-site', 'wfh', 'contract', 'contractor',
  'freelance', 'permanent', 'temporary', 'fulltime', 'full-time', 'parttime',
  'part-time', 'internship', 'urgent', 'hiring', 'now', 'new', 'open', 'apply',
  'expat', 'immediate', 'start',
]);

/**
 * The role words out of a LinkedIn headline.
 *
 * Postings decorate titles for the feed — "Food and Beverage Manager [Open for Expat]",
 * "Powerpoint Specialist - Remote", "AI Data Annotator Expert (AI Community) Indonesian
 * Speakers". Scoring a CV against the decoration is scoring it against the recruiter's
 * marketing: no candidate writes "[Open for Expat]", so every one of those words counts
 * as a miss and drags a real signal into noise.
 *
 * Bracketed asides go first, then any dash-separated segment that is ONLY decoration,
 * then stray decoration words. What survives is the role: "Food and Beverage Manager",
 * "Powerpoint Specialist", "AI Data Annotator Expert Indonesian Speakers".
 *
 * A dash segment is dropped only when every word in it is decoration — "Powerpoint
 * Specialist - Remote" loses its tail, "Software Engineer - Backend Systems" keeps it.
 * Falls back to the original headline if stripping would leave nothing.
 */
function coreTitle(jobTitle: string): string {
  const isDecoration = (word: string): boolean =>
    TITLE_DECORATION.has(word.toLowerCase().replace(/[^a-z-]/g, ''));

  const stripped = jobTitle
    .replace(/[[(（{][^\])）}]*[\])）}]/g, ' ') // [Open for Expat], (AI Community)
    .split(/\s*[-–—|·]\s*/)
    .filter((segment, index) => {
      const words = segment.split(/\s+/).filter(Boolean);
      if (words.length === 0) return false;
      return index === 0 || !words.every(isDecoration);
    })
    .join(' ')
    .split(/\s+/)
    .filter((word) => word && !isDecoration(word))
    .join(' ')
    .trim();

  return stripped.length > 0 ? stripped : jobTitle.trim();
}

/** A section is either parsed or it is not — no middle state to report. */
function section(label: string, present: boolean, hint: string): SearchabilityCheck {
  return present
    ? { label, status: 'pass' }
    : { label, status: 'fail', hint };
}

/**
 * The dated employment entries of a parse, for the years calculation.
 *
 * `experiences` is employment only — the parse prompt is explicit that projects and
 * student enrolment go elsewhere — so this is the right column to age. Undated entries
 * are dropped by the caller rather than guessed at.
 */
function datedExperiences(parsed: ParsedResumeData | null): DatedExperience[] {
  if (!parsed?.experiences) return [];
  try {
    const rows: unknown = JSON.parse(parsed.experiences);
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row): row is DatedExperience => !!row && typeof row === 'object',
    );
  } catch {
    return [];
  }
}

/**
 * Did this JSON-array column parse into anything?
 *
 * Deliberately not `toStringArray`: the AI parser writes experiences and educations as
 * OBJECTS, so a string-only reader reports "no work experience" for a résumé that parsed
 * perfectly. The check only asks whether the section came through at all.
 */
function hasEntries(json: string | null): boolean {
  if (!json) return false;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
