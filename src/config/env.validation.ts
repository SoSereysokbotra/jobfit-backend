import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),

  // Database (Supabase Postgres via Supavisor)
  DATABASE_URL: z.string().url(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_JWT_SECRET: z.string(),

  // Storage buckets (optional — defaults defined in supabase.config.ts)
  SUPABASE_BUCKET_RESUMES: z.string().optional(),
  SUPABASE_BUCKET_COMPANY_LOGOS: z.string().optional(),
  SUPABASE_BUCKET_JOB_ATTACHMENTS: z.string().optional(),

  // Redis (optional at MVP — required once BullMQ queues are wired up)
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment variables at startup.
 * Used as the `validate` option in ConfigModule.forRoot().
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    console.error('❌  Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables. Check server logs for details.');
  }

  return parsed.data;
}
