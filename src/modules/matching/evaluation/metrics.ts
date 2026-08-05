// Pure information-retrieval metrics for the Phase A eval harness.
//
// Graded relevance mapping (documented in the report): GREAT=2, OK=1, BAD=0.
// A retrieved item that carries no label is treated as relevance 0.
//
// All functions operate on `ranked` — the graded relevances of the retrieved
// items in rank order (best first), already cut to the retrieval depth. `@k`
// applies the cutoff, so with top-k retrieval every metric here is an "@k" metric.

/** Fraction of the known relevant items (grade > 0) that appear in the top-k. */
export function recallAtK(ranked: number[], totalRelevant: number, k: number): number {
  if (totalRelevant <= 0) return 0;
  const hits = ranked.slice(0, k).filter((g) => g > 0).length;
  return hits / totalRelevant;
}

/** Reciprocal rank of the first relevant item within the top-k (0 if none). */
export function reciprocalRankAtK(ranked: number[], k: number): number {
  const idx = ranked.slice(0, k).findIndex((g) => g > 0);
  return idx === -1 ? 0 : 1 / (idx + 1);
}

/** Graded DCG@k: Σ (2^gain − 1) / log2(rank + 1). */
export function dcgAtK(gains: number[], k: number): number {
  return gains
    .slice(0, k)
    .reduce((sum, g, i) => sum + (Math.pow(2, g) - 1) / Math.log2(i + 2), 0);
}

/**
 * nDCG@k with graded gains. `ideal` is the multiset of relevance grades of the
 * candidate's known-labeled items; the ideal DCG is their best possible ordering.
 * Returns 0 when there is nothing relevant to rank.
 */
export function ndcgAtK(ranked: number[], ideal: number[], k: number): number {
  const idcg = dcgAtK([...ideal].sort((a, b) => b - a), k);
  if (idcg === 0) return 0;
  return dcgAtK(ranked, k) / idcg;
}

// ── Correlation (Phase C: LLM fitScore vs human grade) ──────────────────────────

/**
 * Spearman's rank correlation ρ, with mid-ranks for ties.
 *
 * Ties matter here: human grades take only 3 values (GREAT=2/OK=1/BAD=0), so a
 * naive ordinal ranking would be arbitrary. Averaging tied ranks is the standard
 * correction and reduces to Pearson-on-ranks.
 *
 * Returns 0 when either series is constant (ρ is undefined — no variance to
 * correlate), so callers must read it together with `n`.
 */
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  return pearson(rankWithTies(xs), rankWithTies(ys));
}

/** Pearson correlation; 0 when either series has no variance. */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** 1-based ranks ascending; tied values share the average of their ranks. */
export function rankWithTies(values: number[]): number[] {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1; // mid-rank of the tied block, 1-based
    for (let t = i; t <= j; t++) ranks[order[t].i] = avg;
    i = j + 1;
  }
  return ranks;
}
