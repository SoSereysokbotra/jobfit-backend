# JobFit — Live Deployment Status (2026-07-15)

## ✅ DEPLOYED & RUNNING on Google Cloud Run
- **Service URL:** `https://jobfit-backend-7g3b6oc3ja-an.a.run.app`
- **GCP project:** `jobfit-prod-8869` (project number `39884178646`) · region `asia-northeast1`
- **Account:** soviseth869@gmail.com · billing account `01EF5F-8C6DE5-2E7F1A` (linked)
- `/api/v1/health/ready` → **200** (DB up ~26ms; Redis/queue soft-degraded, readiness stays 200 by design). Migrations applied, all secrets injected, container boots clean.
- **Access is currently PRIVATE:** returns **403 without auth**, **200 with** `Authorization: Bearer $(gcloud auth print-identity-token)`. The org policy blocked `--allow-unauthenticated` (allUsers invoker rejected).

## GCP resources created
- Artifact Registry repo `jobfit` (docker, asia-northeast1). Image: `asia-northeast1-docker.pkg.dev/jobfit-prod-8869/jobfit/jobfit-backend`.
- APIs enabled: run, cloudbuild, artifactregistry, secretmanager, logging, monitoring, cloudtrace, clouderrorreporting.
- Secret Manager (all populated): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `METRICS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`. Empty (not wired): `SLACK_WEBHOOK_URL`, `REDIS_URL`.
- IAM: runtime SA `39884178646-compute@developer.gserviceaccount.com` has `secretAccessor` on the secrets; Cloud Build SA `39884178646@cloudbuild.gserviceaccount.com` has run.admin/artifactregistry.writer/iam.serviceAccountUser/secretAccessor/logging.logWriter.
- Deploy: `gcloud builds submit --async --config cloudbuild.yaml` (from repo root; no `--substitutions` — PowerShell mangles commas; uses cloudbuild defaults). gcloud on PATH at `C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin` (add to `$env:Path` in each PowerShell call).

## Deploy fixes made (ALL UNCOMMITTED — user commits)
Modified `cloudbuild.yaml`, `Dockerfile`, `package.json`:
1. `cloudbuild.yaml` health-gate shell vars escaped `$` → `$$` (Cloud Build read `$URL` as a substitution).
2. Image tag `$SHORT_SHA` → `$BUILD_ID` (SHORT_SHA is empty for manual `builds submit`).
3. pnpm v10 `ERR_PNPM_IGNORED_BUILDS`: added `packageManager: "pnpm@10.33.0"` + `pnpm.onlyBuiltDependencies` (prisma) / `pnpm.ignoredBuiltDependencies` (nestjs/pino/msgpackr/protobuf) to package.json; `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in Dockerfile.
4. migrate step: runs `npx --yes prisma@5.22.0 migrate deploy` in a clean `node:22` image from the source workspace (app image runs non-root + prisma CLI pruned → EACCES).
5. deploy step: removed `--no-traffic`/`--tag=candidate` + the separate health-gate/promote steps (not allowed on FIRST deploy); now a normal `gcloud run deploy --allow-unauthenticated` (Cloud Run health-gates rollout itself). `TRACE_ENABLED=false`, `SLACK_WEBHOOK_URL`/`REDIS_URL` omitted from `--set-secrets`.
6. Added `SUPABASE_*` to `--set-secrets` — the app hard-requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` at boot (`SupabaseClientService.getOrThrow`).

Also: `DATABASE_URL` secret had leftover `'…'` quotes from `.env` (my parser only stripped `"`) → stripped & re-stored.

## ⚠️ SECURITY: rotate the Supabase service-role key
The real `SUPABASE_SERVICE_ROLE_KEY` (+ anon key/jwt secret) got pasted into the chat transcript. Rotate it (Supabase → Project Settings → API → Reset service_role) and update the secret:
`printf-less: [IO.File]::WriteAllText($p,"NEWKEY"); gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=$p`

## NEXT STEPS (for the new chat)
1. **Decide public vs private access.** To make public (app has its own JWT auth, so safe): override org policy `constraints/iam.allowedPolicyMemberDomains` (allow all) then `gcloud run services add-iam-policy-binding jobfit-backend --region=asia-northeast1 --member=allUsers --role=roles/run.invoker`. Then `/api/docs` (Swagger) loads in a browser. **This is an internet-facing change — confirm before doing.**
2. **Commit** the uncommitted deploy files (on a branch per convention).
3. Rotate the Supabase service-role key (above).
4. **Optional:** re-enable Cloud Trace (`TRACE_ENABLED=true` in cloudbuild + grant runtime SA `roles/cloudtrace.agent`); add `SLACK_WEBHOOK_URL`/`REDIS_URL` secrets + back into `--set-secrets` (Memorystore for Redis); apply `infra/gcp/**` (logging retention/dashboards/alerts) via the setup scripts.
5. **Before real prod traffic:** Supabase → Cloud SQL (plan Appendix A).

## To redeploy after code changes
`cd d:\Year2\Jobfit\jobfit-backend; gcloud builds submit --async --config cloudbuild.yaml` (then poll `gcloud builds describe <id> --format='value(status)'`). Container logs: `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="jobfit-backend"' --limit=40 --freshness=15m --format="value(jsonPayload.message,textPayload,severity)"`.
