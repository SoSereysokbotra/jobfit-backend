#!/usr/bin/env bash
#
# Phase 6 — Cloud Monitoring alert policies → Slack. Applies the JSON policies and attaches
# a Slack notification channel to each.
#
# PREREQUISITE (one-time, Console): create the Slack notification channel —
#   Monitoring → Alerting → Edit notification channels → Slack → Connect (OAuth to your
#   workspace + channel, e.g. #production-alerts). Then grab its id:
#     gcloud beta monitoring channels list --format='value(name,displayName)'
#
# Usage:
#   PROJECT_ID=jobfit-prod SLACK_CHANNEL=projects/jobfit-prod/notificationChannels/123 ./setup-alerts.sh

set -euo pipefail
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
SLACK_CHANNEL="${SLACK_CHANNEL:?set SLACK_CHANNEL (notification channel resource name)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gcloud config set project "$PROJECT_ID" >/dev/null

for policy in alert-policy-error-rate.json alert-policy-latency.json; do
  echo ">> Creating policy from ${policy}"
  gcloud alpha monitoring policies create \
    --policy-from-file="${DIR}/${policy}" \
    --notification-channels="${SLACK_CHANNEL}"
done

echo ">> Done. Re-running creates duplicates — delete the old policy first if updating:"
echo "   gcloud alpha monitoring policies list --format='table(name,displayName)'"
echo
echo "NOTE: readiness failures are enforced by the Cloud Run startup/liveness probes"
echo "(bad revision never receives traffic — see cloudbuild.yaml health-gate). For an"
echo "external readiness alert, add an Uptime Check on /api/v1/health/ready and alert on it."
