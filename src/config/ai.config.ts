import { registerAs } from '@nestjs/config';

/**
 * AI service (jobfits-ai-service) client config.
 *
 * The backend never talks to Ollama directly — it only calls the FastAPI AI
 * service over HTTP. `serviceUrl` is the versioned base (includes `/api/v1`);
 * the client appends `/health`, `/resume/parse`, etc. to it.
 *
 * Timeouts split by workload: generation/parsing is slow (LLM), embedding and
 * health are fast. See JobFits_AI_Integration_Plan.md §3.6 / §6.
 */
export default registerAs('ai', () => ({
  serviceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000/api/v1',
  serviceKey: process.env.AI_SERVICE_KEY ?? '',
  timeoutMsGenerate: parseInt(process.env.AI_TIMEOUT_MS_GENERATE ?? '60000', 10),
  timeoutMsEmbed: parseInt(process.env.AI_TIMEOUT_MS_EMBED ?? '10000', 10),

  /**
   * Rerank gets its OWN budget, much shorter than generate.
   *
   * It used to share `timeoutMsGenerate`, and that is fine until the generate timeout has
   * to be raised for résumé parsing — which it does: parsing measured 73.5s on an
   * RTX 5050, so the local value is 250s. Rerank does NOT belong on that budget, because
   * unlike parsing (a background queue job, where a slow answer is still an answer) it
   * sits on the /recommendations REQUEST PATH. Sharing the number meant a failing rerank
   * could cost a user up to 500s — two attempts at 250s — on a page load.
   *
   * 5s and no retry, deliberately. Rerank is a +20% MRR quality improvement, not a
   * correctness requirement: a failure already degrades to the fused order
   * (recompute-user-matches.use-case.ts), so the worst case of a tight timeout is a
   * slightly worse ranking, never a missing one. A user waiting on a page should never
   * pay more than that for it.
   */
  timeoutMsRerank: parseInt(process.env.AI_TIMEOUT_MS_RERANK ?? '5000', 10),

  /**
   * LLM reranker on the recommendation pipeline (Phase B).
   *
   * ON by default: measured **MRR@10 0.63 → 0.75 (+20%)** on the hand-labelled eval set —
   * the only AI change in this project with a positive measured result behind it.
   *
   * The cost is one extra LLM call per recommendation refresh, so it is a flag rather than
   * a hardcode: if latency or spend becomes a problem it can be turned off without a
   * deploy. A rerank failure already degrades to the fused order, so disabling it changes
   * ranking quality, never availability.
   */
  rerankEnabled: process.env.MATCHING_RERANK_ENABLED !== 'false',
}));
