# JobFits Backend - Quick Reference Card

**Keep this open while building.** Print it. Stick it on your monitor.

---

## PHASE OVERVIEW (Timeline)

```
Week 1:  Phase 1 (Foundation)
Week 2:  Phase 2 (Shared Kernel)
Weeks 3-4: Phase 3 (User Module) ⭐ CRITICAL PATH
Week 4.5: Phase 4 (Company)
Week 5:  Phase 5A (Job Core) + 5B (Resume Upload)
Week 6:  Phase 5C (Resume Scoring)
Week 7:  Phase 6 (Applications)
Week 8:  Phase 7 (Matching)
Week 9:  Phase 8 (Notifications)
Week 10: Phase 9 (Payment)
Week 11: Phase 10 (Admin)
Week 12: Phase 11 (Advanced Features)
Weeks 13-14: Phase 12 (Testing & Deployment)
```

---

## DEPENDENCY CHAIN

```
Phase 1: Foundation
  └─ NestJS, Prisma, DDD abstracts, EventBus, Auth Guards
     ↓
Phase 2: Shared Kernel
  └─ Enums, Value Objects, Constants
     ↓
Phase 3: User Module ⭐
  └─ User, Profile, Experience, Education, Skills, Analytics
     ↓ (All other phases depend on this!)
     ├─ Phase 4: Company
     │  └─ Phase 5A: Job
     │     ├─ Phase 5B-C: Resume
     │     └─ Phase 6: Applications
     │        └─ Phase 7: Matching
     │
     ├─ Phase 8: Notifications (listens to all events)
     ├─ Phase 9: Payment (references User subscription)
     └─ Phase 10: Admin (queries all modules)
```

**Critical insight:** Phase 3 (User) is THE bottleneck. Get it right, everything else flows.

---

## DATABASE ENTITY QUICK MAP

### Phase 1-2 (No new tables)
- Foundation & infrastructure only

### Phase 3 (User Module Tables)
```
User
├─ Profile
├─ Experience
├─ Education
├─ Certification
├─ UserSkill → Skill
└─ UserAnalytics
```

### Phase 4 (Company)
```
Company
```

### Phase 5A (Job)
```
Job → Company
```

### Phase 5B-C (Resume)
```
Resume → User
└─ ParsedResumeData
```

### Phase 6 (Application)
```
Application → User, Job, Resume
├─ ApplicationTimeline
└─ ContactPerson
```

### Phase 7 (Matching)
```
Recommendation → User, Job
```

### Phase 8 (Notifications)
```
Notification → User
```

### Phase 9 (Payment)
```
Subscription → User
└─ PaymentIntent (Stripe)
```

---

## KEY ENUMS (Shared Kernel)

```typescript
JobLevel: INTERN, ENTRY, MID, SENIOR, LEAD, MANAGER, DIRECTOR, C_LEVEL
RemoteType: ON_SITE, HYBRID, REMOTE
EmploymentType: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, FREELANCE
UserRole: JOB_SEEKER, EMPLOYER, ADMIN
ApplicationStatus: DRAFT, SUBMITTED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN, ARCHIVED
SubscriptionTier: FREE, PREMIUM, PROFESSIONAL
NotificationType: JOB_RECOMMENDATION, APPLICATION_UPDATE, INTERVIEW_REMINDER, OFFER_UPDATE, MESSAGE, SYSTEM
DegreeLevel: HIGH_SCHOOL, ASSOCIATE, BACHELOR, MASTER, DOCTORATE, CERTIFICATION
```

---

## FILE STRUCTURE (By Phase)

### Phase 1: Foundation
```
src/
├── common/
│   ├── abstracts/ (Entity, AggregateRoot, ValueObject, DomainEvent, Repository)
│   ├── decorators/ (@CurrentUser, @Public, @Roles)
│   ├── filters/ (GlobalExceptionFilter)
│   ├── guards/ (SupabaseAuthGuard, RolesGuard)
│   ├── pipes/ (ValidationPipe)
│   └── middleware/ (LoggingMiddleware)
├── events/
│   ├── domain-event-bus.service.ts
│   └── domain-events.registry.ts
├── main.ts
└── app.module.ts
```

### Phase 3: User Module (Pattern to follow for all modules)
```
src/modules/user/
├── domain/
│   ├── entities/ (User, Profile, Experience, Education, Certification, UserSkill, UserAnalytics)
│   └── events/ (UserCreated, ProfileUpdated, SkillAdded, etc.)
├── application/
│   ├── dtos/ (CreateUser, CreateProfile, AddExperience, etc.)
│   └── services/ (UserService, ProfileService, SkillsService, etc.)
├── infrastructure/
│   └── repositories/ (UserRepository, ProfileRepository, etc.)
├── presentation/
│   └── controllers/ (UserController, ProfileController, SkillsController, etc.)
└── user.module.ts
```

**This structure repeats for:** Company, Job, Resume, Application, Matching, Notification, Payment, Admin

