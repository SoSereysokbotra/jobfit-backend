// Skills/semantic match (weight 40%). BGE-M3 embeddings capture skill + role
// meaning, so the "skills" sub-score is the cosine similarity between the
// candidate and job vectors — semantic overlap, not exact string matching.

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Map a cosine similarity ([-1,1], usually [0,1] for related text) to a 0-100 score. */
export function scoreSkills(cosineSim: number): number {
  return Math.round(Math.max(0, Math.min(1, cosineSim)) * 100);
}
