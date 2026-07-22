// Experience match (weight 25%). Jobs carry no explicit experience requirement,
// so we approximate seniority signal from how much experience the candidate has
// on record. Deterministic, no GPU needed.

import { CandidateContext } from './types';

export function scoreExperience(candidate: CandidateContext): number {
  const n = candidate.experienceCount;
  if (n <= 0) return 40; // entry / unknown
  if (n === 1) return 65;
  if (n === 2) return 80;
  return 90; // 3+ roles
}
