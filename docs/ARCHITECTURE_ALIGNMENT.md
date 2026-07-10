# Architecture Alignment (Docs → Code)

**The built code is the source of truth, not the design docs.** The docs
(`BACKEND_PART1/2`, `IMPLEMENTATION_ROADMAP*`, `PATTERNS`, `QUICK_REFERENCE`,
`CORRECTED_Complete_AI_Prompts`) describe an earlier/parallel design that diverges from
what was actually implemented. When a phase prompt (from those docs) conflicts with the
list below, **apply the code-side reality.** This file is the errata that overrides them.

---

## 1. Authentication — self-managed JWT (NOT Supabase)

- **`SupabaseAuthGuard` does not exist.** Auth is self-managed JWT.
- `JwtAuthGuard` is registered **globally** (`APP_GUARD` in `app.module.ts`) →
  **secure-by-default**. Open a route with `@Public()`. `RolesGuard` is also global; use
  `@Roles('EMPLOYER' | 'ADMIN' | 'JOB_SEEKER')`.
- Doc says `@UseGuards(SupabaseAuthGuard)` → **rely on the global `JwtAuthGuard`**, and
  optionally add an explicit `@UseGuards(JwtAuthGuard)` on write routes to mirror intent.
- `@CurrentUser()` yields `AuthenticatedUser = { id, email, role }`
  (from `@common/guards/jwt-auth.guard`). Type params as `AuthenticatedUser`, not `any`.
- **No `supabaseId`.** The `User` aggregate is `{ email, role, subscriptionTier }`;
  identity/credentials live in the auth module. `firstName`/`lastName` live on **Profile**,
  not `CreateUserDto`. `CreateUserDto` = `{ email, role? }`.

## 2. DDD building blocks — two conventions coexist

| Convention | Location | Used by |
|---|---|---|
| **Newer (default for new code)** | `@common/abstracts/*` (Entity w/ timestamps, `AggregateRoot`, `DomainEvent` abstract class, `IRepository`), `@shared/kernel/*` (enums + **throwing** VOs), `@common/constants/*` | **user** module (Phase 3+) |
| **Older** | `@core/domain/*` (`Entity<T>`, `AggregateRoot<T>`, `IDomainEvent` interface, `ValueObject<T>`), `@core/repository` (`IBaseRepository`), `@shared-kernel/*` (**Result**-returning VOs) | **job** module; resume/application events |

- **New modules: use the newer `@common/abstracts` + `@shared/kernel` + `@common/constants`
  convention.** When *extending* an existing module, match that module's convention.
- The docs' import path `@/common/abstracts/...` is **wrong**. The alias is `@common/*`
  (no leading slash) → `src/common/*`. Other aliases: `@core/*`, `@shared/*`,
  `@shared-kernel/*`, `@modules/*`, `@infra/*`, `@events/*`, `@config/*`.

## 3. Events

- `DomainEventBus` (`@events/domain-event-bus.service`) wraps a **global** `EventEmitter2`
  (via `EventBusModule`). API: `publish(event)`, `publishAll(events)`. Events are keyed by
  **class name**; listeners subscribe with `@OnEvent('XxxEvent')`.
- New events **extend `DomainEvent`** from `@common/abstracts/domain-event`
  (`super(aggregateId)`; fields `aggregateId`, `occurredAt`). Older job/resume/application
  events `implements IDomainEvent` from `@core/domain`.

## 4. Constants (these EXIST — import them)

- `ERROR_MESSAGES` (`@common/constants/error-messages`): only
  `USER_NOT_FOUND, INVALID_EMAIL, INVALID_PASSWORD, INVALID_CREDENTIALS, UNAUTHORIZED,
  FORBIDDEN`. For anything else (e.g. "Profile not found") use an inline string.
- `VALIDATION` (`@common/constants/validation`): `EMAIL_REGEX, PHONE_REGEX,
  PASSWORD_MIN_LENGTH, PASSWORD_REGEX, NAME_MIN_LENGTH, NAME_MAX_LENGTH, BIO_MAX_LENGTH,
  URL_REGEX`. There is no separate `VALIDATION.ERROR_MESSAGES` object.

## 5. Controllers & DTOs

- Controllers **return response DTOs** with a `constructor(entity)` — one per aggregate
  (`UserResponseDto`, `ProfileResponseDto`, `Skill/Experience/EducationResponseDto`,
  `JobResponseDto`). Create the response DTO if it's missing.
- User-module DTOs live in `application/dtos/`; the job module keeps DTOs in
  `presentation/dto/`. Match the module you're in.
- DTO dates that a service compares/stores as `Date` use `@Type(() => Date) @IsDate()`
  (NOT `@IsDateString()`, which yields strings and breaks date logic).
- Ownership checks: mutations under `/profiles/:userId/...` enforce `user.id === :userId`
  (`ForbiddenException`).

## 6. Module wiring

- `PrismaModule` and `EventBusModule` are `@Global` → `PrismaService` and `DomainEventBus`
  are injectable everywhere without importing them.
- Repos depend only on `PrismaService`; services depend on their repo (+ `UserRepository`
  for user-scoped work) + `DomainEventBus`.
- After adding a service/repo/controller, **register it in the module** (and export
  services other modules consume).

## 7. Prisma

- After `pnpm install` or any `schema.prisma` change, run **`prisma generate`** before
  `tsc`/build — a stale client produces false "has no exported member" / "property does not
  exist on PrismaService" errors across ALL repos.
- `pnpm` is invoked via **`corepack pnpm`** (pnpm isn't on PATH).
- Verify with `node_modules/typescript/bin/tsc --noEmit` (exit 0).

## 8. Job module (Phase 5A) — already built; do NOT rewrite

Built on the **older** convention (`@core/domain` + VOs). The docs' flat-enum redesign
(`jobLevel/employmentType/applicantCount/viewCount/isActive/city/state/country/technologies`,
FTS) is **not** implemented and replacing it is destructive (drops `status`/`location`/
`JobSkill` columns). Reality:
- `Job` = `AggregateRoot<JobProps>` with `JobStatus`/`RemoteType` VOs + `SalaryRange`
  (`@shared-kernel`), `skillIds`, single `location`; lifecycle `publish()`/`close()`/
  `update()` returning `Result`.
- Controllers split: `JobController` (public `search` + `findById`) and
  `JobManagementController` (employer writes, `@Roles('EMPLOYER')`).
- `JobService` at `application/job.service.ts` orchestrates use-cases, returns
  `JobResponseDto`. `JobModule` wires `JOB_REPOSITORY→PrismaJobRepository` + use-cases +
  listener; **already imported in `app.module.ts`**.
- Prisma `Job`: `status (JobStatus enum), remoteType (String), location?, minSalary?,
  maxSalary?`, `JobSkill` relation. No counters/FTS.

## 9. Known real gaps (actual remaining work, not conflicts)

- **Company module is a stub** (`class CompanyService {}`) — no repository, no
  owner→company mapping. `job-management.controller` uses `user.id` as a `companyId`
  placeholder (`TODO(company)`), an authorization gap. Building Company unblocks it.
- **Certification**: entity + Prisma model + `AddCertificationDto` exist; no
  service/repo/events/controller yet.
- Later modules (Resume, Application, Matching, Notification, Payment) per the roadmap.
