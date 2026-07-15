# Security & sensitive data in logs

## Golden rule
**Never log secrets or sensitive PII.** Redaction is automatic and applied *before any sink*
(Cloud Logging, Error Reporting, Slack) — but don't rely solely on it: log IDs, not payloads.

## Automatic redaction
[`src/common/logging/redaction.ts`](../../src/common/logging/redaction.ts), wired into pino via
`formatters.log` (recursive, whole-object) **and** `redact.paths` (fast-redact, also catches
child-logger bindings).

**Key-based** (→ `**REDACTED**`), ~30 keys incl.:
`password`, `passwordHash`, `authorization`, `cookie`, `token`, `accessToken`,
`refreshToken`, `verificationCode`, `passwordResetCode`, `apiKey`, `secret`, `jwt`.

**Pattern-based** (in message strings): credit-card → `**CARD**`, SSN → `**SSN**`,
`Bearer <token>` → `Bearer **REDACTED**`.

> Limitation: free-text you assemble by hand is only pattern-scrubbed, not key-scrubbed. Log
> structured fields (`{ userId }`), never `"user data: " + JSON.stringify(user)`.

## Safe vs unsafe to log
| Safe | Unsafe (redact / omit) |
|------|------------------------|
| userId, requestId, role | password, tokens, cookies, Authorization |
| email domain, endpoint, status | full raw request body, verification/reset codes |
| durations, counts | card/bank/SSN, API keys, DB URLs |

## Client-facing errors
Non-HTTP exceptions return a generic `Internal server error` — internal messages/stacks are
logged server-side only, never sent to the client.

## Retention & access (GCP)
- Hot logs: `_Default` bucket, retention **90d prod / 30d staging / 7d dev**
  (`infra/gcp/logging/setup-logging.sh`).
- Archive: Log Router → BigQuery (partitioned) for compliance/analytics.
- Access: restrict Logging/Monitoring roles to the team; secrets live in **Secret Manager**,
  injected into Cloud Run via Workload Identity (no key files).

## Verifying redaction
Covered by unit tests (`redaction.spec.ts`, `error-reporting.spec.ts`) — a password/JWT/card
in a log object never reaches a sink in plaintext. Re-run: `npx jest --runInBand`.
