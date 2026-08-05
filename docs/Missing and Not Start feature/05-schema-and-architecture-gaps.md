# Schema & Architecture Gaps

Beyond the functional requirements: models the SRS ERD calls for that don't exist, and places
where the implementation deliberately (or accidentally) diverges from the specified architecture.

---

## Missing Prisma models

The SRS ERD (§ *Database Schema*) lists these entities. None exist in `prisma/schema.prisma`:

| Model | Blocks | Note |
|---|---|---|
| `notifications` | NOTIF-002 | |
| `notification_preferences` | NOTIF-003 | |
| `salary_data` | SALARY-001, half of SALARY-002 | |
| `learning_paths`, `learning_progress` | — | Learning is implemented as an in-code catalog ([learning-resources.catalog.ts](../../src/modules/learning/domain/learning-resources.catalog.ts)); nothing is persisted, so progress can't be tracked |
| `interview_tips`, `interview_questions` | INTERVIEW-001 caching | Every prep request re-hits the LLM |
| `subscriptions`, `payments` | Payment module | `SubscriptionTier` lives on `User`; there's no billing history |
| `user_settings` | — | |
| `projects`, `media` | Profile completeness | Both are in the SRS profile section |
| `faqs`, `knowledge_base`, `help_center` | NFR-USAB-004 | |
| `referrals` | Referral program | |
| `job_forms`, `job_form_responses` | Employer custom forms | |

**Also absent but implied by requirements rather than the ERD:**
`SearchHistory` (JOBS-003), `SavedSearch` (SAVED-003), `IngestionRun` (JOBS-001 history/rollback),
`RecommendationFeedback` (RECS-004).

## Empty controller stubs

Registered in `app.module.ts`, routed, and containing no endpoints:

- [company.controller.ts](../../src/modules/company/company.controller.ts) — `@Controller('companies')`, empty class
- [payment.controller.ts](../../src/modules/payment/payment.controller.ts) — `@Controller('payments')`, empty class

---

## Deviations from the specified architecture

### Deliberate and defensible — amend the SRS, not the code

| SRS says | Implementation | Assessment |
|---|---|---|
| Elasticsearch for search | PostgreSQL FTS + `searchTsv`, documented as "Phase 1" in the service header | Reasonable at current scale. The SRS's own §9.3 scaling roadmap anticipates Meilisearch/Typesense later. |
| Backend language: Python (NFR-MAINT-001) | Node.js / TypeScript / NestJS | The SRS contradicts itself — §7.1 correctly specifies Node.js + NestJS. NFR-MAINT-001 is a leftover; fix the doc. |
| Railway for backend hosting | Cloud Run (`jobfit-prod-8869`, asia-northeast1) | Intentional; already deployed. Update §8.3. |
| S3 for resume storage | Supabase Storage buckets | Consistent with the Supabase-based stack in §9.2. Update the FR-RESUME-001 wording. |
| Bull | BullMQ | Just a version difference. |

### Gaps rather than choices

| SRS requires | Reality |
|---|---|
| Recommendations cached in Redis, refreshed nightly, expire after 7 days | `ioredis` is installed but recs are **not** cached to it. `RecommendationsQueryService` computes lazily on first request if no rows exist, and nothing ever expires stale rows. |
| Recommendations regenerated within 1 hour of a profile update | Event listeners exist (`user-profile-updated.listener.ts`), so this may hold — but with no scheduler there is no fallback if an event is missed. |
| Resume versioning, old versions retained 12 months | `Resume` supports multiple per user + a default flag, but there's no version chain or archival policy. |
| >80% test coverage on critical paths | Spec files exist for matching, scoring, RRF, resume parsing/scoring, and the eval harness — good coverage of the algorithmic core. Controllers and services are largely untested. |
| CI/CD with automated tests on every PR | Per project memory: **no build triggers**; deploys are manual via `gcloud builds submit`. |
| Staging environment identical to production | Not present. |

---

## Cross-cutting observations

**The `Industry` table is orphaned.** It exists, and `Profile.desiredIndustries` stores IDs
pointing at it — but `Job` has no `industryId`, so the relationship is never closed. The user's
industry preference is collected and silently discarded at match time. This is the clearest
example of a half-wired feature in the schema.

**`ApplicationStatus.DRAFT` is unreachable.** The enum value exists; no code path can produce it.

**Loose typing where enums exist.** `Job.remoteType` and `UserSkill.proficiencyLevel` are both
`String` columns while equivalent Prisma enums (`RemoteType`, and the four SRS proficiency levels)
are defined or specified elsewhere. Worth tightening in a single migration.

**Rate limiting is configured but not globally applied.**
[throttler.config.ts](../../src/config/throttler.config.ts) defines named throttlers and
`ThrottlerModule.forRoot` is registered, but there is no global `ThrottlerGuard` — only
`auth.controller.ts` opts in at class level. NFR-SEC-006's "100 requests/minute per user" API-wide
limit is therefore not enforced on any other module.
