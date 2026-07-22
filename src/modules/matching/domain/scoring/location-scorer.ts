// Location match (weight 15%). Remote jobs suit everyone; otherwise reward
// overlap between the candidate's city/country and the job's location string.
// Deterministic, no GPU needed.

import { CandidateContext, JobContext } from './types';

export function scoreLocation(
  candidate: CandidateContext,
  job: JobContext,
): number {
  // A remote job fits any candidate regardless of where they are.
  if (job.remoteType === 'REMOTE') return 100;

  const jobLoc = (job.location ?? '').toLowerCase();
  const cityMatch =
    !!candidate.city && jobLoc.includes(candidate.city.toLowerCase());
  const countryMatch =
    !!candidate.country && jobLoc.includes(candidate.country.toLowerCase());

  if (cityMatch) return 100;
  if (countryMatch) return 80;

  // On-site/hybrid with no geographic overlap.
  if (candidate.desiredRemoteTypes.includes('REMOTE')) return 40; // wants remote, isn't
  if (!candidate.city && !candidate.country) return 50; // candidate location unknown
  return 55;
}
