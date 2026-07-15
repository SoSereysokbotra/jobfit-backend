# JobFit Backend — End-to-End Test Flow (with payloads)

Follow this top-to-bottom to prove the whole backend works. Every step gives you the exact
**JSON payload** to paste into Swagger's *Try it out* box.

- Swagger UI: **`http://localhost:3000/api/docs`**
- Base URL: `http://localhost:3000/api/v1`
- Responses are wrapped: `{ "success": true, "data": { ... } }` — tokens are at **`data.accessToken`**.

---

## Step 0 — Start & seed

```bash
pnpm install                 # first time only
npm run start:dev            # start the API

# in a second terminal — creates users + a company + skills, and PRINTS THE IDs:
npx ts-node -r tsconfig-paths/register scripts/create-test-users.ts
```

The seed script prints values you'll paste later. Keep them handy:

```
ADMIN_USER_ID    = ...
EMPLOYER_USER_ID = ...
SEEKER_USER_ID   = ...
COMPANY_ID       = ...
INDUSTRY_ID      = ...
SKILL_ID_1       = ...   (TypeScript)
SKILL_ID_2       = ...   (Node.js)
```

All three users share the password **`Password123`**.

> Throughout this doc, replace `<COMPANY_ID>`, `<SKILL_ID_1>`, `<SEEKER_USER_ID>`, `<JOB_ID>`,
> `<APPLICATION_ID>`, etc. with the real IDs the seed script printed or that earlier steps returned.

---

## How to authorize in Swagger (do this after every login)

1. Call a login endpoint, copy `data.accessToken` from the response.
2. Click **Authorize** (top-right) → paste the token into **both** `bearer` and `access-token` → **Authorize** → **Close**.
3. To switch roles, **Authorize → Logout**, then log in as the other user and paste the new token.

---

# FLOW A — Job Seeker journey 🧑‍💼

### A1. Login as the seeker
`POST /auth/login`
```json
{ "email": "seeker@jobfit.test", "password": "Password123" }
```
→ `200`. Copy `data.accessToken` and **Authorize**.

### A2. Confirm who you are
`GET /auth/me` → `200`. Note your `id` — it should equal `SEEKER_USER_ID`.

### A3. Create your profile
`POST /profiles`
```json
{
  "firstName": "Sara",
  "lastName": "Seeker",
  "headline": "Backend Engineer",
  "bio": "Node.js and TypeScript developer.",
  "phone": "+1-555-0100",
  "minSalary": 60000,
  "maxSalary": 90000,
  "salaryCurrency": "USD",
  "linkedinUrl": "https://linkedin.com/in/sara"
}
```
→ `201`.

### A4. Add a skill  (use `<SEEKER_USER_ID>` in the path)
`POST /profiles/<SEEKER_USER_ID>/skills`
```json
{ "skillId": "<SKILL_ID_1>", "proficiencyLevel": "ADVANCED", "yearsOfExperience": 4 }
```
→ `201`.

### A5. Add work experience
`POST /profiles/<SEEKER_USER_ID>/experience`
```json
{
  "company": "Prior Corp",
  "title": "Software Engineer",
  "jobLevel": "MID",
  "employmentType": "FULL_TIME",
  "industry": "<INDUSTRY_ID>",
  "description": "Built REST APIs.",
  "isCurrentJob": false,
  "startDate": "2021-01-01",
  "endDate": "2023-06-30",
  "technologies": ["Node.js", "PostgreSQL"]
}
```
→ `201`.

### A6. Add education
`POST /profiles/<SEEKER_USER_ID>/education`
```json
{
  "institution": "State University",
  "degreeLevel": "BACHELOR",
  "fieldOfStudy": "Computer Science",
  "startDate": "2016-09-01",
  "endDate": "2020-06-01",
  "gpa": 3.6
}
```
→ `201`.

### A7. Upload a resume (file upload — not JSON)
`POST /resumes` → in Swagger this shows a **file** picker. Choose a small **PDF or DOCX** (≤ 5 MB).
Optional `title` field: `My Resume`. → `201`. Copy the returned resume `id` = `<RESUME_ID>`.
> If parsing depends on the queue/DB, `GET /resumes/<RESUME_ID>/parsing-status` shows progress.

### A8. Browse jobs (public — no token needed)
`GET /jobs` → `200`. (Empty until the employer publishes one in Flow B. Come back after B5.)

### A9. Apply to a job  (after a job is published in Flow B)
`POST /applications`
```json
{ "jobId": "<JOB_ID>", "resumeId": "<RESUME_ID>", "coverLetter": "I'm a great fit." }
```
→ `201`. Copy `data.id` = `<APPLICATION_ID>`.

### A10. View your applications & timeline
- `GET /applications` → `200` (list)
- `GET /applications/<APPLICATION_ID>` → `200`
- `GET /applications/<APPLICATION_ID>/timeline` → `200`
- `PATCH /applications/<APPLICATION_ID>/status`
  ```json
  { "newStatus": "WITHDRAWN", "notes": "Changed my mind." }
  ```

---

# FLOW B — Employer journey 🏢

### B1. Login as the employer
`POST /auth/login`
```json
{ "email": "employer@jobfit.test", "password": "Password123" }
```
→ `200`. **Authorize** with this token.

### B2. Claim the seeded company
`POST /employer/companies/claim`
```json
{ "companyId": "<COMPANY_ID>", "firstName": "Ed", "lastName": "Employer" }
```
→ `200/201`. This links your account to the company (fixes the "no company associated" `403`).

