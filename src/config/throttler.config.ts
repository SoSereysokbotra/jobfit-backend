// src/config/throttler.config.ts
//
// Named @nestjs/throttler configs, registered globally via ThrottlerModule.forRoot()
// in app.module.ts. No global ThrottlerGuard is applied — each route opts in with a
// named limiter, e.g. @RateLimit(THROTTLERS.login.name) + @UseGuards(ThrottlerGuard).
//
// TWO FAMILIES, TWO SUBJECTS.
//
//   auth.*  — tracked by IP, guarded by the stock ThrottlerGuard. Correct there: the
//             whole point of a login limiter is to stop someone who does NOT yet have
//             an account, so there is no user to key on.
//   ai.*    — tracked by USER, guarded by AiThrottlerGuard. The question these answer
//             is "what is the most one signed-up account can cost us in an hour"
//             (MENTOR_REVIEW_2026-08-18 §11), and an IP is the wrong subject for it:
//             a shared office NAT is one IP with fifty honest users, while one abusive
//             account is one user across a dozen IPs.
//
// ⚠️ AUTH VALUES ARE PLACEHOLDERS. The "Authentication System — coorad-backend" doc was
// not provided, so those ttl/limit numbers are sensible defaults, NOT the doc's exact
// figures. The AI values below are reasoned from real usage and stated per limiter.

import { ThrottlerOptions } from '@nestjs/throttler';

const MIN = 60 * 1000; // one minute in ms (throttler v6 ttl is milliseconds)
const HOUR = 60 * MIN;

// The auth throttlers track by IP. In local development the browser and any test/curl
// traffic all share 127.0.0.1, so the production-grade limits below get exhausted in
// minutes — and a throttled silent refresh (POST /auth/refresh-token) then looks like
// a logout. So outside production we scale the limits up massively (effectively off).
// Production MUST set NODE_ENV=production to get the real limits.
const IS_PROD = process.env.NODE_ENV === 'production';
const SCALE = IS_PROD ? 1 : 1000;

// Single source of truth: name + limits per limiter.
export const THROTTLERS = {
    // ── Auth (per IP) ─────────────────────────────────────────────────────────
    register: { name: 'registerRateLimiter', ttl: 60 * MIN, limit: 5 * SCALE },
    verifyCode: { name: 'verifyCodeRateLimiter', ttl: 15 * MIN, limit: 10 * SCALE },
    resend: { name: 'resendRateLimiter', ttl: 15 * MIN, limit: 3 * SCALE },
    passwordReset: { name: 'passwordResetRateLimiter', ttl: 60 * MIN, limit: 5 * SCALE },
    login: { name: 'loginRateLimiter', ttl: 15 * MIN, limit: 10 * SCALE },
    refreshToken: { name: 'refreshTokenRateLimiter', ttl: 15 * MIN, limit: 30 * SCALE },
    logout: { name: 'logoutRateLimiter', ttl: 15 * MIN, limit: 20 * SCALE },

    // ── AI / GPU (per USER) ───────────────────────────────────────────────────
    // Every route these guard reaches an LLM, an embedding model, or a paid API.
    // Before this existed, all of them were authenticated and unlimited.

    /**
     * Long-form generation: cover letters and interview prep, web and extension.
     * The most expensive call in the product — a full generation per request, no cache.
     * A real user writes a handful of cover letters a day, so 10/hour is generous and
     * still bounds the cost.
     */
    aiGenerate: { name: 'aiGenerateRateLimiter', ttl: HOUR, limit: 10 * SCALE },

    /**
     * POST /match-report — the worst case in the review: requirement extraction over
     * up to 20,000 caller-supplied characters, plus a résumé score, plus an embed.
     *
     * ⚠️ THIS ONE SPENDS REAL MONEY. Requirement extraction is the `job_requirements`
     * task, which `jobfits-ai-service` routes to DeepSeek by default — a metered third
     * party, not our own GPU (see docs/EXTENSION_PRIVACY_FACTS.md). 30/hour covers a
     * heavy browsing session, and re-opening the same posting is free (the service
     * dedupes on a description hash) so the limit is only reached by genuinely new
     * postings.
     */
    aiReport: { name: 'aiReportRateLimiter', ttl: HOUR, limit: 30 * SCALE },

    /**
     * Résumé upload + every scoring route. `scoreResume` is an unconditional LLM call
     * with NO caching — `/ats-score`, `/quality-score`, `/scores` and `POST /:id/score`
     * all re-run it, so a client polling any of them is an open tap. Scoring the same
     * résumé twenty times in an hour is already a bug, not a use case.
     */
    aiResume: { name: 'aiResumeRateLimiter', ttl: HOUR, limit: 20 * SCALE },

    /**
     * GET /recommendations/by-job — one embed per external job the extension sees.
     * The cheapest AI call here, and the most frequent: it fires per job page viewed,
     * so this has to be generous or normal browsing breaks. 120/hour is 2/minute
     * sustained, well above human reading speed.
     */
    aiMatch: { name: 'aiMatchRateLimiter', ttl: HOUR, limit: 120 * SCALE },

    /**
     * GET /recommendations. Mostly a cache read — but since §6 a stale row triggers a
     * recompute ON THE READ PATH, and that includes the LLM rerank. So the cheap case
     * is very cheap and the expensive case is the most expensive thing we do. 60/hour
     * is far above what the page needs and still caps the recompute path.
     */
    aiRecommendations: {
        name: 'aiRecommendationsRateLimiter',
        ttl: HOUR,
        limit: 60 * SCALE,
    },
} as const;

/**
 * THE CEILING, which is the thing the review actually asked for.
 *
 * "What is the most money one signed-up user can cost you in an hour?" used to have no
 * answer. Per user per hour it is now:
 *
 *   aiGenerate         10 requests × 1 LLM generation   =  10 generations
 *   aiReport           30 requests × ≤3 AI calls        =  90 calls (incl. paid DeepSeek)
 *   aiResume           20 requests × 1 LLM score        =  20 scores
 *   aiRecommendations  60 requests × ≤1 embed + rerank  = 120 calls (worst case)
 *   aiMatch           120 requests × 1 embed            = 120 embeds (cheap)
 *
 * Multiply by your per-call cost to get a number. It is not a small ceiling — it is a
 * ceiling, which is the entire difference from before.
 *
 * ⚠️ PER INSTANCE, NOT PER CLUSTER. The default ThrottlerStorage is in-memory, so on
 * Cloud Run with N instances the real ceiling is N× the above. That still bounds cost
 * by a constant factor instead of leaving it unbounded, and it is honest to say so
 * rather than imply a global limit. Making it exact needs a shared store
 * (@nestjs/throttler-storage-redis — `ioredis` is already a dependency), which is a
 * deliberate follow-up, not an oversight.
 */
export const AI_THROTTLER_NAMES = [
    THROTTLERS.aiGenerate.name,
    THROTTLERS.aiReport.name,
    THROTTLERS.aiResume.name,
    THROTTLERS.aiMatch.name,
    THROTTLERS.aiRecommendations.name,
] as const;

export const authThrottlers: ThrottlerOptions[] = Object.values(THROTTLERS).map(
    (t) => ({ name: t.name, ttl: t.ttl, limit: t.limit }),
);
