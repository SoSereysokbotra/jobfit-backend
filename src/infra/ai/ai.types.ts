/**
 * Request/response types for the jobfits-ai-service HTTP contract.
 *
 * Mirrors the AI service's camelCase wire schema (BUILD_PLAN.md §4 /
 * JobFits_AI_Integration_Plan.md §3). Field names must stay in sync with the
 * service's pydantic `CamelModel` schemas.
 */

export type FileType = 'PDF' | 'DOCX';

// ── GET /health ──────────────────────────────────────────────────────────────
export interface AiHealth {
  status: string;
  modelsLoaded: string[];
}

// ── POST /resume/parse ───────────────────────────────────────────────────────
export interface ParseResumeRequest {
  text: string;
  fileType: FileType;
}

export interface ParsedExperience {
  company: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  highlights: string[];
}

export interface ParsedEducation {
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

export interface ParseResumeResponse {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
}

// ── POST /resume/score ───────────────────────────────────────────────────────
export interface ScoreResumeRequest {
  text: string;
  targetRole?: string;
}

export interface ScoreResumeResponse {
  atsScore: number;
  qualityScore: number;
  breakdown: Record<string, number>;
  suggestions: string[];
}

// ── POST /embed ──────────────────────────────────────────────────────────────
export interface EmbedRequest {
  inputs: string[];
}

export interface EmbedResponse {
  model: string;
  dim: number;
  embeddings: number[][];
}

// ── POST /generate/cover-letter ──────────────────────────────────────────────
export interface CoverLetterRequest {
  resumeSummary: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  tone?: string;
}

export interface CoverLetterResponse {
  coverLetter: string;
}

// ── POST /generate/interview ─────────────────────────────────────────────────
export interface InterviewRequest {
  jobTitle: string;
  jobDescription: string;
  level: string;
  kind: 'questions' | 'feedback';
  answer?: string; // required when kind === 'feedback'
}

export interface InterviewQuestion {
  question: string;
  category: string;
  guidance: string;
}

export interface InterviewResponse {
  questions: InterviewQuestion[];
  feedback: string | null;
}

// ── POST /rerank (Phase B) ───────────────────────────────────────────────────
export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankRequest {
  query: string;
  documents: RerankDocument[];
}

export interface RerankScore {
  id: string;
  score: number; // 0-1 relevance
}

export interface RerankResponse {
  scores: RerankScore[];
}

// ── POST /match/reason (Phase C) ─────────────────────────────────────────────
export interface MatchReasonRequest {
  candidateSummary: string;
  jobTitle: string;
  jobDescription: string;
  /** Selects app/prompts/match_reason_<v>.txt on the AI service. Default 'v1'. */
  promptVersion?: string;
}

export interface MatchedRequirement {
  requirement: string;
  /** Should be a verbatim quote from the CV — the faithfulness metric checks it. */
  evidenceFromCv: string;
}

export interface MatchGap {
  requirement: string;
  note: string;
}

export type MatchVerdict = 'strong' | 'possible' | 'weak';

export interface MatchReasonResponse {
  fitScore: number; // 0-1
  matchedRequirements: MatchedRequirement[];
  gaps: MatchGap[];
  verdict: MatchVerdict;
  promptVersion: string;
  /** True when the AI service's deterministic fallback produced this (not model judgement). */
  degraded: boolean;
}
