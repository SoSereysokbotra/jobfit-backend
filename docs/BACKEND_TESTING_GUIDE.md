# JobFit Backend — Testing Guide (Swagger UI)

A step-by-step guide to manually test the whole backend through the Swagger UI.

- **Base URL:** `http://localhost:3000/api/v1`
- **Swagger UI:** `http://localhost:3000/api/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/docs-json`

> 📋 **Every endpoint in the project (all 81 operations) is listed in [API_ENDPOINTS_REFERENCE.md](API_ENDPOINTS_REFERENCE.md)** — method, path, auth, body, params, and required role for each. Use this guide for the *how to test*, and that file as the *full checklist*.

> All responses are wrapped in a standard envelope:
> ```json
> { "success": true, "statusCode": 200, "timestamp": "...", "data": { ... } }
> ```
> So the access token you copy for the "Authorize" step lives at **`data.accessToken`**.

---

## 0. Prerequisites

- **Node.js** installed (project uses Node 22).
- **PostgreSQL** — already configured via `DATABASE_URL` in `.env` (points at Supabase). Migrations are already applied.
- **Redis** — *optional*. If it isn't running you'll see `ECONNREFUSED :6379` warnings in the console. That's fine: Redis-backed features (rate-limiting, token blacklist on logout, account lockout) *fail open*, so the API still works.
  - To enable them: `docker run -d -p 6379:6379 redis` (optional).

---

## 1. Install & start the server

```bash
# from the project root: d:\Year2\Jobfit\jobfit-backend
pnpm install          # first time only (installs bullmq, pdf-parse, mammoth, etc.)
npm run start:dev
```

Wait until you see:

```
[NestApplication] Nest application successfully started
🚀  JobFit API running on http://localhost:3000/api/v1
📚  Swagger docs at   http://localhost:3000/api/docs
```

> **If you see `EADDRINUSE: address already in use :::3000`** another instance is already running.
> Kill it and retry:
> - PowerShell: `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
> - or Git Bash: `pkill -f "nest start"`

---

## 2. Create test accounts (one command)

Admin and Employer endpoints require users with the right **role**, and normal signup needs email verification. To skip that friction, a helper script creates three **pre-verified** accounts:

```bash
npx ts-node -r tsconfig-paths/register scripts/create-test-users.ts
```

| Role         | Email                  | Password      |
|--------------|------------------------|---------------|
| `ADMIN`      | `admin@jobfit.test`    | `Password123` |
| `EMPLOYER`   | `employer@jobfit.test` | `Password123` |
| `JOB_SEEKER` | `seeker@jobfit.test`   | `Password123` |

The script is safe to re-run (it upserts by email).

---

## 3. Open Swagger & authorize

1. Open **`http://localhost:3000/api/docs`**.
2. Find **`POST /admin/login`** (tag *Admin - Auth*) → **Try it out** → body:
   ```json
   { "email": "admin@jobfit.test", "password": "Password123" }
   ```
   → **Execute**. Copy the token from the response at `data.accessToken`.
3. Click the green **Authorize** button (top-right), paste the token into **both** `bearer` and `access-token` schemes → **Authorize** → **Close**.
   - The token persists across page reloads (`persistAuthorization` is on).
4. You're now authenticated as an **admin**. To test other roles, repeat with a different login and re-Authorize.

> Tip: for a normal user token use **`POST /auth/login`** with `seeker@jobfit.test` / `Password123`.
> For an employer token, `POST /auth/login` with `employer@jobfit.test`.

---

## 4. Test the Auth module

| Step | Endpoint | Body / Notes | Expect |
|------|----------|--------------|--------|
| Register (optional) | `POST /auth/register` | `{ "email":"new@x.com","password":"Password123","agreeToTerms":true }` | `201` + sends a 6-digit email code |
| Login | `POST /auth/login` | `{ "email":"seeker@jobfit.test","password":"Password123" }` | `200`, token in `data.accessToken` |
| Current user | `GET /auth/me` | requires Authorize | `200`, your profile |
| Logout | `POST /auth/logout` | requires Authorize | `200` |

---

## 5. Test the Admin module (login as `admin@jobfit.test`)

**System Health & Alerts**
1. `GET /admin/system/health` → `200`. Returns `status`, `databaseUp`, `databaseLatencyMs`, `activeUsers`, `jobQueuePending`, `emailDeliveryRate`, `openAlerts`.
2. `GET /admin/system/metrics?period=24h` → `200` (try `1h`, `24h`, `7d`).
3. `GET /admin/system/alerts` → `200` (empty list until alerts exist).
4. `POST /admin/system/alerts/{id}/acknowledge` → needs a real alert `id`; returns `404` if not found.

**User Management**
5. `GET /admin/users?email=jobfit` → `200`, paginated `{ data, total, skip, take }`. Copy a user's `id`.
6. `GET /admin/users/{id}` → user detail (`applicationsCount`, `resumesCount`, `isLocked`). *(See Known Issues.)*
7. `POST /admin/users/{id}/reset-password` → `200` (emails a reset code; records an audit log).
8. `POST /admin/users/{id}/unlock` → `200` (clears lockout counters).
9. `DELETE /admin/users/{id}` → `200` (GDPR soft-delete). ⚠️ Use a throwaway user — try the `seeker` if you don't mind soft-deleting it.

