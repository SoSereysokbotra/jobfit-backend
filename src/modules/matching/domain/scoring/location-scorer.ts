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

  const jobLoc = job.location ?? '';
  const cityMatch = !!candidate.city && mentionsPlace(jobLoc, candidate.city);
  const countryMatch = !!candidate.country && mentionsPlace(jobLoc, candidate.country);

  if (cityMatch) return 100;
  if (countryMatch) return 80;

  // On-site/hybrid with no geographic overlap.
  if (candidate.desiredRemoteTypes.includes('REMOTE')) return 40; // wants remote, isn't
  if (!candidate.city && !candidate.country) return 50; // candidate location unknown
  return 55;
}

/**
 * Does a job's location string name this place?
 *
 * WHOLE WORDS ONLY, and this is the whole point. A plain `includes()` matched the
 * candidate's two-letter country code INSIDE longer place names: a profile with country
 * "CA" scored 80 ("country match") against every job in **Ca**mbodia, and would do the
 * same for **Ca**nada, **Ca**meroon and Casablanca. Measured 2026-08-12 — a San
 * Francisco profile was reported as a country match for Phnom Penh.
 *
 * Word boundaries fix that without a geo database: "CA" still matches the standalone
 * "CA" in "San Francisco, CA", and no longer matches inside "Cambodia". Multi-word
 * places ("United States", "Phnom Penh") work unchanged because the phrase is matched as
 * a unit.
 */
function mentionsPlace(jobLocation: string, place: string): boolean {
  const trimmed = place.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `\b` is meaningless beside a non-word character, so only anchor the ends that are
  // word characters (keeps places like "Washington D.C." matchable).
  const left = /^\w/.test(trimmed) ? '\\b' : '';
  const right = /\w$/.test(trimmed) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, 'i').test(jobLocation);
}
