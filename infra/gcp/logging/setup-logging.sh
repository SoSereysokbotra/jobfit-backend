#!/usr/bin/env bash
#
# Phase 5 — Cloud Logging retention, archive sink, exclusions, and log-based metrics.
#
# Cloud Run already ships the app's JSON stdout to Cloud Logging automatically (Phase 0
# structured logs → `severity`/`message`/`time`/`requestId`/`logging.googleapis.com/trace`).
# This script only configures RETENTION, an ARCHIVE sink, NOISE exclusions, and the
# LOG-BASED METRICS that the dashboards + alert policies read.
#
# Idempotent-ish: safe to re-run; "already exists" errors are ignored.
#
# Usage:
#   PROJECT_ID=jobfit-prod  RETENTION_DAYS=90  ENV=prod  ./setup-logging.sh
# Recommended retention by env: prod=90, staging=30, dev=7.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-northeast1}"          # keep near Cloud Run / (initially) Supabase ap-northeast-1
RETENTION_DAYS="${RETENTION_DAYS:-90}"
ENV="${ENV:-prod}"
SERVICE="${SERVICE:-jobfit-backend}"
BQ_DATASET="${BQ_DATASET:-jobfit_logs_archive}"

echo ">> Project=$PROJECT_ID env=$ENV retention=${RETENTION_DAYS}d region=$REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

# 1) Retention on the default _Default log bucket (hot, searchable logs).
echo ">> Setting _Default bucket retention to ${RETENTION_DAYS}d"
gcloud logging buckets update _Default \
  --location=global \
  --retention-days="${RETENTION_DAYS}" || true

# 2) Cheap long-term ARCHIVE: route everything to BigQuery for SQL analytics / compliance.
echo ">> Creating BigQuery archive dataset + Log Router sink"
bq --location="$REGION" mk --dataset "${PROJECT_ID}:${BQ_DATASET}" 2>/dev/null || true

gcloud logging sinks create jobfit-archive-bq \
  "bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/${BQ_DATASET}" \
  --log-filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\"" \
  --use-partitioned-tables 2>/dev/null || \
  echo "   (sink jobfit-archive-bq already exists — skipping)"

echo "   NOTE: grant the sink's writer identity BigQuery Data Editor:"
echo "   gcloud logging sinks describe jobfit-archive-bq --format='value(writerIdentity)'"

# 3) NOISE exclusions on _Default — keep the hot bucket cheap. Successful health probes are
#    high-volume and low-value; drop 99% of them (BigQuery archive still keeps everything).
echo ">> Adding health-probe exclusion (samples out successful /health checks)"
gcloud logging buckets update _Default --location=global \
  --add-exclusion=name=exclude-health-2xx,filter="resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl=~\"/health/(live|ready)\" AND httpRequest.status<400",description="Drop successful health-probe logs from the hot bucket" \
  2>/dev/null || echo "   (exclusion exclude-health-2xx already exists — skipping)"

# 4) LOG-BASED METRICS — read by the Overview dashboard + Phase 6 alert policies.
echo ">> Creating log-based metrics"

# 4a) Server-error count (severity=ERROR) — powers the error-rate alert (>1% / 5min).
gcloud logging metrics create jobfit_server_errors \
  --description="App server errors (severity=ERROR) from Cloud Run" \
  --log-filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND severity=\"ERROR\"" \
  2>/dev/null || echo "   (metric jobfit_server_errors already exists — skipping)"

# 4b) Redis-degraded readiness signal — surfaces optional-dependency degradation.
gcloud logging metrics create jobfit_redis_degraded \
  --description="Readiness reported Redis/queue degraded" \
  --log-filter="resource.type=\"cloud_run_revision\" AND jsonPayload.redis.degraded=true" \
  2>/dev/null || echo "   (metric jobfit_redis_degraded already exists — skipping)"

echo ">> Done. Verify: Logs Explorer -> run a query from infra/gcp/README.md (query cookbook)."