### B3. Update the company profile
`PATCH /employer/companies/<COMPANY_ID>`
```json
{
  "description": "We build developer tools.",
  "website": "https://acme.test",
  "size": "MEDIUM",
  "foundedYear": 2015,
  "city": "Remote",
  "country": "US"
}
```
→ `200`.

### B4. (Optional) Verify company by email domain
`POST /employer/companies/<COMPANY_ID>/verify-email` → `200/202` (no body).

### B5. Create a job, then publish it
`POST /employer/jobs`
```json
{
  "title": "Senior Backend Engineer",
  "description": "Own our API platform. Node.js + TypeScript.",
  "remoteType": "REMOTE",
  "location": "Anywhere",
  "minSalary": 90000,
  "maxSalary": 130000,
  "skillIds": ["<SKILL_ID_1>", "<SKILL_ID_2>"]
}
```
→ `201`. Copy `data.id` = `<JOB_ID>`.

`POST /employer/jobs/<JOB_ID>/publish` → `200`. **Now the seeker can see & apply (Flow A8–A9).**

### B6. Edit the job (optional)
`PATCH /employer/jobs/<JOB_ID>`
```json
{ "minSalary": 100000, "maxSalary": 140000 }
```

### B7. Job analytics
`GET /employer/jobs/<JOB_ID>/analytics` → `200` (views / applications / avg match score).

### B8. Review the application pipeline (after the seeker applies in A9)
- `GET /employer/applications?jobId=<JOB_ID>` → `200`
- Move the candidate: `PATCH /employer/applications/<APPLICATION_ID>/status`
  ```json
  { "newStatus": "INTERVIEW", "notes": "Strong background." }
  ```
- Add notes: `POST /employer/applications/<APPLICATION_ID>/notes`
  ```json
  { "notes": "Schedule a technical screen." }
  ```

---

# FLOW C — Admin journey 🛡️

### C1. Admin login
`POST /admin/login`
```json
{ "email": "admin@jobfit.test", "password": "Password123" }
```
→ `200`. **Authorize** with this token.

### C2. System health & metrics
- `GET /admin/system/health` → `200` (`status`, `databaseUp`, `activeUsers`, `emailDeliveryRate`, `openAlerts`)
- `GET /admin/system/metrics?period=24h` → `200` (try `1h`, `24h`, `7d`)
- `GET /admin/system/alerts` → `200`
- `POST /admin/system/alerts/<ALERT_ID>/acknowledge` → `404` if no alert exists (expected on a fresh DB)

### C3. User management
- `GET /admin/users?email=jobfit` → `200` (paginated). Grab a user `id`.
- `GET /admin/users/<SEEKER_USER_ID>` → user detail
- `POST /admin/users/<SEEKER_USER_ID>/reset-password` → `200` (emails a code; writes an audit log)
- `POST /admin/users/<SEEKER_USER_ID>/unlock` → `200`
- `DELETE /admin/users/<id>` → `200` (GDPR soft delete — use a throwaway user)

### C4. Email delivery tracking
- `GET /admin/email/metrics` → `200`
- `GET /admin/email/bounces` → `200`
- `POST /admin/email/suppress`
  ```json
  { "email": "bad@example.com" }
  ```
  → `200`.

### C5. Audit logs — proves writes were recorded
`GET /admin/audit-logs` → `200`. After C3/C4 you should see entries:
`USER_RESET_PASSWORD`, `USER_UNLOCKED`, `EMAIL_SUPPRESSED`, etc. ✅

---

# FLOW D — Authorization checks (security works) 🔒

| Test | Steps | Expected |
|------|-------|----------|
| No token | Authorize → **Logout**, call `GET /admin/system/health` | `401` |
| Wrong role | Login as **seeker**, call `GET /admin/system/health` | `403` |
| Right role | Login as **admin**, call the same route | `200` |
| Employer gate | As employer **before** B2, call `GET /employer/applications` | `403` "Claim a company first" |

---

## Quick reference — enum values

- **remoteType:** `REMOTE` · `HYBRID` · `ON_SITE`
- **application status (`newStatus`):** `DRAFT` · `SUBMITTED` · `SCREENING` · `INTERVIEW` · `OFFER` · `ACCEPTED` · `NEGOTIATING` · `REJECTED` · `WITHDRAWN` · `ARCHIVED`
- **jobLevel:** `INTERN` · `ENTRY` · `MID` · `SENIOR` · `LEAD` · `MANAGER` · `DIRECTOR` · `C_LEVEL`
- **employmentType:** `FULL_TIME` · `PART_TIME` · `CONTRACT` · `TEMPORARY` · `FREELANCE`
- **degreeLevel:** `HIGH_SCHOOL` · `ASSOCIATE` · `BACHELOR` · `MASTER` · `DOCTORATE` · `CERTIFICATION`
- **proficiencyLevel:** `BEGINNER` · `INTERMEDIATE` · `ADVANCED` · `EXPERT`
- **metrics period:** `1h` · `24h` · `7d`

---

## If something returns 500

The database has some **pre-existing schema drift** (columns declared in `prisma/schema.prisma`
that aren't in the DB yet, e.g. on the `resumes` table). Endpoints touching those can `500`.
This predates the Admin/Employer work. To reconcile:

```bash
npx prisma migrate dev   # review the generated diff carefully before applying
```

Full endpoint list: **[API_ENDPOINTS_REFERENCE.md](API_ENDPOINTS_REFERENCE.md)** ·
Testing overview: **[BACKEND_TESTING_GUIDE.md](BACKEND_TESTING_GUIDE.md)**
