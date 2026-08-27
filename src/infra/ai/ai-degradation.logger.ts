// src/infra/ai/ai-degradation.logger.ts
//
// One rule, in one place: WHEN AN AI CALL FAILS AND WE FALL BACK, HOW LOUD IS THAT?
//
// The answer differs by environment, and getting it backwards is the actual bug that
// prompted this file (docs/AI_DEGRADATION_PLAN.md §6, item 1).
//
//   PRODUCTION — quiet. A template cover letter is a working cover letter. Every AI path
//   here degrades to something usable, so a fallback is expected behaviour under load,
//   not an incident. Logging it at `error` would drown the real errors.
//
//   DEVELOPMENT — loud. The AI service is a separate process a developer has to remember
//   to start, and when it is not running EVERY one of these paths silently produces a
//   worse answer: heuristic scores, template letters, un-reranked results, no embedding
//   at all. That is indistinguishable from "my code is broken" — and it wastes hours.
//   We reproduced exactly this: a full session ran against a dead AI service and nothing
//   said so.
//
// So: silent degradation is a production virtue and a development liability, and the code
// used to treat both the same. `warn` everywhere meant nobody noticed in dev and nobody
// could filter in prod.
//
// Deliberately NOT a thrown error in dev. Failing hard would block work that has nothing
// to do with the AI — you must still be able to run the app with no GPU. Loud, not fatal.

import { Logger } from '@nestjs/common';

import { AiServiceError } from './ai.errors';

/**
 * True when a fallback should be shouted about rather than noted.
 *
 * Read from `process.env` rather than injected config so this stays a plain function that
 * any service can call without a constructor change — and because it is a logging
 * decision, not behaviour.
 */
export function aiFailuresAreLoud(): boolean {
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}

/**
 * Report that an AI call failed and something less good is being used instead.
 *
 * @param logger    the calling service's own logger, so the context stays right
 * @param err       the failure — its `code` is the useful half (TIMEOUT vs NETWORK vs
 *                  UNAUTHORIZED point at completely different fixes)
 * @param what      the capability that degraded, e.g. "Embedding"
 * @param fallback  what the user gets instead, e.g. "skipping 12 item(s)"
 */
export function logAiFallback(
  logger: Logger,
  err: unknown,
  what: string,
  fallback: string,
): void {
  const code = err instanceof AiServiceError ? err.code : 'UNKNOWN';
  const detail = err instanceof Error ? err.message : String(err);

  if (!aiFailuresAreLoud()) {
    logger.warn(`${what} unavailable (${code}); ${fallback}`);
    return;
  }

  // In development, say the quiet part: the result the developer is about to look at is
  // NOT what the product produces when the AI is up.
  logger.error(
    `${what} unavailable (${code}); ${fallback}. ` +
      `THIS RESULT IS DEGRADED — the AI service did not answer. ${detail}`,
  );
}
