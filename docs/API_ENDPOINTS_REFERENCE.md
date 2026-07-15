# JobFit Backend — Complete Endpoint Reference

Auto-generated from the live OpenAPI spec (`/api/docs-json`). **81 operations** across all modules.

Legend: **Auth = Yes** → click *Authorize* in Swagger and provide a JWT first. **Body = Yes** → expand the request schema in Swagger and fill it. `{param}` = path params, `?query` params listed under *Params*.

> Base URL: `http://localhost:3000/api/v1` · Swagger UI: `http://localhost:3000/api/docs`
>
> Testing workflow (get a token, Authorize, expected results): see **[BACKEND_TESTING_GUIDE.md](BACKEND_TESTING_GUIDE.md)**.

**Module index:** [auth](#auth) · [Admin - Auth](#admin-auth) · [Admin - System](#admin-system) · [Admin - Users](#admin-users) · [Admin - Email](#admin-email) · [Admin - Audit](#admin-audit) · [Employer - Company](#employer-company) · [Employer - Jobs](#employer-jobs) · [Employer - Applications](#employer-applications) · [Users](#users) · [Profiles](#profiles) · [Skills](#skills) · [Experience](#experience) · [Education](#education) · [Analytics](#analytics) · [Resumes](#resumes) · [Applications](#applications) · [Jobs](#jobs) · [Learning](#learning)

---

## auth

Required role: **any authenticated / public** — 11 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `POST` | `/api/v1/auth/login` | No | Yes | - | Log in |
| `POST` | `/api/v1/auth/logout` | Yes | - | - | Log out |
| `GET` | `/api/v1/auth/me` | Yes | - | - | Get the current authenticated user |
| `POST` | `/api/v1/auth/refresh-token` | Yes | - | - | Refresh tokens (single-use rotation) |
| `POST` | `/api/v1/auth/register` | No | Yes | - | Register a new account |
| `POST` | `/api/v1/auth/request-password-reset` | No | Yes | - | Request a password reset code |
| `POST` | `/api/v1/auth/resend-email-verification` | No | Yes | - | Resend email verification code |
| `POST` | `/api/v1/auth/resend-password-reset-verification` | No | Yes | - | Resend password reset code |
| `POST` | `/api/v1/auth/reset-password` | No | Yes | - | Reset password |
| `POST` | `/api/v1/auth/verify-email` | No | Yes | - | Verify email address |
| `POST` | `/api/v1/auth/verify-password-reset` | No | Yes | - | Verify password reset code |

## Admin - Auth

Required role: **ADMIN** — 2 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `POST` | `/api/v1/admin/login` | No | Yes | - | Admin login |
| `POST` | `/api/v1/admin/logout` | Yes | - | - | Admin logout |

## Admin - System

Required role: **ADMIN** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/admin/system/alerts` | Yes | - | severity, acknowledged | List system alerts (newest first) |
| `POST` | `/api/v1/admin/system/alerts/{id}/acknowledge` | Yes | - | id | Acknowledge an alert |
| `GET` | `/api/v1/admin/system/health` | Yes | - | - | Current platform health snapshot |
| `GET` | `/api/v1/admin/system/metrics` | Yes | - | period | Metrics aggregated over a time window (1h | 24h | 7d) |

## Admin - Users

Required role: **ADMIN** — 5 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/admin/users` | Yes | - | email, name, signupFrom, signupTo | Search users by email, name and signup date range |
| `DELETE` | `/api/v1/admin/users/{id}` | Yes | - | id | GDPR soft-delete a user account |
| `GET` | `/api/v1/admin/users/{id}` | Yes | - | id | View a user detail |
| `POST` | `/api/v1/admin/users/{id}/reset-password` | Yes | - | id | Send the user a password reset code |
| `POST` | `/api/v1/admin/users/{id}/unlock` | Yes | - | id | Unlock an account locked after failed login attempts |

## Admin - Email

Required role: **ADMIN** — 3 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/admin/email/bounces` | Yes | - | - | Recent bounced / complained emails |
| `GET` | `/api/v1/admin/email/metrics` | Yes | - | - | Email delivery metrics for the last 24 hours |
| `POST` | `/api/v1/admin/email/suppress` | Yes | Yes | - | Add an email address to the suppression list |

## Admin - Audit

Required role: **ADMIN** — 1 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/admin/audit-logs` | Yes | - | adminId, actionType | List admin audit logs (newest first) |

## Employer - Company

Required role: **EMPLOYER** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/employer/companies/{id}` | Yes | - | id | View the company you manage |
| `PATCH` | `/api/v1/employer/companies/{id}` | Yes | Yes | id | Update the company profile |
| `POST` | `/api/v1/employer/companies/{id}/verify-email` | Yes | - | id | Verify company ownership via email domain |
| `POST` | `/api/v1/employer/companies/claim` | Yes | Yes | - | Claim an existing company |

## Employer - Jobs

Required role: **EMPLOYER** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `POST` | `/api/v1/employer/jobs` | Yes | Yes | - | Create a new job posting (draft) |
| `PATCH` | `/api/v1/employer/jobs/{id}` | Yes | Yes | id | Update a job posting |
| `GET` | `/api/v1/employer/jobs/{id}/analytics` | Yes | - | id | View job analytics (applications, match score) |
| `POST` | `/api/v1/employer/jobs/{id}/publish` | Yes | - | id | Publish a draft job |

## Employer - Applications

Required role: **EMPLOYER** — 3 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/employer/applications` | Yes | - | jobId, status | List applications for your jobs (pipeline) |
| `POST` | `/api/v1/employer/applications/{id}/notes` | Yes | Yes | id | Attach/replace employer notes on an application |
| `PATCH` | `/api/v1/employer/applications/{id}/status` | Yes | Yes | id | Move a candidate to a new pipeline stage |

## Users

Required role: **any authenticated / public** — 6 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/users` | Yes | - | - | List users (paginated) |
| `POST` | `/api/v1/users` | Yes | Yes | - | Create a new user |
| `DELETE` | `/api/v1/users/{id}` | Yes | - | id | Delete a user |
| `GET` | `/api/v1/users/{id}` | Yes | - | id | Get a user by id |
| `PATCH` | `/api/v1/users/{id}/subscription` | Yes | - | id | Change a user subscription tier |
| `GET` | `/api/v1/users/email/{email}` | Yes | - | email | Get a user by email (public) |

## Profiles

Required role: **any authenticated / public** — 5 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `POST` | `/api/v1/profiles` | Yes | Yes | - | Create the current user’s profile |
| `GET` | `/api/v1/profiles/{userId}` | Yes | - | userId | Get a user profile (public) |
| `PATCH` | `/api/v1/profiles/{userId}` | Yes | Yes | userId | Update own profile |
| `PATCH` | `/api/v1/profiles/{userId}/preferences` | Yes | - | userId | Update own work preferences |
| `PATCH` | `/api/v1/profiles/{userId}/salary` | Yes | - | userId | Update own salary expectations |

## Skills

Required role: **any authenticated / public** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/profiles/{userId}/skills` | Yes | - | userId | List a user’s skills (public) |
| `POST` | `/api/v1/profiles/{userId}/skills` | Yes | Yes | userId | Add a skill to own profile |
| `DELETE` | `/api/v1/profiles/{userId}/skills/{skillId}` | Yes | - | userId, skillId | Remove a skill from own profile |
| `PATCH` | `/api/v1/profiles/{userId}/skills/{skillId}/endorse` | Yes | - | userId, skillId | Endorse a skill |

## Experience

Required role: **any authenticated / public** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/profiles/{userId}/experience` | Yes | - | userId | List a user’s work experience (public) |
| `POST` | `/api/v1/profiles/{userId}/experience` | Yes | Yes | userId | Add a work experience to own profile |
| `DELETE` | `/api/v1/profiles/{userId}/experience/{expId}` | Yes | - | userId, expId | Delete own work experience |
| `PATCH` | `/api/v1/profiles/{userId}/experience/{expId}` | Yes | Yes | userId, expId | Update own work experience |

## Education

Required role: **any authenticated / public** — 4 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/profiles/{userId}/education` | Yes | - | userId | List a user’s education (public) |
| `POST` | `/api/v1/profiles/{userId}/education` | Yes | Yes | userId | Add an education record to own profile |
| `DELETE` | `/api/v1/profiles/{userId}/education/{eduId}` | Yes | - | userId, eduId | Delete own education record |
| `PATCH` | `/api/v1/profiles/{userId}/education/{eduId}` | Yes | Yes | userId, eduId | Update own education record |

## Analytics

Required role: **any authenticated / public** — 1 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/analytics/my-stats` | Yes | - | - | Get the current user’s funnel + engagement stats |

## Resumes

Required role: **any authenticated / public** — 10 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/resumes` | Yes | - | - | List the current user’s resumes |
| `POST` | `/api/v1/resumes` | Yes | Yes | - | Upload a resume (PDF or DOCX, max 5 MB) |
| `DELETE` | `/api/v1/resumes/{id}` | Yes | - | id | Delete one of your resumes |
| `GET` | `/api/v1/resumes/{id}` | Yes | - | id | Get one of your resumes by id |
| `GET` | `/api/v1/resumes/{id}/ats-score` | Yes | - | id | Calculate (and cache) a resume’s ATS score |
| `GET` | `/api/v1/resumes/{id}/parsing-status` | Yes | - | id | Get a resume’s parsing status |
| `GET` | `/api/v1/resumes/{id}/quality-score` | Yes | - | id | Calculate (and cache) a resume’s quality score |
| `POST` | `/api/v1/resumes/{id}/score` | Yes | - | id | Trigger score calculation and persist to the resume |
| `GET` | `/api/v1/resumes/{id}/scores` | Yes | - | id | Calculate both scores plus their average |
| `PATCH` | `/api/v1/resumes/{id}/set-default` | Yes | - | id | Set one of your resumes as the default |

## Applications

Required role: **any authenticated / public** — 6 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/applications` | Yes | - | status | List the current user’s applications |
| `POST` | `/api/v1/applications` | Yes | Yes | - | Submit an application to a job |
| `GET` | `/api/v1/applications/{id}` | Yes | - | id | Get one of your applications |
| `POST` | `/api/v1/applications/{id}/contact-person` | Yes | Yes | id | Attach a contact person to an application |
| `PATCH` | `/api/v1/applications/{id}/status` | Yes | Yes | id | Update an application’s status |
| `GET` | `/api/v1/applications/{id}/timeline` | Yes | - | id | Get an application’s timeline |

## Jobs

Required role: **any authenticated / public** — 2 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/jobs` | No | - | q, status, remoteType, location, skillIds, minSalary, maxSalary, limit, offset | Search and browse published jobs |
| `GET` | `/api/v1/jobs/{id}` | No | - | id | Get a job by ID |

## Learning

Required role: **any authenticated / public** — 2 endpoint(s)

| Method | Endpoint | Auth | Body | Params | Summary |
|--------|----------|:----:|:----:|--------|---------|
| `GET` | `/api/v1/learning-paths/{userId}` | Yes | - | userId | Skill-gap learning path for a user (own only) |
| `GET` | `/api/v1/skills/{skillId}/learning-resources` | Yes | - | skillId | Learning resources for a skill (public) |

