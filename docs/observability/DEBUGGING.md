# Debugging production

## Start from the signal
- **An alert / Error Reporting issue** → open the issue: stack trace (grouping key), release
  (`SERVICE_VERSION`), affected users, occurrence count.
- **A user report** → get their `userId` (or a `requestId` from the response's `x-request-id`
  header) and query logs.

## Query the logs (Logs Explorer)
Full cookbook: [`infra/gcp/README.md`](../../infra/gcp/README.md). The essentials:

```
# Everything for one request (the golden thread)
resource.type="cloud_run_revision" jsonPayload.requestId="REQUEST_ID"

# All errors, last 1h (set the time picker)
resource.type="cloud_run_revision" severity>=ERROR

# Everything a user hit
resource.type="cloud_run_revision" jsonPayload.userId="USER_ID"
```

## Log → Trace
Any line with `logging.googleapis.com/trace` links to its **Cloud Trace** waterfall — use it to
see which span (DB query, downstream call) dominated latency.

## Temporary DEBUG in production
Prod runs at `LOG_LEVEL=info`. To see `debug` briefly, redeploy the service with the env
overridden — and **set a reminder to revert** (debug is high-volume):
```bash
gcloud run services update jobfit-backend --region=$REGION --update-env-vars=LOG_LEVEL=debug
# … investigate …
gcloud run services update jobfit-backend --region=$REGION --update-env-vars=LOG_LEVEL=info
```

## Reproduce locally
```bash
npm run start:dev            # pretty logs
LOG_FORMAT=json npm run start:dev   # see exactly what Cloud Logging receives
```
Redis off locally is fine (fail-open). To exercise the health/metrics/alert paths, see
[../TEST_FLOW_WALKTHROUGH.md](../TEST_FLOW_WALKTHROUGH.md).

## Common gotchas
- `EADDRINUSE :3000` locally → a stale `nest start` holds the port; kill it (PowerShell
  `Get-NetTCPConnection -LocalPort 3000 -State Listen | ... Stop-Process`).
- IDE "cannot find `describe`" / stale type errors while `tsc --noEmit` is clean → restart the
  TS server.
