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
