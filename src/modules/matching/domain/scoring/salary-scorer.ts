// Salary match (weight 10%). Full marks when the job's band overlaps the
// candidate's expected band; graceful partials when it falls short or either
// side is undisclosed. Deterministic, no GPU needed.

import { CandidateContext, JobContext } from './types';

export function scoreSalary(
  candidate: CandidateContext,
  job: JobContext,
): number {
  const noPref = candidate.minSalary == null && candidate.maxSalary == null;
  const undisclosed = job.minSalary == null && job.maxSalary == null;
  if (noPref || undisclosed) return 50; // nothing to compare — neutral

  const cMin = candidate.minSalary ?? 0;
  const cMax = candidate.maxSalary ?? Number.MAX_SAFE_INTEGER;
  const jMin = job.minSalary ?? 0;
  const jMax = job.maxSalary ?? Number.MAX_SAFE_INTEGER;

  // Bands overlap.
  if (jMax >= cMin && jMin <= cMax) return 100;

  // Job pays below the candidate's floor — score by how far below.
  if (jMax < cMin && cMin > 0) {
    const gap = (cMin - jMax) / cMin;
    return Math.max(0, Math.round((1 - gap) * 70));
  }

  // Job floor above the candidate's ceiling (pays more than expected) — still good.
  return 85;
}
