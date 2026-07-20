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
