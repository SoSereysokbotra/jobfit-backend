#!/usr/bin/env bash
#
# Phase 5 — apply the Cloud Monitoring dashboards. Re-running creates duplicates, so this
# deletes any existing dashboard with the same displayName first.
#
# Usage:  PROJECT_ID=jobfit-prod ./setup-dashboards.sh

set -euo pipefail
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gcloud config set project "$PROJECT_ID" >/dev/null

apply() {
  local file="$1" name="$2"
  # Remove existing dashboard(s) with this displayName (idempotent apply).
  gcloud monitoring dashboards list --format="value(name)" \
    --filter="displayName=\"${name}\"" 2>/dev/null | while read -r id; do
    [ -n "$id" ] && gcloud monitoring dashboards delete "$id" --quiet || true
  done
  echo ">> Creating dashboard: ${name}"
  gcloud monitoring dashboards create --config-from-file="${file}"
}

apply "${DIR}/dashboard-overview.json"       "JobFit — Overview"
apply "${DIR}/dashboard-service-health.json" "JobFit — Service Health"

echo ">> Done. Cloud Console -> Monitoring -> Dashboards."
echo "   (Alert policies are provisioned in Phase 6 — see docs/product design plan.)"
