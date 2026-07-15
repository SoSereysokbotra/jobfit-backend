# Incident response

A lightweight process for a small team. Goal: detect fast, communicate clearly, resolve, learn.

## Severity levels
| SEV | Meaning | Example | Response |
|-----|---------|---------|----------|
| **SEV-1** | Platform down / data at risk | DB unreachable, all requests 5xx, `/health/ready` failing | Drop everything; all hands |
| **SEV-2** | Major feature broken, many users | Auth or applications failing; error rate ≫ 1% | Immediate owner; fix or roll back within the hour |
| **SEV-3** | Minor / few users, workaround exists | One endpoint erroring; elevated latency | Normal working hours |

## Roles (small team)
- **Incident owner** — one person coordinates (investigate, decide, communicate). Usually
  whoever is on-call / acked the alert.
- Pull in others only as needed.

## Flow
1. **Detect** — Slack alert (`#production-alerts`) or Error Reporting. Ack within 5 min.
2. **Assess** — assign a SEV. Open Error Reporting + the Overview dashboard + Logs Explorer
   ("errors last 1h"). Grab the `requestId`/`userId` from the alert.
3. **Communicate** — post in the incident channel: what, impact, SEV, owner. Update every
   ~15 min for SEV-1/2.
4. **Mitigate first, fix second** — prefer the fastest safe action:
   - bad recent deploy → **roll back** (`gcloud run services update-traffic … --to-revisions=PREV=100`)
   - dependency down → the app is fail-open for Redis; for DB see the runbook
   - follow the matching playbook in [RUNBOOKS.md](RUNBOOKS.md)
5. **Verify recovery** — error rate back < 1%, `/health/ready` 200, dashboards normal, Error
   Reporting issue count stops climbing.
6. **Resolve & communicate** — post "all clear"; mark the Error Reporting issue resolved (it
   tracks resolution per release).

## Post-incident (within 24h, SEV-1/2)
Short write-up: timeline (detect → mitigate → resolve), **MTTD/MTTR**, root cause, user/impact,
and 1–3 concrete prevention actions (test, guard clause, alert tuning). Keep it blameless.

## Useful commands
```bash
gcloud run revisions list --service=jobfit-backend --region=$REGION
gcloud run services update-traffic jobfit-backend --region=$REGION --to-revisions=REVISION=100
gcloud logging read 'severity>=ERROR' --limit=50 --freshness=1h
```
Mute Slack during planned maintenance: set Redis key `alert:suppressed` (see
[../observability/ALERTING.md](../observability/ALERTING.md)).
