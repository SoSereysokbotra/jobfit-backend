# Alerting

Two independent alerting paths, both landing in Slack:

1. **In-app** (`AlertingService`, [`src/modules/alerting/`](../../src/modules/alerting/)) —
   the global exception filter reports every 5xx. It writes a `system_events` row (visible in
   `GET /api/v1/admin/system/alerts`) **and** posts to Slack (`SLACK_WEBHOOK_URL`).
2. **Cloud Monitoring alert policies** ([`infra/gcp/monitoring/`](../../infra/gcp/monitoring/))
   — metric-threshold alerts routed to a Slack notification channel.

## In-app alert rules
| Trigger | system_events type | Severity | Slack |
|---------|--------------------|----------|-------|
| DB / connection failure (5xx) | `DATABASE_ERROR` | CRITICAL | immediate |
| ≥10 server errors / 5 min | `ERROR_RATE_HIGH` | CRITICAL | once per window |

A single non-DB 5xx is **not** its own alert (it's in Error Reporting + counts toward the
rate) — this keeps Slack actionable.

**Anti-fatigue guards** (guide §6):
- **Dedup** — one Slack per fingerprint per 5-min window (Redis; fails **open** so an outage
  never silences alerts).
- **Startup grace** — Slack muted for 60s after boot (deploy noise); the `system_events` row
  is still written.
- **Manual mute** — set a Redis key `alert:suppressed` to silence Slack during maintenance.

## Cloud Monitoring policies
| Policy | Condition | File |
|--------|-----------|------|
| High 5xx error ratio | 5xx / all > 1% for 5m | `alert-policy-error-rate.json` |
| High latency | p95 > 1s for 10m | `alert-policy-latency.json` |
| Readiness failing | Cloud Run probe (auto-rollback) + optional Uptime Check | see `setup-alerts.sh` |

Apply: `PROJECT_ID=… SLACK_CHANNEL=… infra/gcp/monitoring/setup-alerts.sh`
(create the Slack notification channel in the Console first — script header explains).

## Escalation
Small team: alerts → `#production-alerts`. On-call owner acknowledges within 5 min, follows
[../runbooks/INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md). Add PagerDuty as a second
notification channel when the team grows.
