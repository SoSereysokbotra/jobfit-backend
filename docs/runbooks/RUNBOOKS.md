# Runbooks

Playbooks for common incidents. Each: symptoms → checks → resolution. Process:
[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

---

## 1. Database down / connection errors
**Symptoms:** `DATABASE_ERROR` alerts in Slack + `/admin/system/alerts`; `/health/ready` → 503;
5xx spike; logs `severity=ERROR` with "can't reach database" / `ECONNREFUSED`.

**Checks (first 60s):**
- Provider status: Supabase (or Cloud SQL) dashboard — is the instance up?
- Recent deploy? A bad `DATABASE_URL`/migration → **roll back** the revision.
- Connection exhaustion: Cloud Run scaled out × pool size. Logs mention "too many
  connections" / "pool timeout".

**Resolution:**
- Provider outage → wait / failover; the app fail-fasts and readiness 503s (no bad traffic).
- Too many connections → lower Prisma `connection_limit`, use the pooled URL (Supabase 6543 /
  Cloud SQL connector), cap Cloud Run `--max-instances`.
- Bad migration → roll back the revision; fix the migration; redeploy (health-gated).

---

## 2. Redis down
**Symptoms:** `/health/ready` shows `redis: degraded` (still **200** — soft); logs warn
"fail open"; login rate-limit / token-blacklist / lockout temporarily inactive.

**Checks:** Memorystore/Redis status; `REDIS_URL` secret; network/VPC connector.

**Resolution:** Redis is **fail-open** — the API keeps working; this is at most SEV-3. Restore
Redis (restart/scale). No rollback needed. If it's persistently down, security features
(lockout/blacklist) are degraded — prioritize restoring it.

---

## 3. High error rate (>1% 5xx)
**Symptoms:** "high 5xx error ratio" Cloud Monitoring alert and/or `ERROR_RATE_HIGH` in
`/admin/system/alerts`.

**Checks:** Error Reporting — is it one new grouped issue (a bug) or many? Correlate with the
last deploy (`SERVICE_VERSION`/release). Logs: `severity>=ERROR` last 1h.

**Resolution:** new bug from a recent release → **roll back**; otherwise open the top Error
Reporting issue, find the `requestId`, trace it, fix + deploy. Verify the issue count drops.

---

## 4. High latency (p95 > 1s)
**Symptoms:** latency alert; Overview dashboard p95 climbing.

**Checks:** **Cloud Trace** — which span dominates (DB query? external call?). DB: slow query /
missing index / replica lag. Cold starts: startup-latency panel (Service Health dashboard).

**Resolution:** add/az the index or optimize the query; raise Cloud Run `--min-instances` to
cut cold starts; add caching. Consider moving DB to Cloud SQL (same-region, lower latency).

---

## 5. Queue backlog / background jobs stuck
**Symptoms:** `jobfit_resume_parsing_pending` gauge climbing; resumes stay "pending".

**Checks:** Redis up? (BullMQ is Redis-backed → runbook #2). Are workers running? (parsing
worker). Failed jobs piling up.

**Resolution:** restore Redis; restart/scale the worker; inspect/retry failed jobs. Backlog is
usually a **symptom** of Redis or a stuck worker, not a root cause.

---

## 6. Deploy failed / stuck at health-gate
**Symptoms:** Cloud Build fails at the `health-gate` step; traffic did **not** shift.

**Meaning:** the safety worked — the new revision was unhealthy and the **old one keeps
serving**. No user impact.

**Resolution:** read the candidate revision's logs (Logs Explorer, filter the revision), fix
the cause (bad env/secret, migration, startup error), redeploy. To inspect the candidate
without traffic: hit its `--tag=candidate` URL.

---

## 7. Alerts too noisy / Slack spam
**Checks:** dedup (Redis) working? A Redis outage makes alerting fail-open (send more).

**Resolution:** restore Redis (restores dedup); raise thresholds in the alert policy JSON;
during planned maintenance set Redis key `alert:suppressed` to mute Slack (ledger still
records). See [../observability/ALERTING.md](../observability/ALERTING.md).
