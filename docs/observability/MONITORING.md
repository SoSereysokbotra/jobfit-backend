# Monitoring

What we watch and where. Three pillars: **logs** ([LOGGING.md](LOGGING.md)), **metrics**, and
**traces** — all in GCP.

## Health endpoints
| Endpoint | Purpose | Behaviour |
|----------|---------|-----------|
| `GET /api/v1/health/live` | liveness (Cloud Run startup + liveness probes) | 200 while the process responds; no dependency checks |
| `GET /api/v1/health/ready` | readiness (deploy health-gate) | **DB hard-gate → 503 if Postgres down**; Redis + queue are **soft** (always `up`, `degraded:true` when unreachable) |

Redis is fail-open by design, so a Redis outage never fails readiness (Cloud Run keeps
serving). Source: [`src/modules/health/`](../../src/modules/health/).

## Metrics
`GET /api/v1/metrics` (Prometheus format, token-gated by `METRICS_TOKEN`). Source:
[`src/modules/metrics/`](../../src/modules/metrics/).

| Metric | Type | Labels |
|--------|------|--------|
| `http_request_duration_seconds` | histogram | method, route (pattern), status_code |
| `http_requests_total` | counter | method, route, status_code |
| `jobfit_resume_parsing_pending` | gauge | — (resume-parse backlog, collected on scrape) |
| `process_*`, `nodejs_*` | default | — |

Scrape into **Cloud Monitoring** via Google Managed Prometheus (or the Ops Agent). Cloud Run
also emits built-in `run.googleapis.com/*` metrics (request_count, request_latencies,
cpu/memory, instance_count) used by the dashboards without any app setup.

## Dashboards (Cloud Monitoring)
Provisioned by [`infra/gcp/monitoring/setup-dashboards.sh`](../../infra/gcp/monitoring/):
- **JobFit — Overview**: RPS, p95 latency, 5xx, server errors, instances, CPU.
- **JobFit — Service Health**: 5xx error-ratio (1% threshold line), Redis-degraded, startup
  latency, memory.

## Traces
OpenTelemetry → **Cloud Trace** (`TRACE_ENABLED=true`). Each request's latency is broken down
by span; logs carry the trace id (`logging.googleapis.com/trace`) so you can jump log↔trace.
Source: [`src/tracing.ts`](../../src/tracing.ts).

## SLOs (targets)
| Signal | Target |
|--------|--------|
| Availability | 99.9% (readiness up) |
| Error rate | < 1% of requests (5xx) |
| Latency | p95 < 1s |

The error-rate and latency targets are enforced by alert policies
([ALERTING.md](ALERTING.md)).
