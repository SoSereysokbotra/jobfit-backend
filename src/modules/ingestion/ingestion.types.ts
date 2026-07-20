// src/modules/ingestion/ingestion.types.ts
//
// Source-agnostic shapes for the job-ingestion pipeline (FR-JOBS-001). A source
// adapter fetches + normalizes to NormalizedJob; the service persists them and
// returns an IngestionResult summary.

export type JobSource = 'THEMUSE';

/** A normalized, source-agnostic job ready to persist. */
export interface NormalizedJob {
  source: JobSource;
  /** The source's own job id — the dedup/update key together with `source`. */
  externalId: string;
  title: string;
  companyName: string;
  description: string;
  location: string | null;
  /** "REMOTE" | "ON_SITE" (sources rarely distinguish HYBRID). */
  remoteType: string;
  /** Apply / landing page on the source. */
  externalUrl: string | null;
}

/** A stored, externally-ingested job (for the employer "Imported Jobs" view). */
export interface ImportedJob {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  remoteType: string;
  source: string;
  externalId: string;
  externalUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

/** Summary returned by an ingestion run. */
export interface IngestionResult {
  source: JobSource;
  /** Raw postings pulled from the source. */
  fetched: number;
  /** New jobs inserted. */
  created: number;
  /** Existing jobs (matched by source+externalId) refreshed. */
  updated: number;
  /** Postings dropped by data-quality checks (missing required fields). */
  skipped: number;
  errors: string[];
  ranAt: string;
}
