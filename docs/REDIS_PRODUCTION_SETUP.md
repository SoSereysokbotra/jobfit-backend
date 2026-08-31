# Turning Redis on in production

**Repo:** `jobfit-backend` · **Written:** 2026-08-31 · **Verified at:** `8d576ee` + the
uncommitted `REDIS_URL` wiring

---

## What this is for

Production has been running with **no Redis at all**. `cloudbuild.yaml` deliberately left
`REDIS_URL` out, with the note *"the secret exists but its value is unverified, and a bad
host is worse than none."*

The app works without it — every Redis-backed feature degrades rather than failing. But
you pay for it in speed. Measured locally on 2026-08-31:

| Request | With Redis | Without Redis |
|---|---|---|
| `GET /auth/me` | **3 ms** (cache hit) | ~600 ms (database round trip) |

That is roughly **170× on a request that happens on nearly every page load.**

---

## What Redis is actually doing here

| Use | Key pattern | What breaks without it |
|---|---|---|
| Auth + session caching | `cache:auth:*` | every lookup goes to the database |
| Brute-force lockout | `lockout:*` | falls back to per-instance in-process counters (R1) |
| Token revocation (logout) | `blacklist:*` | falls back to a per-instance mirror (R6) |
| Background job queue (BullMQ) | `bull:resume-parsing:*` | **résumé parsing does not run at all** |
| Alert de-duplication | alerting keys | duplicate notifications |

Note the fourth row. The queue is the one thing that does **not** degrade gracefully —
without Redis there is no queue, so uploaded résumés are never parsed.

---

## Step 1 — Get a Redis instance

Two reasonable options.

### Option A — Upstash (recommended to start)

Serverless, has a free tier, and gives you a connection URL directly. Pick a region
**close to your Cloud Run service** (`asia-northeast1` = Tokyo).

1. Create a database at <https://upstash.com>
2. Region: **ap-northeast-1 (Tokyo)** — same as Cloud Run
3. Copy the connection string. It looks like:
   `rediss://default:AbCdEf...@apn1-xxxx-12345.upstash.io:6379`

**Note the `rediss://`** — two s's, meaning TLS. Upstash requires it. The app handles this
automatically: `@config/redis-connection` turns a `rediss://` scheme into `tls: {}`.

### Option B — Google Memorystore

Native to GCP, private-IP only, no free tier (~$35/month at the smallest size).

```powershell
gcloud redis instances create jobfit-redis `
  --size=1 --region=asia-northeast1 --redis-version=redis_7_0
```

Then read the host:

```powershell
gcloud redis instances describe jobfit-redis --region=asia-northeast1 --format="value(host,port)"
```

The URL is `redis://<host>:<port>` (no TLS by default, no password by default).

⚠️ **Memorystore is private-IP only.** Cloud Run cannot reach it without a **Serverless
VPC Access connector**, which is extra setup and extra cost. If you have not set one up,
use Option A.

---

## Step 2 — Put the URL in Secret Manager

The `REDIS_URL` secret already exists — its value is what was never verified. Add a new
version:

```powershell
# Replace with your real URL. The @' '@ here-string keeps special characters literal.
$url = @'
rediss://default:YOUR_PASSWORD@your-host.upstash.io:6379
'@
$url | gcloud secrets versions add REDIS_URL --data-file=-
```

If the secret does not exist yet:

```powershell
$url | gcloud secrets create REDIS_URL --data-file=- --replication-policy=automatic
```

Grant the Cloud Run runtime service account access:

```powershell
gcloud secrets add-iam-policy-binding REDIS_URL `
  --member="serviceAccount:YOUR_RUNTIME_SA@YOUR_PROJECT.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

---

## Step 3 — Verify the value BEFORE deploying

**Do this.** It is the whole reason `REDIS_URL` was left out for so long.

```powershell
# redis-cli understands rediss:// directly.
redis-cli -u "rediss://default:YOUR_PASSWORD@your-host.upstash.io:6379" PING
# Expect: PONG
```

No `redis-cli`? Use Docker:

```powershell
docker run --rm redis:7-alpine redis-cli -u "rediss://default:PASSWORD@host:6379" PING
```

A malformed URL now **throws at boot on purpose** (`@config/redis-connection`) rather than
silently falling back to `localhost`. That means a bad value fails the deploy loudly — the
correct behaviour, but you would rather find out here.

---

## Step 4 — Deploy

`cloudbuild.yaml` is already wired. `REDIS_URL` is on the `--set-secrets` line, and
`REDIS_PREFIX=prod:` is on the `--set-env-vars` line.

Push to your build trigger. Cloud Run health-gates the rollout: if the new revision fails
to boot, the old one keeps serving.

---

## Step 5 — Confirm it worked

```powershell
curl https://YOUR-SERVICE-URL/api/v1/health/ready
```

Look for:

```json
{ "redis":  { "status": "up", "connection": "up" },
  "queue":  { "status": "up", "processing": "available", "connection": "up" } }
```

**Both** matter, and they are genuinely separate connections — the queue indicator now
probes BullMQ's own client rather than inferring from the cache's (Redis audit R9). If
`redis` is up but `queue` says `bullmq-down`, the cache connected and the queue did not.

In the Cloud Run logs you should see `Redis connection ready`. If Redis later drops and
recovers, you will see `Redis reconnected` — recovery happens on its own now, with no
restart (R4).

---

## What was fixed to make this safe

Turning Redis on used to be risky. Three things changed:

1. **A bad host no longer kills the service.** `RedisService` is `lazyConnect` with a
   non-fatal `onModuleInit`, retries forever with a 5s ceiling (R4), and bounds every
   command at 2s (R10). A wrong value costs degraded caching and a log line.
2. **Both clients now agree where Redis is.** This is the one that would have bitten you.
   `RedisService` read `REDIS_URL`; **BullMQ only ever read `REDIS_HOST`/`REDIS_PORT`.**
   Setting `REDIS_URL` alone — which is exactly what this guide tells you to do — would
   have connected the cache and left the job queue pointed at `localhost:6379`, with
   nothing anywhere saying so. Résumé parsing would simply never have run. Both now
   resolve through `@config/redis-connection`, and there is a test that fails if they
   diverge.
3. **Environments cannot collide.** `REDIS_PREFIX=prod:` namespaces every key, so a
   staging deploy sharing one Redis instance cannot revoke production tokens or lock
   production accounts (R7).

---

## Costs

| | Free tier | Paid |
|---|---|---|
| Upstash | 10,000 commands/day | ~$0.20 per 100k commands |
| Memorystore | none | ~$35/month (1 GB) + VPC connector |

For this app's traffic, Upstash's free tier is very likely enough to start.

---

## If you decide not to turn it on

That is a legitimate choice, and the app is built for it. Just know what you are choosing:

- Every auth lookup costs a ~600 ms database round trip instead of 3 ms
- Brute-force protection and logout are **per-instance** — correct on one instance,
  weaker across several
- **Résumé parsing does not run**, because there is no queue

Leave `REDIS_URL` out of `cloudbuild.yaml` and nothing else needs changing.