**Email Delivery Tracking**
10. `GET /admin/email/metrics` → `200` (sent/delivered/bounced over 24h).
11. `GET /admin/email/bounces` → `200`.
12. `POST /admin/email/suppress` → body `{ "email": "bad@example.com" }` → `200` (records an audit log).

**Audit Logs**
13. `GET /admin/audit-logs` → `200`. After step 7 / 9 / 12 you should see entries like `USER_RESET_PASSWORD`, `USER_ACCOUNT_DELETED`, `EMAIL_SUPPRESSED`. **This proves writes + audit logging work end-to-end.**

---

## 6. Test the Employer module (login as `employer@jobfit.test`)

> Employer routes require the account to have **claimed a company first** — otherwise you'll correctly get
> `403 "No company associated with this account. Claim a company first."`

1. `POST /employer/companies/claim` — **expand the request schema in Swagger** to see the exact required fields, fill them, Execute. Expect `200/201`.
2. `PATCH /employer/companies/{id}` → update company profile.
3. `POST /employer/companies/{id}/verify-email` → email-domain verification.
4. `POST /employer/jobs` → create a job (schema in Swagger). Copy the returned job `id`.
5. `PATCH /employer/jobs/{id}` → edit the job.
6. `POST /employer/jobs/{id}/publish` → publish it.
7. `GET /employer/jobs/{id}/analytics` → views / applications / avg match.
8. `GET /employer/applications` → pipeline list (now `200`, not `403`).
9. `PATCH /employer/applications/{id}/status` → move a candidate through the pipeline.
10. `POST /employer/applications/{id}/notes` → attach employer notes.

---

## 7. Test the core modules (job seeker)

Login as `seeker@jobfit.test` and re-Authorize.

- **Jobs (public):** `GET /jobs` → `200`; `GET /jobs/{id}`.
- **Profile:** `POST /profiles`, `GET /profiles/{userId}`, `PATCH /profiles/{userId}`.
- **Skills / Experience / Education:** `POST`/`GET`/`PATCH`/`DELETE` under `/profiles/{userId}/...`.
- **Resumes:** `POST /resumes`, `GET /resumes`, `GET /resumes/{id}/parsing-status`.
- **Applications:** `POST /applications`, `GET /applications`, `PATCH /applications/{id}/status`, `GET /applications/{id}/timeline`.
- **Analytics:** `GET /analytics/my-stats`.

---

## 8. Verify authorization (security is working)

| Test | How | Expect |
|------|-----|--------|
| No token on a protected route | Click **Authorize → Logout**, then call `GET /admin/system/health` | `401 Unauthorized` |
| Wrong role | Authorize as `seeker`, call `GET /admin/system/health` | `403 Forbidden` |
| Correct role | Authorize as `admin`, call the same route | `200 OK` |

---

## 9. What "it works" looks like

- ✅ Server boots: *"Nest application successfully started"*, `GET /api/docs` returns the UI.
- ✅ Login endpoints return a token at `data.accessToken`.
- ✅ Admin GET endpoints return `200` when authorized as `ADMIN`.
- ✅ Protected routes return `401` (no token) / `403` (wrong role).
- ✅ Admin write actions appear in `GET /admin/audit-logs`.
- ✅ Employer routes return `403` until a company is claimed, then `200`.

---

## 10. Known issues & caveats (be aware while testing)

- **Pre-existing database schema drift.** `prisma/schema.prisma` declares some columns that the actual database doesn't have yet (e.g. `resumes.parsingStatus`). Any endpoint that touches those columns can return `500`. This predates the Admin/Employer work and affects parts of the **resume**-related surface and, potentially, `GET /admin/users/{id}` (it counts resumes). To fully resolve, reconcile the schema with the DB:
  ```bash
  npx prisma migrate dev   # review the diff carefully before applying
  ```
- **`/admin/system/health`** is intentionally resilient: if one metric (e.g. the queue-depth probe) can't be read, it logs a warning and returns `0` instead of failing the whole endpoint.
- **Redis off** → `ECONNREFUSED :6379` warnings are expected and non-fatal (features fail open).
- **Email is a stub / SMTP-dependent.** `reset-password` and email-verification codes only actually send if SMTP is configured; the endpoints still return success.

---

## 11. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :::3000` | Another instance is running — kill it (see §1). |
| `401` on everything | You aren't authorized — redo §3, or your 60-min token expired (log in again). |
| `403` on admin routes | You're logged in as the wrong role — Authorize with `admin@jobfit.test`. |
| `403` on employer routes | Claim a company first (`POST /employer/companies/claim`). |
| IDE shows TS errors but `npx tsc --noEmit` is clean | Stale TS server — *TypeScript: Restart TS Server*. |
| Missing-module errors on boot | Run `pnpm install`. |