---

## ENDPOINTS CHECKLIST

### Phase 3: User Module (15+ endpoints)
```
✓ POST   /users                          (Create user)
✓ GET    /users/:id                      (Get user)
✓ GET    /users/me                       (Get current user)
✓ GET    /users                          (List all)
✓ PATCH  /profiles/:id                   (Update profile)
✓ POST   /profiles/:id/skills            (Add skill)
✓ DELETE /profiles/:id/skills/:skillId   (Remove skill)
✓ POST   /profiles/:id/experience        (Add experience)
✓ POST   /profiles/:id/education         (Add education)
✓ POST   /profiles/:id/certifications    (Add certification)
```

### Phase 5A: Job Module (8+ endpoints)
```
✓ POST   /jobs                           (Create job)
✓ GET    /jobs/:id                       (Get job)
✓ GET    /jobs/search                    (Search + filter)
✓ GET    /companies/:id/jobs             (Company's jobs)
✓ PATCH  /jobs/:id                       (Update job)
✓ PATCH  /jobs/:id/close                 (Close job)
```

### Phase 5B-C: Resume Module (8+ endpoints)
```
✓ POST   /resumes                        (Upload)
✓ GET    /resumes                        (List)
✓ GET    /resumes/:id                    (Get single)
✓ DELETE /resumes/:id                    (Delete)
✓ PATCH  /resumes/:id/set-default        (Set default)
✓ GET    /resumes/:id/parsed-data        (Get extracted)
✓ GET    /resumes/:id/ats-score          (Get ATS score)
✓ GET    /resumes/:id/quality-score      (Get quality)
```

### Phase 6: Application Module (7+ endpoints)
```
✓ POST   /applications                   (Submit)
✓ GET    /applications                   (List user's)
✓ GET    /applications/:id               (Get single)
✓ PATCH  /applications/:id/status        (Update status)
✓ GET    /applications/:id/timeline      (Get timeline)
✓ POST   /applications/:id/contact-person (Add contact)
```

### Phase 7: Matching Module (4+ endpoints)
```
✓ GET    /recommendations                (List)
✓ GET    /recommendations/:id            (Get single)
✓ POST   /recommendations/:id/feedback   (Record action)
✓ GET    /jobs/:jobId/match-score        (Match for job)
```

---

## DOMAIN EVENTS TO EMIT

Track these events across all modules:

```
User Module:
  - UserCreated
  - ProfileUpdated
  - SkillAdded
  - SkillRemoved
  - ExperienceAdded
  - EducationAdded
  - CertificationAdded

Job Module:
  - JobCreated
  - JobUpdated
  - JobClosed

Resume Module:
  - ResumeUploaded
  - ResumeParsed
  - ResumeScored

Application Module:
  - ApplicationSubmitted
  - ApplicationStatusChanged
  - InterviewScheduled
  - OfferReceived

Matching Module:
  - RecommendationGenerated
  - UserFeedbackRecorded

Payment Module:
  - SubscriptionCreated
  - SubscriptionUpgraded
  - SubscriptionCancelled
```

**Pattern:** Every aggregate mutation = emit event → publish via DomainEventBus

---

## AI ASSISTANT PROMPT TEMPLATES

### For Phase Startup
```
I'm implementing Phase [N] of JobFits backend.
Reference: ./docs/BACKEND_PART[1|2].md ([Module Name] section, lines XXX-YYY)
Architecture: Modular Monolith + DDD + Clean Architecture

Task: [Specific task]

Entities: [List entities to implement]
DTOs: [List DTOs]
Services: [List services]
Endpoints: [List endpoints]

Requirements:
- Follow DDD patterns
- Use Prisma for persistence
- Emit domain events where applicable
- Include validation via class-validator
- Error handling with NestJS exceptions
- Fully typed TypeScript
```

### For Service Implementation
```
Reference: ./docs/BACKEND_PART[1|2].md ([Module] section)

Implement [ServiceName] with methods:
- method1(param): return type
- method2(param): return type
- method3(param): return type

Logic:
[Brief description of each method's business logic]

Dependencies:
- [Repository]
- [Service]
- DomainEventBus

Pattern: [If similar to existing module, name it]
```

### For Repository Implementation
```
Implement [RepositoryName] with:

Methods:
- save(entity: [Entity]): Promise<void>
- findById(id: string): Promise<[Entity] | null>
- findMany(filters?): Promise<[Entity][]>
- delete(id: string): Promise<void>

Database:
- Table: [Table name]
- Key queries: [FTS, indexes, relationships]

Map Prisma results back to domain entities.
```

---

## TESTING COMMAND CHEATSHEET

```bash
# Single phase tests
npm run test -- user.service.spec.ts
npm run test -- job.repository.spec.ts

# All unit tests
npm run test

# Integration tests (multi-module flows)
npm run test:integration

# E2E tests (full user journeys)
npm run test:e2e

# Coverage report
npm run test:cov

# Watch mode (auto-rerun on change)
npm run test -- --watch
```

