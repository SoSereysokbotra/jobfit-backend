// Plain inputs the pure scoring functions operate on. The use-case assembles
// these from Profile/Job/Company rows; the scorers stay free of Prisma/IO.

export interface CandidateContext {
  city: string | null;
  country: string | null;
  desiredRemoteTypes: string[]; // RemoteType[] e.g. ["REMOTE","HYBRID"]
  minSalary: number | null;
  maxSalary: number | null;
  desiredIndustries: string[]; // Industry ids
  experienceCount: number; // # of experience entries we know about
}

export interface JobContext {
  remoteType: string; // "REMOTE" | "HYBRID" | "ON_SITE"
  location: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  /**
   * The company's industry NAME, already resolved from the `companies.industry` id.
   *
   * Passing the raw column here is a bug: it holds an Industry id while
   * `CandidateContext.desiredIndustries` holds names, so the two can never match. See
   * scoreOther.
   */
  industry: string | null;
}

export interface SubScores {
  skills: number;
  experience: number;
  location: number;
  salary: number;
  other: number;
}
