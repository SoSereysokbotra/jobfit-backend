// Job analytics read the match table that HAS data, and report what §13 allows.
//
// MENTOR_REVIEW_2026-08-18 §15. `analytics()` averaged `match_scores`, a table with 0
// rows, no writer on any branch, and a foreign key into `job_seeker_profiles` which was
// also empty — so it was structurally unpopulatable and the employer's "Avg Match" card
// rendered "—" on every request ever made.
//
// It now counts `recommendations` (749 rows) into the confidence bands from §13. Counts
// rather than a restored average, because the score is calibrated for ORDERING (ρ 0.662)
// and its observed range is 41–69 on a scale presented as 0–100 — a mean of those is a
// magnitude claim the evidence does not support.

import { EmployerJobRepository } from './employer-job.repository';

/** Scores chosen against the §13 band edges: ≥57 STRONG, 51–56 POSSIBLE, ≤50 WEAK. */
function build(scores: number[]) {
  const prisma = {
    application: {
      count: jest.fn().mockResolvedValue(scores.length),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    recommendation: {
      findMany: jest.fn().mockResolvedValue(scores.map((score) => ({ score }))),
    },
  };
  return { repo: new EmployerJobRepository(prisma as never), prisma };
}

describe('EmployerJobRepository.analytics — candidate bands', () => {
  it('reads recommendations, not the dropped match_scores table', async () => {
    const { repo, prisma } = build([60]);
    await repo.analytics('job-1');

    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ jobId: 'job-1' }) }),
    );
    // The old table is gone from the schema; nothing may reach for it again.
    expect(prisma).not.toHaveProperty('matchScore');
  });

  it('excludes candidates who dismissed the job', async () => {
    // Someone who rejected this job is not part of its matched pool.
    const { repo, prisma } = build([60]);
    await repo.analytics('job-1');

    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ dismissedAt: null }) }),
    );
  });

  it('counts each score into its band', async () => {
    const { repo } = build([69, 57, 56, 51, 50, 41]);
    const result = await repo.analytics('job-1');

    expect(result.candidateBands).toEqual({ strong: 2, possible: 2, weak: 2 });
  });

  it('reports all zeroes when no candidate has been matched', async () => {
    // Zeroes, not null: "nobody matched yet" is a real answer, and the old null meant
    // "we never computed this" — which was true for a different, worse reason.
    const { repo } = build([]);
    const result = await repo.analytics('job-1');

    expect(result.candidateBands).toEqual({ strong: 0, possible: 0, weak: 0 });
  });

  it('no longer exposes an average anywhere in the result', async () => {
    // The whole point: a mean of a 41–69 score presented as 0–100 is a magnitude claim
    // the calibration does not support (§13).
    const { repo } = build([60, 45]);
    const result = await repo.analytics('job-1');

    expect(result).not.toHaveProperty('averageMatchScore');
  });

  it('keeps the band counts consistent with the number of candidates', async () => {
    const scores = [69, 60, 57, 56, 52, 51, 50, 44, 41];
    const { repo } = build(scores);
    const { strong, possible, weak } = (await repo.analytics('job-1')).candidateBands;

    expect(strong + possible + weak).toBe(scores.length);
  });
});
