// Reciprocal Rank Fusion — combine multiple ranked lists into one, robustly,
// without score normalization. An item's fused score is Σ 1/(k + rank) over each
// list it appears in (rank is 0-based). k dampens the weight of top ranks; 60 is
// the standard default. Items appearing high in multiple lists rise to the top.

export interface FusedItem {
  id: string;
  score: number;
}

export function reciprocalRankFusion(lists: string[][], k = 60): FusedItem[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
