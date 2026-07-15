import { registerAs } from '@nestjs/config';
import type { LogFormat } from './logger.config';

export default registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',

    // Logging (Phase 0). Defaults derive from NODE_ENV: human-readable in dev,
    // GCP-structured JSON everywhere else.
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logFormat: (process.env.LOG_FORMAT ??
      (nodeEnv === 'development' ? 'pretty' : 'json')) as LogFormat,
  };
});
