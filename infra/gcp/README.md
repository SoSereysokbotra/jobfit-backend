# JobFit — GCP Observability Infrastructure (Phase 5)

Ready-to-apply config for Cloud Logging + Cloud Monitoring. **Apply after the app is deployed
to Cloud Run (Phase 6)** — dashboards/metrics reference the running `cloud_run_revision`
resource, so there's nothing to graph until traffic exists.

> The app itself needs **no logging agent or drain**: Cloud Run auto-captures its JSON stdout
> into Cloud Logging. Phase 0 already emits the fields Cloud Logging understands —
> `severity` (INFO/WARNING/ERROR/CRITICAL), `message`, ISO `time`, `requestId`, and
> `logging.googleapis.com/trace` (when `TRACE_ENABLED=true`). Verified locally: a line looks like
> `{"severity":"ERROR","time":"…","context":"…","message":"…","requestId":"…"}`.

```
infra/gcp/
├── logging/setup-logging.sh          # retention + BigQuery archive sink + exclusions + log-based metrics
├── monitoring/dashboard-overview.json         # RPS, p95 latency, 5xx, server errors, instances, CPU
├── monitoring/dashboard-service-health.json   # error ratio, Redis-degraded, startup latency, memory
└── monitoring/setup-dashboards.sh    # applies both dashboards (idempotent)
```

## Prerequisites
- `gcloud` + `bq` CLIs, authenticated (`gcloud auth login`), billing-enabled project.
- Roles: `roles/logging.admin`, `roles/monitoring.editor`, `roles/bigquery.admin` (for the archive dataset).

## Apply order
```bash
# 1) Logging: retention, archive, exclusions, log-based metrics
PROJECT_ID=jobfit-prod RETENTION_DAYS=90 ENV=prod ./logging/setup-logging.sh
#   then grant the sink writer identity BigQuery access (the script prints the command)

# 2) Monitoring dashboards (after some traffic exists)
PROJECT_ID=jobfit-prod ./monitoring/setup-dashboards.sh
```

## Retention policy (by environment)
| Env | Hot bucket (`_Default`) retention | Archive |
|-----|-----------------------------------|---------|
| prod | **90 days** | BigQuery (`jobfit_logs_archive`), partitioned |
| staging | 30 days | optional |
| dev | 7 days | none |

Run `setup-logging.sh` with the matching `RETENTION_DAYS` / `ENV` per project.

## Metrics → Cloud Monitoring
Two independent metric sources feed the dashboards:
1. **Cloud Run built-ins** (request count, latencies, CPU/memory, instances) — automatic, no setup.
2. **App `/metrics`** (`prom-client`: `http_request_duration_seconds`, `http_requests_total`,
   `jobfit_resume_parsing_pending`) — scrape into Cloud Monitoring via **Google Managed
   Prometheus** (add a `PodMonitoring`/scrape config pointing at `/metrics`, protected by
   `METRICS_TOKEN`) or the Ops Agent. Cloud Run built-ins already cover the Overview dashboard,
   so this is optional until you want the app-level histograms.

---

## Query cookbook (Logs Explorer)

Paste into Logs Explorer (Console → Logging). This is Phase 5's acceptance — answer any
incident question from one place.

**All logs for one request (the golden thread):**
```
resource.type="cloud_run_revision"
resource.labels.service_name="jobfit-backend"
jsonPayload.requestId="REQUEST_ID_HERE"
```

**All errors in the last hour** (set the time-range picker to "Last 1 hour"):
```
resource.type="cloud_run_revision"
resource.labels.service_name="jobfit-backend"
severity>=ERROR
```

**Everything a specific user hit** (great for support tickets):
```
resource.type="cloud_run_revision"
jsonPayload.userId="USER_ID_HERE"
```

**A specific endpoint's errors:**
```
resource.type="cloud_run_revision"
severity>=ERROR
jsonPayload.req.url=~"/api/v1/admin/.*"
```

**Redis/queue degradation (readiness soft-fail):**
```
resource.type="cloud_run_revision"
jsonPayload.redis.degraded=true
```

**Log → Trace:** open any line with a `logging.googleapis.com/trace` field and click the trace
link to jump to the Cloud Trace waterfall for that request.

### Save these as Log Views / saved queries
Console → Logging → Saved queries → **Save** each of the above as:
`Overview (errors last 1h)`, `Request lookup (by requestId)`, `User lookup (by userId)`.
These are the 3 starter views the plan calls for.

---

## Phase 5 acceptance ✅
- Structured fields parse in Cloud Logging (verified via local JSON shape).
- Retention buckets (per-env) + BigQuery archive sink + noise exclusion configured (`setup-logging.sh`).
- Dashboards: **Overview** + **Service Health** (`setup-dashboards.sh`).
- "Show all logs for requestId X" and "all errors last 1h" answerable from Logs Explorer (cookbook above).

Alert policies (error-rate > 1% / 5min, `/health/ready` failing, queue backlog → Slack) are
**Phase 6** (provisioned alongside the Cloud Build → Cloud Run deploy). The log-based metric
`jobfit_server_errors` created here is what those policies will alert on.
