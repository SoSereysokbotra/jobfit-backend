# JobFit — Deployment (Cloud Build → Cloud Run)

How to ship the backend to Google Cloud. The app is a stateless container; its JSON stdout
feeds Cloud Logging/Error Reporting/Monitoring automatically (see [observability/](observability/)).

## Architecture
```
git push ─▶ Cloud Build (cloudbuild.yaml)
             ├─ docker build (Dockerfile) ─▶ Artifact Registry
             ├─ prisma migrate deploy       (against prod DB, Secret Manager DATABASE_URL)
             ├─ gcloud run deploy --no-traffic --tag candidate
             ├─ health-gate: probe candidate /api/v1/health/ready
             └─ update-traffic --to-latest  (only if healthy)
Cloud Run ─▶ Cloud Logging / Error Reporting / Cloud Monitoring / Cloud Trace
Data ─▶ Supabase Postgres now → Cloud SQL before prod (see the plan, Appendix A)
```

## One-time setup
```bash
PROJECT_ID=jobfit-prod REGION=asia-northeast1

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com cloudtrace.googleapis.com

# Artifact Registry repo
gcloud artifacts repositories create jobfit --repository-format=docker --location=$REGION

# Secrets (values via Secret Manager — never in env/plaintext)
for s in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET SLACK_WEBHOOK_URL METRICS_TOKEN REDIS_URL; do
  gcloud secrets create $s --replication-policy=automatic 2>/dev/null || true
done
# add a version:  printf '%s' 'VALUE' | gcloud secrets versions add DATABASE_URL --data-file=-

# Let the Cloud Run runtime service account read secrets (Workload Identity — no key files)
RUNTIME_SA="$(gcloud iam service-accounts list --format='value(email)' --filter=default-compute)"
for s in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET SLACK_WEBHOOK_URL METRICS_TOKEN REDIS_URL; do
  gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$RUNTIME_SA" \
    --role=roles/secretmanager.secretAccessor
done
# Cloud Build SA needs: run.admin, artifactregistry.writer, iam.serviceAccountUser, secretAccessor
```

## Deploy
Connect the repo as a Cloud Build trigger (branch `main`), or run manually:
```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_REPO=jobfit,_SERVICE=jobfit-backend
```
The pipeline is **health-gated**: a new revision only receives traffic after its
`/api/v1/health/ready` returns 200. If it fails, the build fails and the **previous revision
keeps serving** (effective automatic rollback).

## Runtime config (set by the pipeline)
Non-secret env (via `--set-env-vars`): `NODE_ENV=production`, `LOG_FORMAT=json`,
`LOG_LEVEL=info`, `METRICS_ENABLED=true`, `TRACE_ENABLED=true`, `SERVICE_NAME`,
`SERVICE_VERSION=$SHORT_SHA`, `GCP_PROJECT_ID`.
Secrets (via `--set-secrets`): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`SLACK_WEBHOOK_URL`, `METRICS_TOKEN`, `REDIS_URL`. Full list: [.env.example](../.env.example).

Probes (set on the service): startup + liveness → `/api/v1/health/live`. Readiness is checked
by the pipeline health-gate before promotion.

## Migrations
`prisma migrate deploy` runs as a pipeline step (never `migrate dev`). Additive/backwards-
compatible migrations are safe with the health-gated rollout. For destructive changes, use an
expand→migrate→contract sequence across two deploys.

## Post-deploy (apply the observability config)
```bash
# Logging retention/archive/exclusions + log-based metrics
PROJECT_ID=$PROJECT_ID RETENTION_DAYS=90 ENV=prod infra/gcp/logging/setup-logging.sh
# Dashboards
PROJECT_ID=$PROJECT_ID infra/gcp/monitoring/setup-dashboards.sh
# Alert policies → Slack (create the Slack channel first; see the script header)
PROJECT_ID=$PROJECT_ID SLACK_CHANNEL=<channel-resource-name> infra/gcp/monitoring/setup-alerts.sh
```

## Rollback
```bash
# List revisions, shift traffic back to a known-good one
gcloud run revisions list --service=jobfit-backend --region=$REGION
gcloud run services update-traffic jobfit-backend --region=$REGION --to-revisions=REVISION=100
```

## Database: Supabase → Cloud SQL
Runs on Supabase Postgres today; migrate to Cloud SQL before real production traffic
(latency, private IP, IAM auth). Step-by-step: **Appendix A** of
[PRODUCTION_MONITORING_IMPLEMENTATION_PLAN](product%20design/PRODUCTION_MONITORING_IMPLEMENTATION_PLAN.md).

## Local production-parity smoke test
```bash
docker build -t jobfit-backend:local .
docker run --rm -p 8080:8080 --env-file .env -e PORT=8080 -e LOG_FORMAT=json jobfit-backend:local
curl localhost:8080/api/v1/health/ready
```