---

## ENVIRONMENT VARIABLES CHECKLIST

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/jobfits

# Redis (for BullMQ queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxx
SUPABASE_SERVICE_KEY=xxxxxxx

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRATION=3600

# Email (SendGrid or AWS SES)
SENDGRID_API_KEY=xxxxx
SENDGRID_FROM_EMAIL=noreply@jobfits.com

# Payment (Stripe)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# External APIs
GLASSDOOR_API_KEY=xxxxx  # Optional

# Environment
NODE_ENV=development|production
PORT=3000
```

Copy to `.env` and `.env.example` before Phase 1.

---

## COMMON COMMANDS

```bash
# Start development
npm run start:dev

# Build for production
npm run build

# Run production build
node dist/main.js

# Database commands
npx prisma migrate dev --name [migration_name]
npx prisma migrate reset  # ⚠️ Deletes all data
npx prisma studio         # GUI database manager

# Generate Prisma Client
npx prisma generate

# Seed database (if seeder created)
npx prisma db seed

# Format code
npm run format

# Lint code
npm run lint

# Type check
npx tsc --noEmit
```

---

## DEBUGGING TIPS

### Problem: Service not injecting
```
✓ Check if module is imported in AppModule
✓ Check if provider is exported from module
✓ Check if constructor parameter matches provider name (case-sensitive)
```

### Problem: Prisma migration fails
```
✓ Check DATABASE_URL is correct
✓ Drop and recreate database: npx prisma migrate reset
✓ Check for syntax errors in schema.prisma
✓ Verify PostgreSQL is running
```

### Problem: Event not firing
```
✓ Did you emit event in domain entity? (addDomainEvent)
✓ Did you publish via DomainEventBus? (await this.eventBus.publish)
✓ Did you clear events after publishing? (clearDomainEvents)
✓ Is subscriber listening to correct event name?
```

### Problem: DTO validation not working
```
✓ Add decorators: @IsEmail(), @IsNotEmpty(), etc.
✓ Use ValidationPipe globally in main.ts
✓ Check parameter name matches DTO property
✓ Add transform option for whitelist
```

### Problem: Query returning null
```
✓ Check if Prisma query includes relations (.include())
✓ Check if deletedAt is null (soft deletes)
✓ Add console.log in repository to see raw Prisma result
✓ Verify ID exists in database via prisma studio
```

---

## PERFORMANCE CHECKLIST

### Database
- [ ] All frequently-queried fields are indexed
- [ ] Foreign keys properly configured
- [ ] No N+1 queries (use .include() in repositories)
- [ ] Soft deletes working (WHERE deletedAt IS NULL)

### API
- [ ] Pagination implemented (skip/take)
- [ ] Response compression enabled
- [ ] Unused fields excluded from responses
- [ ] Long operations queued (BullMQ)

### Code
- [ ] Services don't do I/O directly (repositories do)
- [ ] Domain logic in entities, not controllers
- [ ] Event listeners async (don't block)
- [ ] Secrets in environment variables, not code

---

## DEPLOYMENT CHECKLIST

### Before Deploying
- [ ] All tests passing
- [ ] `npm run build` succeeds with no errors
- [ ] `npx prisma migrate deploy` succeeds
- [ ] All environment variables set
- [ ] Database backed up
- [ ] Redis running
- [ ] Supabase project configured
- [ ] Stripe test mode keys verified
- [ ] Email service credentials valid

### Deployment Steps
1. `npm run build`
2. `npx prisma migrate deploy`
3. Deploy Docker image to production
4. Monitor logs for errors
5. Test endpoints with Postman
6. Set up monitoring & alerts

### Post-Deployment
- [ ] Health check endpoint responding
- [ ] Auth flow working
- [ ] Database queries fast
- [ ] No error spikes in Sentry
- [ ] Backups running

---

## USEFUL LINKS

**NestJS Docs:**
- https://docs.nestjs.com

**Prisma Docs:**
- https://www.prisma.io/docs

**TypeScript Handbook:**
- https://www.typescriptlang.org/docs

**Domain-Driven Design:**
- Book: "Domain-Driven Design" by Eric Evans

**Postgres Full-Text Search:**
- https://www.postgresql.org/docs/current/textsearch.html

---

## CONTACT & QUESTIONS

1. **Architecture questions:** Check BACKEND_PART1.md (Architecture section)
2. **Module-specific:** Check BACKEND_PART1.md or BACKEND_PART2.md for your module
3. **Implementation details:** Reference the Implementation Roadmap (this document series)
4. **Code patterns:** Look at Phase 3 (User Module) as the reference pattern
5. **Framework help:** NestJS docs, Prisma docs

---

**Last Updated:** July 2026  
**Status:** Ready for Development  
**Format:** Print & Pin to Your Monitor

🚀 **Happy coding!**
