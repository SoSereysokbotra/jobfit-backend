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
  industry: string | null; // company.industry
}

export interface SubScores {
  skills: number;
  experience: number;
  location: number;
  salary: number;
  other: number;
}
