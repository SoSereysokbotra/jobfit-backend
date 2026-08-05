# ❌ Not-Started Features (10)

Requirements with no functioning path — including several where models or DTOs already exist but
nothing is wired up.

---

## PROFILE-005 — Certification Management
### *The cheapest win in the entire audit*

**State.** Everything is built **except the controller and the service methods**:

- `Certification` Prisma model — matches the SRS field-for-field (name, issuer, issue date,
  expiry date, credential ID, credential URL)
- [certification.entity.ts](../../src/modules/user/domain/entities/certification.entity.ts)
- [add-certification.dto.ts](../../src/modules/user/application/dtos/add-certification.dto.ts)
- Already referenced in `user.module.ts`

**Missing.** `CertificationController` and the corresponding `SkillsService`-style methods. Note
that `src/modules/user/application/use-cases/` is empty — Experience/Education/Skills logic lives
in services, so follow that existing pattern rather than introducing use-cases here.

**Closing it.** Copy
[education.controller.ts](../../src/modules/user/presentation/controllers/education.controller.ts) —
identical shape, identical `assertOwner` guard. Add the expiry-date validation and the
"expired certs excluded from matching" rule.
**Estimate: ~2–3 hours.**

---

## RESUME-003 — Resume Optimization
### *The biggest gap in the AI product story*

**State.** No "Optimize for this job" flow exists anywhere.

**What's already available.** Parsed résumé JSON (`ParsedResumeData`), job descriptions, the
skills/experience/location/salary scorers, and a generic `AiClient` with a `send<T>()` helper —
so adding one more AI call is straightforward.

**Missing.**
1. An AI-service endpoint (`/resume/optimize`) in the sibling `jobfits-ai-service` repo
2. A persistence model for suggestions (current text, recommendation, estimated impact)
3. The accept / edit / skip flow
4. Match-score recalculation after applied suggestions
5. **Document regeneration** — `mammoth` *reads* DOCX but nothing *writes* it. The
   "download optimized resume (PDF or DOCX)" criterion needs `docx` / `pdfkit` added.

**Note.** This requirement spans both repos. Document generation is the bulk of the effort.
**Estimate: ~3–5 days.**

---

## RECS-003 — Recommendation Filtering & Sorting
### *Best value-per-hour of anything in this document*

**State.** `GET /recommendations` accepts **no query parameters whatsoever** —
[matching.controller.ts](../../src/modules/matching/presentation/controllers/matching.controller.ts)
takes only the authenticated user.

**What's already available.** `RecommendationsQueryService.getForUser(userId, limit)` already
reads score-ordered rows, and the `Recommendation` model already carries
`@@index([userId, score])`. The filtering surface the SRS asks for (match score range, company,
location, salary range; sort by score / recency / salary) maps directly onto existing columns.

**Estimate: ~half a day.**

---

## RECS-004 — Recommendation Feedback
### *Cost compounds daily*

**State.** No dismiss, save-from-rec, or report endpoint.

**Two consequences.** Dismissed jobs keep resurfacing in the user's list, and **every day without
this is training data never collected** — the SRS explicitly wants this feedback to feed the
Phase 2 ML model.

**Do not overload `MatchLabel`.** That model is the offline retrieval-eval ground truth
(`GREAT`/`OK`/`BAD`, with a `MatchLabelSource`), a separate concern from user feedback.

**Closing it.** A `RecommendationFeedback` model (userId, jobId, action, reason, createdAt),
`POST /recommendations/:jobId/dismiss`, and an exclusion clause in the retrieval query.
**Estimate: ~1 day.**

---

## SAVED-003 — Saved Search Alerts

**State.** No model, no endpoints.

**Needs.** A `SavedSearch` model (userId, criteria JSON, frequency enum `NEVER|DAILY|WEEKLY`,
lastRunAt), CRUD endpoints, a scheduled matcher that finds new jobs since `lastRunAt`, and working
email delivery.

**Blocked on both keystones** — the scheduler and email.
**Estimate: ~2 days once unblocked.**

---

## NOTIF-001 — Email Notifications
### *The single most consequential finding in this audit*

**State.** [mailer.service.ts:15](../../src/infra/mailer/mailer.service.ts#L15) is
`// TODO: integrate email provider`. `nodemailer` is installed and never configured. All three
notification listeners have empty bodies:

- `application-submitted.listener.ts` → `/* TODO: confirm email to job seeker */`
- `application-status-changed.listener.ts`
- `job-published.listener.ts`

**The implication.** **Your email-verification and password-reset flows generate tokens that
nobody ever receives.** Those endpoints look complete in Swagger and pass their own unit tests,
but are functionally dead end-to-end. Same for application confirmations and parse-complete
notices.

**What is already built.** The admin-side observability half is done and waiting on a provider:
the `EmailEvent` model, `EmailEventType` enum, and
`/admin/email/metrics`, `/admin/email/bounces`, `/admin/email/suppress`.

**Still missing beyond the provider.** MJML templates + plain-text fallbacks, unsubscribe links,
SPF/DKIM configuration.
**Estimate: ~2–3 days.**

---

## NOTIF-002 — In-App Notifications

**State.** No `Notification` model in the schema.
[notification.service.ts](../../src/modules/notification/notification.service.ts) is two one-line
TODO methods:

```ts
async sendEmail(to: string, subject: string, body: string) { /* TODO */ }
async createInAppNotification(userId: string, message: string) { /* TODO */ }
```

**What's already available.** `@nestjs/event-emitter` and the listener wiring are in place, and
domain events already fire. This is mostly writing rows inside handlers that already exist.

**Needs.** A `Notification` model, plus list / unread-count / mark-read / dismiss / clear-all
endpoints.
**Estimate: ~1–2 days.**

---

## NOTIF-003 — Notification Preferences

**State.** No `NotificationPreference` model, no settings endpoint.

**Small on its own (~half a day) but must ship *with* NOTIF-001 and NOTIF-002** — otherwise you
are sending mail users cannot disable, which also violates the unsubscribe requirement in
NOTIF-001.

---

## INTERVIEW-002 — Interview Reminders

**State.** Nothing. **Triple-blocked:**

1. Needs the scheduler (1-day-before and 1-hour-before triggers)
2. Needs working email
3. **Needs somewhere to store an interview datetime.** `ApplicationTimeline` records events that
   *have happened* (`eventDate` defaults to `now()`); there is no scheduled-interview record with
   a future timestamp to fire against.

Also wants iCal / Google Calendar export.
**Estimate: ~2 days after prerequisites.**

---

## SALARY-001 — Salary Benchmarks

**State.** No `salary_data` model, no endpoints, no aggregation job.

**You are sitting on the raw material.** `Job.minSalary` / `maxSalary`, `Offer.baseSalary`, and
`Profile.minSalary` / `maxSalary` are all populated. A monthly aggregation into a
`SalaryBenchmark` table (role × location × level → p25/p50/p75/p90) is very achievable from your
own data, which is exactly what the SRS specifies as the source.

**One caveat worth designing for.** With a small job corpus these percentiles will be
statistically thin. Gate display behind a minimum sample size rather than showing a p90 derived
from four rows — a wrong benchmark is worse than no benchmark for a user negotiating salary.

**Estimate: ~2–3 days** (model + aggregation job + endpoints), plus the scheduler.
