// src/tracing.ts
//
// Phase 3 — OpenTelemetry → Google Cloud Trace. Imported as the VERY FIRST thing in main.ts
// so instrumentations can patch http/pg/ioredis before those modules are required.
//
// GUARDED: does nothing unless `TRACE_ENABLED=true`. This keeps local dev / CI free of the
// GCP exporter (which needs credentials) — on Cloud Run set TRACE_ENABLED=true + GCP_PROJECT_ID
// (Application Default Credentials via the service account handle auth).
//
// Log↔trace correlation is handled separately by the pino `traceMixin` (logger.config), which
// reads the active span — so logs carry `logging.googleapis.com/trace` when a span is active.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';

let sdk: NodeSDK | undefined;

export function startTracing(): void {
  if (process.env.TRACE_ENABLED !== 'true') return;

  const projectId = process.env.GCP_PROJECT_ID;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME ?? 'jobfit-backend',
      [ATTR_SERVICE_VERSION]:
        process.env.SERVICE_VERSION ?? process.env.K_REVISION ?? 'local',
    }),
    traceExporter: new TraceExporter(projectId ? { projectId } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is extremely noisy and low-value for a web service.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    void sdk?.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

// Self-start on import so instrumentations patch http/pg/ioredis before they're required
// (main.ts imports this first). No-op unless TRACE_ENABLED=true.
startTracing();
