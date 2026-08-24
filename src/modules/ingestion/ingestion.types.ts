// src/modules/ingestion/ingestion.types.ts
//
// Source-agnostic shapes for the job-ingestion pipeline (FR-JOBS-001). A source
// adapter fetches + normalizes to NormalizedJob; the service persists them and
// returns an IngestionResult summary.

import { $Enums } from '@prisma/client';

/**
 * Boards we ingest from.
 *
 * A union rather than a string so adding a source makes TypeScript point at every
 * place that has to decide what to do about it.
 */
export type JobSource = 'THEMUSE' | 'BONGTHOM' | 'JOBNET';

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

  /**
   * Fields only SOME sources publish. Absent means the source did not say — it must
   * stay absent all the way to the database, never become a default.
   *
   * This is the rule from the employmentType/experienceLevel work: a fabricated value
   * in a column is indistinguishable from an employer's own answer. `persist` writes
   * these only when present, which is why they are optional here rather than nullable
   * with a fallback.
   */
  minSalary?: number | null;
  maxSalary?: number | null;

  /**
   * The units `minSalary`/`maxSalary` are counted in.
   *
   * NO SOURCE EMITS A SALARY TODAY — all 305 ingested postings are silent about pay
   * (verified at 33f7981). These exist so that the first adapter which DOES learn to
   * read pay has to say what the number means, rather than dropping a bare integer into
   * a column and leaving the client to guess (MENTOR_REVIEW_2026-08-18 §12).
   *
   * That guess is not hypothetical: the Cambodian boards quote MONTHLY in the hundreds
   * and TheMuse quotes ANNUAL in the tens of thousands, so "500" from BongThom and "500"
   * from TheMuse are three orders of magnitude apart. An adapter that states amounts and
   * omits these is writing an ambiguous number on purpose.
   */
  salaryCurrency?: string | null;
  salaryPeriod?: $Enums.SalaryPeriod | null;

  employmentType?: $Enums.EmploymentType | null;
}

/**
 * What every board adapter must provide.
 *
 * Before this, `IngestionService` had a method per source (`ingestFromTheMuse`) and
 * named its one adapter in the constructor. Three sources would have meant three
 * near-identical methods and a service that has to be edited for every new board.
 */
export interface JobBoardSource {
  readonly source: JobSource;
  /**
   * Up to `limit` postings, newest first.
   *
   * `limit` is a CEILING, not a target: a source that has fewer returns fewer, and one
   * whose upstream is paginated stops once it has enough. Callers must not assume they
   * got exactly `limit`.
   */
  fetchJobs(limit: number): Promise<NormalizedJob[]>;
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
