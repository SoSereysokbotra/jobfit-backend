import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  // Supavisor/PgBouncer pooling mode — "transaction" for serverless
  poolMode: process.env.DB_POOL_MODE ?? 'transaction',
}));
