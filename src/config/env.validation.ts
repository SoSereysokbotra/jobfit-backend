import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  CORS_ORIGIN: z.string().optional(),

  // Database
  DATABASE_URL: z.string().url(),

  // ── Auth (self-managed JWT) ──────────────────────────────────────────────
  // JWT_SECRET signs access tokens; JWT_REFRESH_SECRET (optional) signs refresh
  // tokens and falls back to JWT_SECRET when unset.
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().optional(),

  // ── Email (SMTP) — optional; auth flows fail open if not configured ───────
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // ── Supabase (optional — only used by storage/search infra, not auth) ─────
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_BUCKET_RESUMES: z.string().optional(),
  SUPABASE_BUCKET_COMPANY_LOGOS: z.string().optional(),
  SUPABASE_BUCKET_JOB_ATTACHMENTS: z.string().optional(),

  // ── Redis (used by auth for blacklist / lockout / cache) ──────────────────
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_PREFIX: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment variables at startup.
 * Used as the `validate` option in ConfigModule.forRoot().
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    console.error(
      '❌  Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    throw new Error('Invalid environment variables. Check server logs for details.');
  }

  return parsed.data;
}
