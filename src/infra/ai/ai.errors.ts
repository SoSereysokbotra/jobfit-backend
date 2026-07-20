/**
 * Error codes the AI service can return in its `{ error: { code, message } }`
 * envelope (BUILD_PLAN.md §4.6), plus two client-side codes for transport
 * failures the service never gets to answer.
 */
export type AiErrorCode =
  // ── Returned by the AI service (envelope) ──
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'MODEL_TIMEOUT'
  | 'MODEL_ERROR'
  | 'INVALID_MODEL_OUTPUT'
  | 'INTERNAL'
  // ── Client-side (never reached the service, or it never replied) ──
  | 'TIMEOUT'
  | 'NETWORK';

/**
 * Thrown by {@link AiClient} for any non-success outcome. Callers catch this to
 * fall back to their heuristic path — an AI failure must never hard-fail a
 * feature (see JobFits_AI_Integration_Plan.md §7).
 *
 * `status` is the HTTP status when the service replied; undefined for
 * client-side TIMEOUT/NETWORK failures.
 */
export class AiServiceError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}
