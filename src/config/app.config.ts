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

    // Service identity (Phase 2). serviceVersion prefers an explicit SERVICE_VERSION
    // (git SHA at build), then Cloud Run's K_REVISION, then 'local'.
    serviceName: process.env.SERVICE_NAME ?? 'jobfit-backend',
    serviceVersion:
      process.env.SERVICE_VERSION ?? process.env.K_REVISION ?? 'local',

    // Metrics (Phase 3). METRICS_ENABLED toggles the /metrics endpoint + HTTP
    // instrumentation; METRICS_TOKEN (optional) gates scrapes when set.
    metricsEnabled: (process.env.METRICS_ENABLED ?? 'true') !== 'false',
    metricsToken: process.env.METRICS_TOKEN || undefined,

    // Tracing (Phase 3 — Cloud Trace). Off unless TRACE_ENABLED=true (keeps local dev
    // free of GCP exporter setup). gcpProjectId is used for the exporter and to build the
    // `logging.googleapis.com/trace` field that links logs to traces.
    traceEnabled: process.env.TRACE_ENABLED === 'true',
    gcpProjectId: process.env.GCP_PROJECT_ID || undefined,
  };
});
