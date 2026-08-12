// src/modules/match-report/domain/match-report-payload.ts
//
// The stored shape of a match report — what POST /match-report writes into
// `match_reports.payload` and what GET /match-report/:id hands back verbatim.
//
// This is a PUBLISHED CONTRACT: the web page at {WEB_APP}/match-report/{id} renders
// exactly these field names, and reports written today must still render after the
// scorers change. Add fields; do not rename or repurpose them.
//
// Every part is nullable on purpose. A user with no résumé, a user with no profile and
// an AI service that is down are three different partial reports, and each one still has
// to render the sections it CAN answer rather than failing the whole page.

/** A searchability check the résumé either satisfies, partly satisfies, or fails. */
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface SearchabilityCheck {
  label: string;
  status: CheckStatus;
  /** Why it failed / what to do — omitted when the check passes cleanly. */
  hint?: string;
}

/** The job as the extension saw it. Identifiers only — the description is not stored. */
export interface ReportJob {
  externalId: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
}

/** Overall fit, from the same external scorer the extension badge shows. */
export interface ReportMatchRate {
  /**
   * Null when it could not be computed. Skills is the only sub-score that measures fit
   * to THIS role, so when it didn't run there is no honest total — see `semantic`.
   */
  overall: number | null;
  subScores: {
    skills: number;
    experience: number;
    location: number;
    salary: number;
    other: number;
  };
  /**
   * False when the skills sub-score could not use an embedding (no profile vector or
   * the AI service was down). When false, `overall` is null and `subScores.skills` is a
   * placeholder the page renders as "not computed", never as a score.
   */
  semantic: boolean;
  /** What `subScores.experience` actually measured — see ReportExperienceBasis. */
  experience: ReportExperience;
}

/**
 * Which question the experience sub-score answered.
 *
 * REQUIREMENT — the posting stated a years bar and the CV's dates were read: a real
 *   per-job number.
 * CV_DEPTH — no bar stated, or no datable entries, so it falls back to the shared
 *   count-of-entries approximation. That value is the SAME for every job this user looks
 *   at, so the page must not present it as fit to this one.
 */
export type ReportExperienceBasis = 'REQUIREMENT' | 'CV_DEPTH';

export interface ReportExperience {
  basis: ReportExperienceBasis;
  /** Years the posting asks for, when it states a number. */
  requiredYears: number | null;
  /** Years of employment on the CV, overlaps counted once. Null = couldn't date it. */
  candidateYears: number | null;
  /** Null when either side is unknown — "we can't tell" is not "you don't meet it". */
  met: boolean | null;
}

/** ATS readability of the résumé itself — independent of this particular job. */
export interface ReportSearchability {
  atsScore: number;
  /** Sub-scores by name; keys differ between the AI and heuristic scorers. */
  breakdown: Record<string, number>;
  checks: SearchabilityCheck[];
}

/** One keyword row of the hard/soft skills tables. */
export interface ReportSkill {
  skill: string;
  /** Whether the résumé evidences it. */
  inResume: boolean;
  /** How prominently it appears in the posting (occurrences of its key term). */
  count: number;
  /**
   * Present only when `inResume` — which résumé skills carried the match, so a weak
   * PARTIAL match can be overruled by the reader instead of being taken on trust.
   */
  matchedSkills?: string[];
  /** EXACT = the résumé says it verbatim; PARTIAL = only part of the phrase. */
  matchQuality?: 'EXACT' | 'PARTIAL';
}

export interface ReportSkills {
  /**
   * False when requirement extraction was unavailable (AI service down) — the page
   * shows a soft notice instead of an empty table that would read as "no requirements".
   */
  available: boolean;
  hard: ReportSkill[];
  soft: ReportSkill[];
  matchedCount: number;
  missingCount: number;
}

/** Résumé quality + the scorer's actionable fixes. Ungated — the extension has no tiers. */
export interface ReportRecruiterTips {
  qualityScore: number;
  suggestions: string[];
}

export interface ReportResume {
  id: string;
  fileName: string;
  summaryPresent: boolean;
}

export interface MatchReportPayload {
  job: ReportJob;
  /** Null when the user has no profile to match against. */
  matchRate: ReportMatchRate | null;
  /** Null when there is no parsed résumé to score. */
  searchability: ReportSearchability | null;
  skills: ReportSkills;
  /** Null when there is no parsed résumé to score. */
  recruiterTips: ReportRecruiterTips | null;
  /** Null when the user has no parsed résumé — see `needsResume`. */
  resume: ReportResume | null;
  /** True when the report is résumé-less: the page prompts an upload instead of blank cards. */
  needsResume: boolean;
  /** When the report was generated (the scores are a snapshot of this moment). */
  generatedAt: string;
}
