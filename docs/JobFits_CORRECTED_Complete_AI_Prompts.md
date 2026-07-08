# JobFits Backend - CORRECTED Complete AI Prompts
## WITH ALL FILES REFERENCED FOR MAXIMUM CONTEXT

**IMPORTANT:** Each prompt now references ALL relevant documentation files.  
This gives your AI assistant complete context for best code quality.

---

# UNDERSTANDING THE REFERENCES

Each prompt now includes:

```
REFERENCES (read all):
1. IMPLEMENTATION_ROADMAP.md → WHAT to build (structure, entities, methods)
2. BACKEND_PART1.md or PART2.md → WHY (business logic, behavior, data)
3. PATTERNS.md → HOW (code structure, method signatures, patterns)
4. QUICK_REFERENCE.md → CONSTANTS (enums, error messages, validation rules)
```

**Copy the entire prompt including ALL reference files.**  
Copilot will have complete context and generate better code.

---

# PHASE 1: Foundation & Infrastructure (Week 1)

## Prompt 1.1: DDD Building Blocks (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Foundation, lines 1-200)
2. ./docs/PATTERNS.md (Entity Pattern, Aggregate Root Pattern sections)
3. ./docs/QUICK_REFERENCE.md (entire file for context)

Task: Create the core DDD building block abstracts

Files to create:
1. src/common/abstracts/entity.ts
2. src/common/abstracts/aggregate-root.ts
3. src/common/abstracts/value-object.ts
4. src/common/abstracts/domain-event.ts
5. src/common/abstracts/repository.ts

Requirements:
- Entity: base class with id, createdAt, updatedAt properties
- AggregateRoot: extends Entity, manages domain events with addDomainEvent(), getDomainEvents(), clearDomainEvents()
- ValueObject: abstract base for immutable value objects with equals() method
- DomainEvent: abstract base with aggregateId and occurredAt
- IRepository: interface with save(), findById(), delete() methods

Code quality requirements:
- Use TypeScript strict mode, no 'any' types
- Include JSDoc comments for clarity
- Follow patterns from PATTERNS.md exactly
- Match error handling patterns from QUICK_REFERENCE.md
```

---

## Prompt 1.2: Event Bus Infrastructure (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Event Bus, lines 400-500)
2. ./docs/PATTERNS.md (Domain Event Pattern section)
3. ./docs/BACKEND_PART1.md (Events Infrastructure section)
4. ./docs/QUICK_REFERENCE.md (Error handling)

Task: Create the domain event bus service

Files to create:
1. src/events/domain-event-bus.service.ts
2. src/events/domain-events.registry.ts

Requirements:
- DomainEventBus service: @Injectable()
  - subscribe(eventName: string, handler: Function): void
  - publish(event: DomainEvent): Promise<void>
  - Maintains internal handlers map
  - Executes all handlers for event asynchronously
  - Error handling: log errors but don't throw (let other handlers run)

- domain-events.registry.ts: Object with all event name constants
  - Will be updated as we create modules
  - Format: EVENT_NAME: 'EventNameEvent'

Code quality:
- Use async/await for publishing
- Include error logging per QUICK_REFERENCE.md patterns
- Make it testable with injectable dependencies
- Follow patterns from PATTERNS.md
```

---

## Prompt 1.3: Global Exception Filter (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Exception Filter, lines 600-700)
2. ./docs/PATTERNS.md (Error Handling Pattern section)
3. ./docs/QUICK_REFERENCE.md (ERROR_MESSAGES, HTTP status codes)

Task: Create the global exception filter

File to create:
src/common/filters/global-exception.filter.ts

Requirements:
- Catch all exceptions globally
- Implement ExceptionFilter from @nestjs/common
- Handle HttpException: extract status and message
- Handle Error: log stack trace, return 500 status
- Handle unknown: log and return generic error

Response format (from QUICK_REFERENCE.md):
{
  "statusCode": number,
  "message": string (from VALIDATION.ERROR_MESSAGES),
  "timestamp": ISO string,
  "path": request URL
}

Code quality:
- Include Logger for error logging
- Register in AppModule as APP_FILTER provider
- Use error messages from QUICK_REFERENCE.md VALIDATION object
- Follow patterns from PATTERNS.md
```

---

## Prompt 1.4: Custom Decorators (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Custom Decorators, lines 800-900)
2. ./docs/PATTERNS.md (Controller Pattern section - shows usage)
3. ./docs/BACKEND_PART1.md (Authentication overview)
4. ./docs/QUICK_REFERENCE.md (UserRole enum for @Roles usage)

Task: Create custom decorators for controllers

Files to create:
1. src/common/decorators/current-user.decorator.ts
2. src/common/decorators/public.decorator.ts
3. src/common/decorators/roles.decorator.ts

Requirements:
- CurrentUser: Get current user from request.user
  - Usage: @CurrentUser() user: any
  - Extract from request context
  - Return user object with id, email, role properties

- Public: Mark endpoint as public (no auth required)
  - Set metadata 'isPublic' to true
  - Usage: @Public()
  - Used by SupabaseAuthGuard to skip auth check

- Roles: Require specific user roles
  - Accept multiple roles as parameters
  - Set metadata 'roles' to array
  - Usage: @Roles('ADMIN', 'EMPLOYER')
  - Valid values from QUICK_REFERENCE.md: UserRole enum

Code quality:
- Use createParamDecorator and SetMetadata from @nestjs/common
- Include JSDoc examples
- Match patterns from PATTERNS.md
```

---

## Prompt 1.5: Supabase Auth Guard (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Supabase Guard, lines 1000-1100)
2. ./docs/PATTERNS.md (Error Handling Pattern - for authentication errors)
3. ./docs/BACKEND_PART1.md (Authentication section)
4. ./docs/QUICK_REFERENCE.md (ERROR_MESSAGES for auth errors)

Task: Create Supabase authentication guard

File to create:
src/common/guards/supabase-auth.guard.ts

Requirements:
- Extend AuthGuard from @nestjs/passport (or implement CanActivate)
- Validate JWT token from Supabase
- Check for @Public() decorator - allow if present
- Throw UnauthorizedException if no token or invalid
- Attach user object to request for @CurrentUser() decorator

Include handling for:
- Missing Authorization header → throw with ERROR_MESSAGES.UNAUTHORIZED
- Invalid token format → throw with ERROR_MESSAGES.INVALID_CREDENTIALS
- Expired token → throw with ERROR_MESSAGES.INVALID_CREDENTIALS
- Token validation with Supabase

Code quality:
- Use error messages from QUICK_REFERENCE.md
- Follow error handling patterns from PATTERNS.md
- Make it compatible with @Public() decorator from Prompt 1.4
```

---

## Prompt 1.6: App Module Setup (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: App Module, lines 1200-1300)
2. ./docs/PATTERNS.md (Module Pattern section)
3. ./docs/BACKEND_PART1.md (Architecture overview)

Task: Create the main application module

File to create:
src/app.module.ts

Requirements:
- Import ConfigModule globally with forRoot()
  - Load .env file for environment variables
  - Set isGlobal: true
  
- Register GlobalExceptionFilter as APP_FILTER provider (from Prompt 1.3)
- Provide DomainEventBus as singleton (from Prompt 1.2)
- Prepare for importing feature modules in future phases (User, Job, Company, etc.)

Structure from PATTERNS.md Module Pattern:
- @Module() decorator
- imports array with ConfigModule.forRoot()
- providers array with DomainEventBus and exception filter
- No controllers yet (will add in Phase 3+)

Include JSDoc explanation.
```

---

## Prompt 1.7: Main Bootstrap File (CORRECTED)

```
I'm implementing Phase 1 of JobFits backend - Foundation & Infrastructure.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 1: Main Bootstrap, lines 1300-1400)
2. ./docs/QUICK_REFERENCE.md (Environment variables checklist)
3. ./docs/PATTERNS.md (Error Handling Pattern)

Task: Create the main application entry point

File to create:
src/main.ts

Requirements:
- Create NestFactory application from AppModule (from Prompt 1.6)
- Enable global validation pipe with options:
  - forbidNonWhitelisted: true
  - whitelist: true
  - transform: true
  - transformOptions: { enableImplicitConversion: true }

- Listen on port from environment variable or default to 3000
- Log when server is running with port and environment

Include:
- Error handling for port conflicts
- Graceful shutdown setup
- Development logging
- Use environment variables from QUICK_REFERENCE.md

Code quality:
- Follow NestJS best practices
- Use Logger for startup messages
```

---

# PHASE 2: Shared Kernel & Enums (Week 2)

## Prompt 2.1: All Enums (CORRECTED)

```
I'm implementing Phase 2 of JobFits backend - Shared Kernel.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 2: Enums, lines 200-700)
2. ./docs/BACKEND_PART1.md (Shared Kernel: Enums section)
3. ./docs/QUICK_REFERENCE.md (KEY ENUMS section - exact values)
4. ./docs/PATTERNS.md (DTO Pattern - shows how enums are used)

Task: Create all shared kernel enums

Files to create:
src/shared/kernel/enums/
├── job-level.enum.ts
├── remote-type.enum.ts
├── employment-type.enum.ts
├── user-role.enum.ts
├── application-status.enum.ts
├── subscription-tier.enum.ts
├── notification-type.enum.ts
├── degree-level.enum.ts
└── index.ts (export all)

Requirements (from BACKEND_PART1.md & QUICK_REFERENCE.md):
- JobLevel: INTERN, ENTRY, MID, SENIOR, LEAD, MANAGER, DIRECTOR, C_LEVEL
- RemoteType: ON_SITE, HYBRID, REMOTE
- EmploymentType: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, FREELANCE
- UserRole: JOB_SEEKER, EMPLOYER, ADMIN
- ApplicationStatus: DRAFT, SUBMITTED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN, ARCHIVED
- SubscriptionTier: FREE, PREMIUM, PROFESSIONAL
- NotificationType: JOB_RECOMMENDATION, APPLICATION_UPDATE, INTERVIEW_REMINDER, OFFER_UPDATE, MESSAGE, SYSTEM
- DegreeLevel: HIGH_SCHOOL, ASSOCIATE, BACHELOR, MASTER, DOCTORATE, CERTIFICATION

Code quality:
- Each enum as TypeScript enum with string values
- Create index.ts that exports all enums
- Use exact values from QUICK_REFERENCE.md
```

---

## Prompt 2.2: Value Objects (CORRECTED)

```
I'm implementing Phase 2 of JobFits backend - Shared Kernel.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 2: Value Objects, lines 800-1500)
2. ./docs/PATTERNS.md (Value Object Pattern section)
3. ./docs/BACKEND_PART1.md (Shared Kernel: Value Objects section)
4. ./docs/QUICK_REFERENCE.md (VALIDATION constants for regex patterns)

Task: Create all value objects

Files to create:
src/shared/kernel/value-objects/
├── salary-range.vo.ts
├── location.vo.ts
├── email.vo.ts
├── phone.vo.ts
├── currency.vo.ts
└── index.ts (export all)

Requirements (from BACKEND_PART1.md & PATTERNS.md):
- SalaryRange: min (number), max (number), currency (string)
  - Validation: min > 0, max > min (from BACKEND_PART1.md)
  - get isValid(): boolean
  - static create() factory method

- Location: city, state, country, latitude?, longitude?
  - get displayName(): string
  - static create() factory method

- Email: value (string)
  - Validation: use EMAIL_REGEX from QUICK_REFERENCE.md
  - Throw error if invalid in constructor
  - static create() factory method

- Phone: value (string), countryCode (string, default '+1')
  - Validation: use PHONE_REGEX from QUICK_REFERENCE.md
  - get fullNumber(): string
  - static create() factory method

- Currency: code, symbol
  - Static properties: USD, EUR, GBP, KHR
  
Code quality:
- All immutable, no setters
- Include validation in constructor
- All extend ValueObject from src/common/abstracts/value-object.ts
- Follow Value Object Pattern from PATTERNS.md exactly
```

---

# PHASE 3: User Module (Weeks 3-4)

## Prompt 3.1: Prisma Schema for User Module (CORRECTED)

```
I'm implementing Phase 3 of JobFits backend - User Module.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Prisma Schema, lines 1000-1500)
2. ./docs/BACKEND_PART1.md (User Module: Database Schema section)
3. ./docs/QUICK_REFERENCE.md (Enum values)
4. ./docs/PATTERNS.md (Prisma Query Pattern section)

Task: Create Prisma schema for User module

File to update:
prisma/schema.prisma

Requirements (exact structure from BACKEND_PART1.md):
Add these models in this exact order:

1. User model:
   - id (String @id @default(cuid()))
   - supabaseId (String @unique)
   - email (String @unique)
   - role (UserRole @default(JOB_SEEKER))
   - subscriptionTier (SubscriptionTier @default(FREE))
   - Relations: profile, experiences[], educations[], certifications[], skills[], resumes[], applications[], recommendations[], notifications[]
   - createdAt, updatedAt, deletedAt?
   - Indexes: email, subscriptionTier

2. Profile, Experience, Education, Certification, UserSkill, UserAnalytics models
   - See BACKEND_PART1.md for exact fields
   - All have userId relations and soft delete support (deletedAt)

Validation (from QUICK_REFERENCE.md):
- Use exact enum values
- All timestamps use DateTime type
- All IDs use cuid() default
- All arrays use [] notation

After creating:
1. npx prisma format
2. npx prisma migrate dev --name user_module
3. npx prisma generate

Code quality:
- Follow Prisma best practices
- Use exact schema from BACKEND_PART1.md
- Include all relationships and indexes
```

---

## Prompt 3.2: User Entity (CORRECTED)

```
I'm implementing Phase 3 of JobFits backend - User Module.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: User Entity, lines 1500-2000)
2. ./docs/BACKEND_PART1.md (User Module: User Entity section)
3. ./docs/PATTERNS.md (Entity Pattern - Aggregate Root section)
4. ./docs/QUICK_REFERENCE.md (UserRole, SubscriptionTier enums)

Task: Create the User aggregate root entity

File to create:
src/modules/user/domain/entities/user.entity.ts

Requirements (from PATTERNS.md & BACKEND_PART1.md):
- Extend AggregateRoot (not Entity - this is an aggregate!)
- Properties:
  - supabaseId: string
  - email: string
  - role: UserRole
  - subscriptionTier: SubscriptionTier
  - id, createdAt, updatedAt (inherited from AggregateRoot)

- Constructor: accept props object with above fields

- static create() factory method:
  - Takes supabaseId, email, role? (defaults to JOB_SEEKER from QUICK_REFERENCE.md)
  - Creates new User instance
  - Emits UserCreatedEvent (from Prompt 3.3)
  - Returns User instance

- Methods:
  - upgradeSubscription(tier: SubscriptionTier): void
    - Changes subscriptionTier to one of: FREE, PREMIUM, PROFESSIONAL
    - Updates updatedAt
  - changeRole(role: UserRole): void
    - Changes role to one of: JOB_SEEKER, EMPLOYER, ADMIN
    - Updates updatedAt

Code quality:
- Extend AggregateRoot from @/common/abstracts/aggregate-root.ts
- Use enums from @/shared/kernel/enums
- Include JSDoc comments
- Follow Aggregate Root Pattern from PATTERNS.md
```

---

## Prompt 3.3: User Domain Events (CORRECTED)

```
I'm implementing Phase 3 of JobFits backend - User Module.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Domain Events, lines 2000-2100)
2. ./docs/PATTERNS.md (Domain Event Pattern section)
3. ./docs/BACKEND_PART1.md (Events section)

Task: Create domain events for User module

Files to create:
src/modules/user/domain/events/
├── user-created.event.ts
├── profile-updated.event.ts
├── skill-added.event.ts
└── skill-removed.event.ts

Requirements (from PATTERNS.md):
- UserCreatedEvent:
  - aggregateId (from constructor super call)
  - email: string
  - Constructor: (aggregateId, email)

- ProfileUpdatedEvent:
  - aggregateId
  - changedField: string (from BACKEND_PART1.md: "firstName", "lastName", "bio", etc.)
  - oldValue: any
  - newValue: any

- SkillAddedEvent:
  - aggregateId
  - skillId: string
  - skillName: string

- SkillRemovedEvent:
  - aggregateId
  - skillId: string
  - skillName: string

Code quality:
- All extend DomainEvent from @/common/abstracts/domain-event.ts
- All call super(aggregateId) in constructor
- Export all from index.ts
- Follow Domain Event Pattern from PATTERNS.md
```

---

## Prompt 3.4: User Service (CORRECTED)

```
I'm implementing Phase 3 of JobFits backend - User Module.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: User Service, lines 3000-3400)
2. ./docs/BACKEND_PART1.md (User Module: UserService section)
3. ./docs/PATTERNS.md (Service Pattern with Events section)
4. ./docs/QUICK_REFERENCE.md (ERROR_MESSAGES for NotFoundException, BadRequestException)

Task: Create User service with domain event publishing

File to create:
src/modules/user/application/services/user.service.ts

Requirements (from PATTERNS.md & BACKEND_PART1.md):
- @Injectable()
- Constructor: inject UserRepository, DomainEventBus

- Methods (from BACKEND_PART1.md):
  - async createUser(dto: CreateUserDto): Promise<User>
    - Create User aggregate via User.create()
    - Save via repository
    - Publish domain events (UserCreatedEvent)
    - Clear events from aggregate
    - Return user

  - async getUserById(id: string): Promise<User>
    - Call repository.findById()
    - Throw NotFoundException if not found (use ERROR_MESSAGES.USER_NOT_FOUND)
    - Return user

  - async getUserByEmail(email: string): Promise<User | null>
    - Call repository.findByEmail()
    - Return user or null

  - async upgradeSubscription(userId: string, tier: SubscriptionTier): Promise<User>
    - Get user by id
    - Call user.upgradeSubscription(tier)
    - Save via repository
    - Publish events
    - Return user

  - async deleteUser(id: string): Promise<void>
    - Verify user exists
    - Call repository.delete() (soft delete)

Code quality:
- Use DomainEventBus for publishing (see PATTERNS.md for exact pattern)
- Include proper error handling with ERROR_MESSAGES from QUICK_REFERENCE.md
- Return domain entities, not Prisma models
- Follow Service Pattern from PATTERNS.md
```

---

## Prompt 3.5: User Repository (CORRECTED)

```
I'm implementing Phase 3 of JobFits backend - User Module.

REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: User Repository, lines 2300-2600)
2. ./docs/BACKEND_PART1.md (User Module: Database Access section)
3. ./docs/PATTERNS.md (Repository Pattern section)

Task: Create User repository

File to create:
src/modules/user/infrastructure/repositories/user.repository.ts

Requirements (from PATTERNS.md & BACKEND_PART1.md):
- Extend IRepository<User>
- @Injectable()
- Constructor: inject PrismaService

- Methods:
  - async save(user: User): Promise<void>
    - upsert with id
    - update: supabaseId, email, role, subscriptionTier, updatedAt
    - create: all above plus createdAt
  
  - async findById(id: string): Promise<User | null>
    - findUnique by id
    - Return mapped User entity or null
  
  - async findByEmail(email: string): Promise<User | null>
    - findUnique by email
    - Return mapped User entity or null
  
  - async findBySupabaseId(supabaseId: string): Promise<User | null>
    - findUnique by supabaseId
    - Return mapped User entity or null
  
  - async findAll(skip: number = 0, take: number = 20): Promise<User[]>
    - findMany with deletedAt null (from BACKEND_PART1.md)
    - Apply pagination
    - Return mapped array
  
  - async delete(id: string): Promise<void>
    - Soft delete: update with deletedAt = new Date()

- Private mapToDomain(raw: any): User
  - Maps Prisma result to User entity
  - Returns: new User({ supabaseId, email, role, subscriptionTier }, id)

Code quality:
- Use PrismaService from @/infrastructure/database/prisma.service
- All results mapped back to domain entity (not Prisma models)
- Implement IRepository<User> interface
- Follow Repository Pattern from PATTERNS.md
- Include soft delete pattern from BACKEND_PART1.md
```

---

## Prompt 3.6: Profile, Experience, Education, Certification Entities
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Additional Entities).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Additional Entities, lines 2600-3000)
2. ./docs/BACKEND_PART1.md (User Module: Profile, Experience, Education, Certification sections)
3. ./docs/PATTERNS.md (Entity Pattern section)
4. ./docs/QUICK_REFERENCE.md (JobLevel, RemoteType, EmploymentType, DegreeLevel enums)
 
Task: Create Profile, Experience, Education, Certification entities
 
Files to create:
1. src/modules/user/domain/entities/profile.entity.ts
2. src/modules/user/domain/entities/experience.entity.ts
3. src/modules/user/domain/entities/education.entity.ts
4. src/modules/user/domain/entities/certification.entity.ts
5. src/modules/user/domain/entities/index.ts (export all)
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
Profile entity:
- Properties:
  - userId: string (FK to User)
  - firstName: string
  - lastName: string
  - phone?: string
  - photoUrl?: string
  - bio?: string (max 500 chars from QUICK_REFERENCE.md)
  - headline?: string
  - location?: Location (use Location value object)
  - desiredJobLevels: JobLevel[] (from QUICK_REFERENCE.md)
  - desiredRemoteTypes: RemoteType[] (from QUICK_REFERENCE.md)
  - desiredEmploymentTypes: EmploymentType[] (from QUICK_REFERENCE.md)
  - desiredIndustries: string[]
  - salaryRange?: SalaryRange (use SalaryRange value object)
  - linkedinUrl?, githubUrl?, portfolioUrl? (validate URLs)
  
- Methods (from BACKEND_PART1.md):
  - static create(props): Profile
  - get fullName(): string (return firstName + " " + lastName)
  - updateWorkPreferences(prefs: { jobLevels?, remoteTypes?, employmentTypes?, industries? }): void
  - Extends Entity from @/common/abstracts/entity.ts
 
Experience entity:
- Properties (from BACKEND_PART1.md):
  - userId: string
  - company: string
  - title: string
  - jobLevel: JobLevel (from QUICK_REFERENCE.md: INTERN, ENTRY, MID, SENIOR, LEAD, MANAGER, DIRECTOR, C_LEVEL)
  - employmentType: EmploymentType (from QUICK_REFERENCE.md: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, FREELANCE)
  - industry: string (Industry entity ID)
  - description?: string
  - isCurrentJob: boolean (@default(false))
  - startDate: Date
  - endDate?: Date
  - technologies: string[]
  
- Methods:
  - static create(props): Experience
  - isCurrentRole(): boolean (returns isCurrentJob)
  - getDuration(): number (calculate years between start and end dates)
  - Extends Entity
 
Education entity:
- Properties (from BACKEND_PART1.md):
  - userId: string
  - institution: string
  - degreeLevel: DegreeLevel (from QUICK_REFERENCE.md: HIGH_SCHOOL, ASSOCIATE, BACHELOR, MASTER, DOCTORATE, CERTIFICATION)
  - fieldOfStudy: string
  - description?: string
  - startDate: Date
  - endDate?: Date
  - gpa?: number (0.0 to 4.0)
  
- Methods:
  - static create(props): Education
  - Extends Entity
 
Certification entity:
- Properties (from BACKEND_PART1.md):
  - userId: string
  - name: string
  - issuer: string
  - credentialId?: string
  - credentialUrl?: string (validate URL format)
  - issueDate: Date
  - expirationDate?: Date
  
- Methods:
  - static create(props): Certification
  - isExpired(): boolean (check if expirationDate < today)
  - Extends Entity
 
CODE QUALITY (from PATTERNS.md):
- All extend Entity from @/common/abstracts/entity.ts
- All have constructor with props parameter
- All have static create() factory method
- Include business logic methods as specified
- Use Location value object for coordinates
- Use SalaryRange value object for salary
- Import enums from @/shared/kernel/enums
- Export all from index.ts
 
VALIDATION (from QUICK_REFERENCE.md):
- URL_REGEX for website validation
- NAME_MAX_LENGTH (100) for company, institution
- BIO_MAX_LENGTH (500) for description fields
```
 
---
 
## Prompt 3.7: UserSkill and UserAnalytics Entities
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Skills & Analytics).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: UserSkill & Analytics, lines 3000-3200)
2. ./docs/BACKEND_PART1.md (User Module: Skills & Analytics sections)
3. ./docs/PATTERNS.md (Entity Pattern section)
4. ./docs/QUICK_REFERENCE.md (Full enums list)
 
Task: Create UserSkill and UserAnalytics entities
 
Files to create:
1. src/modules/user/domain/entities/user-skill.entity.ts
2. src/modules/user/domain/entities/user-analytics.entity.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
UserSkill entity:
- Properties:
  - userId: string (FK to User)
  - skillId: string (FK to Skill from Shared Kernel)
  - endorsementCount: number (@default(0))
  - proficiencyLevel: string (BEGINNER, INTERMEDIATE, ADVANCED, EXPERT - not an enum, just string)
  - yearsOfExperience?: number
 
- Methods (from BACKEND_PART1.md):
  - static create(props): UserSkill
  - endorse(): void (increment endorsementCount)
  - Extends Entity
 
UserAnalytics entity:
- Properties (from BACKEND_PART1.md):
  - userId: string @unique (one-to-one with User)
  - totalApplications: number (@default(0))
  - totalInterviews: number (@default(0))
  - totalOffers: number (@default(0))
  - applicationAcceptanceRate: number (Float, @default(0)) - calculated: interviews/applications
  - interviewAcceptanceRate: number (Float, @default(0)) - calculated: offers/interviews
  - profileViewCount: number (@default(0))
  - lastProfileViewDate?: Date
 
- Methods (from BACKEND_PART1.md):
  - static create(props): UserAnalytics
  - recordApplication(): void - increment totalApplications, recalculate acceptance rates
  - recordInterview(): void - increment totalInterviews, recalculate rates
  - recordOffer(): void - increment totalOffers, recalculate rates
  - recordProfileView(): void - increment profileViewCount, set lastProfileViewDate = now
  - private calculateApplicationAcceptanceRate(): number
  - private calculateInterviewAcceptanceRate(): number
  - Extends Entity
 
CODE QUALITY (from PATTERNS.md):
- Both extend Entity
- All have factory methods
- Include calculation methods
- Immutable calculations (don't store if can be calculated)
- Import Skill from Shared Kernel
```
 
---
 
## Prompt 3.8: Skills & Experience Services
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Services).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Services, lines 3400-3600)
2. ./docs/BACKEND_PART1.md (User Module: Services section - SkillsService, ExperienceService)
3. ./docs/PATTERNS.md (Service Pattern with Events section)
4. ./docs/QUICK_REFERENCE.md (ERROR_MESSAGES)
 
Task: Create SkillsService and ExperienceService
 
Files to create:
1. src/modules/user/application/services/skills.service.ts
2. src/modules/user/application/services/experience.service.ts
3. src/modules/user/infrastructure/repositories/user-skill.repository.ts
4. src/modules/user/infrastructure/repositories/experience.repository.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
SkillsService (@Injectable):
- Constructor: inject UserSkillRepository, UserRepository, DomainEventBus
 
- Methods (from BACKEND_PART1.md):
  - async addSkill(userId: string, dto: AddSkillDto): Promise<UserSkill>
    - Verify user exists (throw NotFoundException if not)
    - Verify skill exists in Skill table
    - Create UserSkill entity via UserSkill.create()
    - Save to repository
    - Publish SkillAddedEvent with (userId, skillId, skillName)
    - Clear events
    - Return skill
 
  - async removeSkill(userId: string, skillId: string): Promise<void>
    - Verify skill exists for user
    - Soft delete via repository
    - Publish SkillRemovedEvent
 
  - async getSkills(userId: string): Promise<UserSkill[]>
    - Get all skills for user (not deleted)
    - Order by endorsementCount desc
    - Return array
 
  - async endorseSkill(userId: string, skillId: string): Promise<void>
    - Find skill (throw NotFound if not exists)
    - Call skill.endorse()
    - Save to repository
    - (optional) publish SkillEndorsedEvent
 
ExperienceService (@Injectable):
- Constructor: inject ExperienceRepository, UserRepository, DomainEventBus
 
- Methods (from BACKEND_PART1.md):
  - async addExperience(userId: string, dto: AddExperienceDto): Promise<Experience>
    - Verify user exists
    - Validate: startDate <= endDate (if both provided)
    - Validate: if isCurrentJob=true, no endDate allowed
    - Create Experience entity
    - Save to repository
    - Publish ExperienceAddedEvent
    - Return experience
 
  - async getExperiences(userId: string): Promise<Experience[]>
    - Get all experiences for user
    - Order by startDate desc
    - Return array
 
  - async updateExperience(id: string, dto: UpdateExperienceDto): Promise<Experience>
    - Find experience
    - Update allowed fields: company, title, jobLevel, description, endDate, technologies
    - Save
    - Return updated
 
  - async deleteExperience(id: string): Promise<void>
    - Soft delete via repository
 
CODE QUALITY (from PATTERNS.md):
- Use Service Pattern with Events template
- Inject repositories and event bus
- Call repository methods, not Prisma directly
- Publish events via eventBus.publish()
- Clear events after publishing
- Return domain entities, not Prisma models
- Error handling: throw appropriate exceptions from QUICK_REFERENCE.md
 
REPOSITORIES (from PATTERNS.md):
- UserSkillRepository: save(), findById(), findByUserId(), delete()
- ExperienceRepository: save(), findById(), findByUserId(), delete()
```
 
---
 
## Prompt 3.9: Education, Analytics & Profile Services
 
```
I'm implementing Phase 3 of JobFits backend - User Module (More Services).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Services, lines 3400-3800)
2. ./docs/BACKEND_PART1.md (User Module: Services - EducationService, ProfileService, UserAnalyticsService)
3. ./docs/PATTERNS.md (Service Pattern section)
4. ./docs/QUICK_REFERENCE.md (Location value object usage)
 
Task: Create EducationService, ProfileService, UserAnalyticsService
 
Files to create:
1. src/modules/user/application/services/education.service.ts
2. src/modules/user/application/services/profile.service.ts
3. src/modules/user/application/services/user-analytics.service.ts
4. src/modules/user/infrastructure/repositories/education.repository.ts
5. src/modules/user/infrastructure/repositories/profile.repository.ts
6. src/modules/user/infrastructure/repositories/user-analytics.repository.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
EducationService (@Injectable):
- Constructor: inject EducationRepository, UserRepository, DomainEventBus
 
- Methods:
  - async addEducation(userId: string, dto: AddEducationDto): Promise<Education>
    - Verify user exists
    - Validate: startDate <= endDate (if both provided)
    - Create Education entity
    - Save
    - Publish EducationAddedEvent
    - Return education
 
  - async getEducations(userId: string): Promise<Education[]>
    - Get all for user, order by endDate desc
 
  - async updateEducation(id: string, dto: any): Promise<Education>
    - Find, update, save, return
 
  - async deleteEducation(id: string): Promise<void>
    - Soft delete
 
ProfileService (@Injectable):
- Constructor: inject ProfileRepository, UserRepository, DomainEventBus
 
- Methods (from BACKEND_PART1.md):
  - async createProfile(userId: string, dto: CreateProfileDto): Promise<Profile>
    - Verify user exists
    - Create Profile entity using Location and SalaryRange value objects
    - Save to repository
    - Publish ProfileCreatedEvent
    - Return profile
 
  - async getProfile(userId: string): Promise<Profile>
    - Find by userId
    - Throw NotFoundException if not found
    - Return profile
 
  - async updateProfile(userId: string, dto: UpdateProfileDto): Promise<Profile>
    - Get profile
    - Update fields: firstName, lastName, phone, bio, headline, location, linkedinUrl, githubUrl, portfolioUrl
    - Save
    - Publish ProfileUpdatedEvent
    - Return updated profile
 
  - async updateWorkPreferences(userId: string, prefs: any): Promise<Profile>
    - Get profile
    - Call profile.updateWorkPreferences(prefs)
    - Save
    - Publish PreferencesUpdatedEvent
    - Return profile
 
  - async updateSalaryExpectations(userId: string, min: number, max: number): Promise<Profile>
    - Validate: min > 0, max > min (from SalaryRange)
    - Create SalaryRange value object (validates)
    - Update profile.salaryRange
    - Save
    - Return profile
 
UserAnalyticsService (@Injectable):
- Constructor: inject UserAnalyticsRepository, UserRepository
 
- Methods (from BACKEND_PART1.md):
  - async getAnalytics(userId: string): Promise<UserAnalytics>
    - Get analytics
    - If not found, create default entry
    - Return analytics
 
  - async recordApplicationSubmitted(userId: string): Promise<void>
    - Get analytics
    - Call analytics.recordApplication()
    - Save
 
  - async recordInterviewScheduled(userId: string): Promise<void>
    - Get analytics
    - Call analytics.recordInterview()
    - Save
 
  - async recordOfferReceived(userId: string): Promise<void>
    - Get analytics
    - Call analytics.recordOffer()
    - Save
 
  - async recordProfileView(userId: string): Promise<void>
    - Get analytics
    - Call analytics.recordProfileView()
    - Save
 
CODE QUALITY (from PATTERNS.md):
- All use Service Pattern template
- Use value objects (Location, SalaryRange)
- Publish events via event bus
- Error handling with appropriate exceptions
- Return domain entities only
```
 
---
 
## Prompt 3.10: User DTOs & Validation
 
```
I'm implementing Phase 3 of JobFits backend - User Module (DTOs).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: DTOs, lines 2100-2300)
2. ./docs/BACKEND_PART1.md (User Module: API section - request/response formats)
3. ./docs/PATTERNS.md (DTO Pattern section)
4. ./docs/QUICK_REFERENCE.md (VALIDATION constants, JobLevel, RemoteType enums)
 
Task: Create all DTOs for User module
 
Files to create:
src/modules/user/application/dtos/
├── create-user.dto.ts
├── create-profile.dto.ts
├── update-profile.dto.ts
├── add-skill.dto.ts
├── add-experience.dto.ts
├── add-education.dto.ts
├── add-certification.dto.ts
└── user-response.dto.ts
 
REQUIREMENTS FROM PATTERNS.md & QUICK_REFERENCE.md:
 
CreateUserDto:
- @IsEmail() email: string
- @IsNotEmpty() @IsString() supabaseId: string
- @IsNotEmpty() @IsString() @MinLength(NAME_MIN_LENGTH) firstName: string
- @IsNotEmpty() @IsString() @MinLength(NAME_MIN_LENGTH) lastName: string
 
CreateProfileDto:
- @IsNotEmpty() @IsString() firstName, lastName
- @IsOptional() @IsString() @MaxLength(500) bio
- @IsOptional() @IsString() phone (validate with PHONE_REGEX)
- @IsOptional() @IsString() headline
- @IsOptional() city, state, country
- @IsOptional() @IsNumber() latitude, longitude
- @IsOptional() @IsArray() @IsEnum(JobLevel, { each: true }) desiredJobLevels
- @IsOptional() @IsArray() @IsEnum(RemoteType, { each: true }) desiredRemoteTypes
- @IsOptional() @IsArray() @IsEnum(EmploymentType, { each: true }) desiredEmploymentTypes
- @IsOptional() @IsArray() @IsString({ each: true }) desiredIndustries
- @IsOptional() @IsNumber() minSalary, maxSalary
 
UpdateProfileDto: (use PartialType from PATTERNS.md)
 
AddSkillDto:
- @IsNotEmpty() @IsString() skillId
- @IsOptional() @IsEnum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']) proficiencyLevel
- @IsOptional() @IsNumber() yearsOfExperience
 
AddExperienceDto:
- @IsNotEmpty() @IsString() company
- @IsNotEmpty() @IsString() title
- @IsNotEmpty() @IsEnum(JobLevel) jobLevel
- @IsNotEmpty() @IsEnum(EmploymentType) employmentType
- @IsNotEmpty() @IsString() industry
- @IsOptional() @IsString() description
- @IsNotEmpty() @IsDateString() startDate
- @IsOptional() @IsDateString() endDate
- @IsOptional() @IsBoolean() isCurrentJob
- @IsOptional() @IsArray() @IsString({ each: true }) technologies
 
AddEducationDto:
- @IsNotEmpty() @IsString() institution
- @IsNotEmpty() @IsEnum(DegreeLevel) degreeLevel
- @IsNotEmpty() @IsString() fieldOfStudy
- @IsOptional() @IsString() description
- @IsNotEmpty() @IsDateString() startDate
- @IsOptional() @IsDateString() endDate
- @IsOptional() @IsNumber() @Min(0) @Max(4) gpa
 
AddCertificationDto:
- @IsNotEmpty() @IsString() name
- @IsNotEmpty() @IsString() issuer
- @IsOptional() @IsString() credentialId
- @IsOptional() @IsString() credentialUrl (validate URL_REGEX)
- @IsNotEmpty() @IsDateString() issueDate
- @IsOptional() @IsDateString() expirationDate
 
UserResponseDto:
- id: string
- email: string
- role: UserRole
- subscriptionTier: SubscriptionTier
- createdAt: Date
- updatedAt: Date
- Constructor(user: User) - extracts these fields from entity
 
CODE QUALITY (from PATTERNS.md):
- Use class-validator decorators
- All required fields: @IsNotEmpty()
- All optional fields: @IsOptional()
- Use specific decorators: @IsEmail(), @IsEnum(), @IsDateString(), etc.
- Import from class-validator and @nestjs/class-validator
- Validation rules from QUICK_REFERENCE.md VALIDATION object
```
 
---
 
## Prompt 3.11: User Controllers
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Controllers).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Controllers, lines 4000-4300)
2. ./docs/BACKEND_PART1.md (User Module: API Endpoints section)
3. ./docs/PATTERNS.md (Controller Pattern section)
4. ./docs/QUICK_REFERENCE.md (HTTP Status Codes, ERROR_MESSAGES)
 
Task: Create User controller
 
File to create:
src/modules/user/presentation/controllers/user.controller.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
UserController (@Controller('users')):
- Constructor: inject UserService
 
Endpoints (from BACKEND_PART1.md):
1. @Post()
   - POST /users
   - @Body() dto: CreateUserDto
   - Call userService.createUser(dto)
   - Return { id, email, role, subscriptionTier }
   - Response: 201 CREATED
 
2. @Get(':id')
   - GET /users/:id
   - @Param('id') id: string
   - Call userService.getUserById(id)
   - Return UserResponseDto
   - Throw NotFoundException (from QUICK_REFERENCE.md) if not found
   - Response: 200 OK
 
3. @Get('email/:email')
   - GET /users/email/:email
   - @Public() decorator (no auth required)
   - @Param('email') email: string
   - Call userService.getUserByEmail(email)
   - Return UserResponseDto or null
   - Response: 200 OK or 404
 
4. @Get()
   - GET /users
   - @Query('skip') skip: string = '0'
   - @Query('take') take: string = '20'
   - Parse to numbers: skipNum = parseInt(skip, 10), takeNum = Math.min(parseInt(take), 100)
   - Call userService.getAll(skipNum, takeNum)
   - Return array of UserResponseDto
   - Response: 200 OK
 
5. @Patch(':id/subscription')
   - PATCH /users/:id/subscription
   - @UseGuards(SupabaseAuthGuard)
   - @Body() { tier: SubscriptionTier }
   - Valid tiers from QUICK_REFERENCE.md: FREE, PREMIUM, PROFESSIONAL
   - Call userService.upgradeSubscription(id, tier)
   - Return UserResponseDto
   - Response: 200 OK
 
6. @Delete(':id')
   - DELETE /users/:id
   - @UseGuards(SupabaseAuthGuard)
   - Call userService.deleteUser(id)
   - Response: 204 NO_CONTENT
 
CODE QUALITY (from PATTERNS.md):
- @Controller('users')
- Use @UseGuards(SupabaseAuthGuard) on protected endpoints
- Use @Public() on public read endpoints
- Use @CurrentUser() to extract user from request
- Return response DTOs, not entities
- @HttpCode() for status codes
- Throw appropriate exceptions: NotFoundException, BadRequestException
- Use error messages from QUICK_REFERENCE.md
```
 
---
 
## Prompt 3.12: Profile Controller
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Profile Controller).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Controllers, lines 4300-4400)
2. ./docs/BACKEND_PART1.md (User Module: Profile endpoints)
3. ./docs/PATTERNS.md (Controller Pattern section)
4. ./docs/QUICK_REFERENCE.md (HTTP Status Codes)
 
Task: Create Profile controller
 
File to create:
src/modules/user/presentation/controllers/profile.controller.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
ProfileController (@Controller('profiles')):
- Constructor: inject ProfileService
 
Endpoints:
1. @Post()
   - POST /profiles
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user: any
   - @Body() dto: CreateProfileDto
   - Call profileService.createProfile(user.id, dto)
   - Return profile response
   - Response: 201 CREATED
 
2. @Get(':userId')
   - GET /profiles/:userId
   - @Public()
   - @Param('userId') userId: string
   - Call profileService.getProfile(userId)
   - Return profile response
   - Response: 200 OK
 
3. @Patch(':userId')
   - PATCH /profiles/:userId
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user: any
   - Verify user.id === :userId (can only update own)
   - @Body() dto: UpdateProfileDto
   - Call profileService.updateProfile(userId, dto)
   - Return updated profile
   - Response: 200 OK
 
4. @Patch(':userId/preferences')
   - PATCH /profiles/:userId/preferences
   - @UseGuards(SupabaseAuthGuard)
   - @Body() prefs: { jobLevels?, remoteTypes?, employmentTypes?, industries? }
   - Call profileService.updateWorkPreferences(userId, prefs)
   - Return updated profile
   - Response: 200 OK
 
5. @Patch(':userId/salary')
   - PATCH /profiles/:userId/salary
   - @UseGuards(SupabaseAuthGuard)
   - @Body() { minSalary: number, maxSalary: number }
   - Call profileService.updateSalaryExpectations(userId, min, max)
   - Return updated profile
   - Response: 200 OK
 
CODE QUALITY (from PATTERNS.md):
- Controller pattern
- Authorization checks (own profile only)
- Error handling for not found
- Return response DTOs
```
 
---
 
## Prompt 3.13: Skills, Experience, Education Controllers
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Skills/Exp/Ed Controllers).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Controllers, lines 4400-4700)
2. ./docs/BACKEND_PART1.md (User Module: Endpoints for Skills, Experience, Education)
3. ./docs/PATTERNS.md (Controller Pattern section)
4. ./docs/QUICK_REFERENCE.md (HTTP Status Codes, ERROR_MESSAGES)
 
Task: Create Skills, Experience, Education controllers
 
Files to create:
1. src/modules/user/presentation/controllers/skills.controller.ts
2. src/modules/user/presentation/controllers/experience.controller.ts
3. src/modules/user/presentation/controllers/education.controller.ts
 
REQUIREMENTS FROM BACKEND_PART1.md:
 
SkillsController (@Controller('profiles/:userId/skills')):
- Constructor: inject SkillsService
 
Endpoints:
1. @Post()
   - POST /profiles/:userId/skills
   - @UseGuards(SupabaseAuthGuard)
   - @Body() dto: AddSkillDto
   - Call skillsService.addSkill(userId, dto)
   - Return skill response
   - Response: 201 CREATED
 
2. @Get()
   - GET /profiles/:userId/skills
   - @Public()
   - Call skillsService.getSkills(userId)
   - Return array of skills
 
3. @Delete(':skillId')
   - DELETE /profiles/:userId/skills/:skillId
   - @UseGuards(SupabaseAuthGuard)
   - Call skillsService.removeSkill(userId, skillId)
   - Response: 204 NO_CONTENT
 
4. @Patch(':skillId/endorse')
   - PATCH /profiles/:userId/skills/:skillId/endorse
   - @UseGuards(SupabaseAuthGuard)
   - Call skillsService.endorseSkill(userId, skillId)
   - Return updated skill
   - Response: 200 OK
 
ExperienceController (@Controller('profiles/:userId/experience')):
- Constructor: inject ExperienceService
 
Endpoints:
1. @Post()
   - POST /profiles/:userId/experience
   - @UseGuards(SupabaseAuthGuard)
   - @Body() dto: AddExperienceDto
   - Call experienceService.addExperience(userId, dto)
   - Return experience
   - Response: 201 CREATED
 
2. @Get()
   - GET /profiles/:userId/experience
   - @Public()
   - Call experienceService.getExperiences(userId)
   - Return array
 
3. @Patch(':expId')
   - PATCH /profiles/:userId/experience/:expId
   - @UseGuards(SupabaseAuthGuard)
   - @Body() dto: UpdateExperienceDto
   - Call experienceService.updateExperience(expId, dto)
   - Return updated
 
4. @Delete(':expId')
   - DELETE /profiles/:userId/experience/:expId
   - @UseGuards(SupabaseAuthGuard)
   - Call experienceService.deleteExperience(expId)
   - Response: 204 NO_CONTENT
 
EducationController (@Controller('profiles/:userId/education')):
- Constructor: inject EducationService
 
Endpoints (same pattern as Experience):
1. @Post() - create
2. @Get() - list
3. @Patch(':eduId') - update
4. @Delete(':eduId') - delete
 
CODE QUALITY (from PATTERNS.md):
- Controller pattern
- Guard protected endpoints with @UseGuards(SupabaseAuthGuard)
- Verify user ownership
- Return response DTOs
- Appropriate HTTP status codes from QUICK_REFERENCE.md
```
 
---
 
## Prompt 3.14: User Module Registration
 
```
I'm implementing Phase 3 of JobFits backend - User Module (Module Registration).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 3: Module, lines 4700-4800)
2. ./docs/PATTERNS.md (Module Pattern section)
3. ./docs/BACKEND_PART1.md (User Module overview)
 
Task: Create and register User module
 
Files to create:
1. src/modules/user/user.module.ts
2. Update src/app.module.ts
 
REQUIREMENTS FROM PATTERNS.md:
 
user.module.ts (@Module()):
- Controllers (from all prompts):
  - UserController
  - ProfileController
  - SkillsController
  - ExperienceController
  - EducationController
 
- Providers:
  - UserService
  - UserRepository
  - ProfileService
  - ProfileRepository
  - SkillsService
  - UserSkillRepository
  - ExperienceService
  - ExperienceRepository
  - EducationService
  - EducationRepository
  - CertificationService
  - CertificationRepository
  - UserAnalyticsService
  - UserAnalyticsRepository
 
- Exports (for other modules to use):
  - UserService
  - ProfileService
  - SkillsService
  - ExperienceService
  - EducationService
  - UserAnalyticsService
  - UserRepository
  - UserSkillRepository
  - ExperienceRepository
  - EducationRepository
 
- Imports: (none for now, will add in later phases)
 
Update app.module.ts:
- Import UserModule from './modules/user/user.module'
- Add UserModule to imports array
- Order: ConfigModule → SharedModule → UserModule → (future modules)
 
CODE QUALITY (from PATTERNS.md):
- Follow Module Pattern exactly
- Export services that other modules need
- Organize providers list clearly
- Add comments for clarity
```
 
---
 
# PHASE 4: Company Module (Week 4.5)
 
## Prompt 4.1: Company Entity, Repository, Service (COMPLETE)
 
```
I'm implementing Phase 4 of JobFits backend - Company Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 4: Company Module, lines 1-400)
2. ./docs/BACKEND_PART2.md (Company Module section)
3. ./docs/PATTERNS.md (Entity Pattern, Repository Pattern, Service Pattern sections)
4. ./docs/QUICK_REFERENCE.md (Full enums for context)
 
Task: Create Company entity, repository, and service
 
Files to create:
1. Update prisma/schema.prisma - Add Company model
2. src/modules/company/domain/entities/company.entity.ts
3. src/modules/company/infrastructure/repositories/company.repository.ts
4. src/modules/company/application/services/company.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
Prisma Company model:
- id (String @id @default(cuid()))
- name (String @unique)
- description (String?)
- website (String?)
- logoUrl (String?)
- industry (String?) - Industry ID
- size (String?) - STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE
- foundedYear (Int?)
- city, state, country
- glassdoorId (String?)
- glassdoorRating (Float?)
- glassdoorReviews (Int?)
- jobs relation []
- createdAt, updatedAt
- Indexes: name, industry
- Fulltext search on name, description
 
Company entity (extends Entity):
- Properties: name, description?, website?, logoUrl?, industry?, size?, location?, glassdoorRating?
- static create(props): Company
- get displayName(): string (return name)
- Extends Entity from @/common/abstracts/entity.ts
 
CompanyRepository (implements IRepository<Company>):
- save(company), findById(id), delete(id)
- findByName(name): Promise<Company | null>
- search(query: string, filters?): Promise<Company[]> - Postgres FTS
  - Filter by: industry, size
  - Search in: name, description using FTS
- findAll(skip, take): Promise<Company[]>
- private mapToDomain(raw): Company
 
CompanyService (@Injectable):
- Constructor: inject CompanyRepository
 
- Methods (from BACKEND_PART2.md):
  - async createCompany(dto: CreateCompanyDto): Promise<Company>
    - Validate no duplicate name
    - Create entity
    - Save
    - Return company
 
  - async getCompanyById(id: string): Promise<Company>
    - Find by ID
    - Throw NotFoundException if not found
    - Return company
 
  - async searchCompanies(query: string, filters?: { industry?, size? }): Promise<Company[]>
    - Call repository.search()
    - Return results
 
  - async getCompanyStats(id: string): Promise<{ jobCount: number, reviews: number }>
    - Get company
    - Count jobs for company
    - Return stats
 
  - async deleteCompany(id: string): Promise<void>
    - Soft delete
 
CODE QUALITY (from PATTERNS.md):
- Entity pattern for Company
- Repository pattern with FTS search
- Service pattern
- Error handling: NotFoundException, BadRequestException
- Return entities, not Prisma models
 
After creating:
1. npx prisma format
2. npx prisma migrate dev --name company_module
3. npx prisma generate
```
 
---
 
## Prompt 4.2: Company DTO, Controller, Module
 
```
I'm implementing Phase 4 of JobFits backend - Company Module (Controller & Module).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 4: Controller, lines 400-600)
2. ./docs/BACKEND_PART2.md (Company Module: API Endpoints)
3. ./docs/PATTERNS.md (DTO Pattern, Controller Pattern, Module Pattern sections)
4. ./docs/QUICK_REFERENCE.md (HTTP Status Codes)
 
Task: Create Company DTO, controller, and module
 
Files to create:
1. src/modules/company/application/dtos/create-company.dto.ts
2. src/modules/company/presentation/controllers/company.controller.ts
3. src/modules/company/company.module.ts
 
REQUIREMENTS:
 
CreateCompanyDto (from PATTERNS.md):
- @IsNotEmpty() @IsString() @MinLength(2) name
- @IsOptional() @IsString() description
- @IsOptional() @IsString() website (validate URL_REGEX from QUICK_REFERENCE.md)
- @IsOptional() @IsString() logoUrl
- @IsOptional() @IsString() industry
- @IsOptional() @IsEnum(['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']) size
- @IsOptional() @IsNumber() foundedYear
- @IsOptional() city, state, country
 
CompanyController (@Controller('companies')):
- Constructor: inject CompanyService
 
Endpoints (from BACKEND_PART2.md):
1. @Post()
   - POST /companies
   - @UseGuards(SupabaseAuthGuard)
   - @Body() dto: CreateCompanyDto
   - Call createCompany(dto)
   - Return company
   - Response: 201 CREATED
 
2. @Get('search')
   - GET /companies/search?q=google&industry=tech
   - @Public()
   - @Query('q') query: string
   - @Query('industry') industry?: string
   - @Query('size') size?: string
   - Call searchCompanies(query, { industry, size })
   - Return array of companies
   - Response: 200 OK
 
3. @Get(':id')
   - GET /companies/:id
   - @Public()
   - Call getCompanyById(id)
   - Return company
   - Response: 200 OK
 
4. @Get(':id/stats')
   - GET /companies/:id/stats
   - @Public()
   - Call getCompanyStats(id)
   - Return { jobCount, reviews }
   - Response: 200 OK
 
CompanyModule (@Module()):
- Controllers: [CompanyController]
- Providers: [CompanyService, CompanyRepository]
- Exports: [CompanyService]
- Imports: []
 
Update app.module.ts:
- Import CompanyModule
- Add to imports array after UserModule
 
CODE QUALITY (from PATTERNS.md):
- DTO validation
- Controller pattern
- Module pattern
- Error handling
```
 
---
 
# PHASE 5A: Job Module - Core (Week 5)
 
## Prompt 5A.1: Job Entity, Events, Repository, Service
 
```
I'm implementing Phase 5A of JobFits backend - Job Module (Core).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5A: Job Module, lines 1-600)
2. ./docs/BACKEND_PART2.md (Job Module section)
3. ./docs/PATTERNS.md (Aggregate Root Pattern, Repository Pattern with FTS)
4. ./docs/QUICK_REFERENCE.md (JobLevel, RemoteType, EmploymentType, ApplicationStatus enums)
 
Task: Create Job aggregate, events, repository, and service with FTS search
 
Files to create:
1. Update prisma/schema.prisma - Add Job model
2. src/modules/job/domain/entities/job.entity.ts
3. src/modules/job/domain/events/job-created.event.ts
4. src/modules/job/domain/events/job-closed.event.ts
5. src/modules/job/infrastructure/repositories/job.repository.ts
6. src/modules/job/application/services/job.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
Prisma Job model:
- id, companyId (relation)
- title, description, requirements?
- jobLevel (JobLevel enum)
- remoteType (RemoteType)
- employmentType (EmploymentType)
- salaryMin?, salaryMax?, salaryCurrency (@default("USD"))
- city?, state?, country?
- industry?, technologies[]
- applicantCount (@default(0)), viewCount (@default(0))
- isActive (@default(true)), publishedAt, closedAt?, expiresAt?
- applications[], recommendations[]
- createdAt, updatedAt
- Indexes: companyId, jobLevel, remoteType, isActive
- Fulltext on: title, description, requirements
 
Job entity (extends AggregateRoot):
- Properties: companyId, title, description, requirements?, jobLevel, remoteType, employmentType, salaryMin?, salaryMax?, city?, state?, country?, industry?, technologies[], applicantCount, viewCount, isActive
- static create(props): Job
  - Emits JobCreatedEvent(id, title, companyId)
- Methods:
  - incrementApplicantCount(): void
  - incrementViewCount(): void
  - close(): void - sets isActive=false, closedAt=now
- Extends AggregateRoot
 
Domain events:
- JobCreatedEvent: aggregateId, title, companyId
- JobClosedEvent: aggregateId, title
 
JobRepository (implements IRepository<Job>):
- save(), findById(), delete()
- findByCompanyId(companyId): Promise<Job[]>
- search(query, filters): Promise<Job[]> - Postgres FTS
  - Filters from BACKEND_PART2.md: jobLevel, remoteType, employmentType, industry, minSalary, maxSalary, city
  - Search in: title, description, requirements
- findAll(skip, take)
- private mapToDomain(raw): Job
 
JobService (@Injectable):
- Constructor: inject JobRepository, CompanyRepository, DomainEventBus
 
- Methods (from BACKEND_PART2.md):
  - async createJob(dto: CreateJobDto): Promise<Job>
    - Verify company exists
    - Create Job aggregate
    - Save
    - Publish JobCreatedEvent
    - Return job
 
  - async getJobById(id: string): Promise<Job>
    - Find
    - Throw NotFoundException if not found
    - Return job
 
  - async searchJobs(query: string, filters?: any): Promise<Job[]>
    - Call repository.search()
    - Return results
 
  - async getJobsByCompany(companyId: string): Promise<Job[]>
    - Find all for company
    - Return array
 
  - async closeJob(jobId: string): Promise<void>
    - Find job
    - Call job.close()
    - Save
    - Publish JobClosedEvent
 
  - async incrementApplicantCount(jobId: string): Promise<void>
    - Find job
    - Call job.incrementApplicantCount()
    - Save
 
  - async incrementViewCount(jobId: string): Promise<void>
    - Find job
    - Call job.incrementViewCount()
    - Save
 
CODE QUALITY (from PATTERNS.md):
- Aggregate Root pattern
- Event publishing
- FTS search in repository
- Error handling
- Domain events
 
After creating:
1. npx prisma migrate dev --name job_module
```
 
---
 
## Prompt 5A.2: Job DTO, Controller, Module
 
```
I'm implementing Phase 5A of JobFits backend - Job Module (Controller & Module).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5A: Controller, lines 600-900)
2. ./docs/BACKEND_PART2.md (Job Module: API Endpoints)
3. ./docs/PATTERNS.md (DTO Pattern, Controller Pattern)
4. ./docs/QUICK_REFERENCE.md (JobLevel, RemoteType, EmploymentType, URL_REGEX)
 
Task: Create Job DTO, controller, and module
 
Files to create:
1. src/modules/job/application/dtos/create-job.dto.ts
2. src/modules/job/presentation/controllers/job.controller.ts
3. src/modules/job/job.module.ts
 
REQUIREMENTS:
 
CreateJobDto (from PATTERNS.md):
- @IsNotEmpty() @IsString() companyId
- @IsNotEmpty() @IsString() title
- @IsNotEmpty() @IsString() description
- @IsOptional() @IsString() requirements
- @IsEnum(JobLevel) jobLevel
- @IsEnum(RemoteType) remoteType
- @IsEnum(EmploymentType) employmentType
- @IsOptional() @IsNumber() salaryMin, salaryMax
- @IsOptional() city, state, country
- @IsOptional() @IsString() industry
- @IsOptional() @IsArray() @IsString({ each: true }) technologies
 
JobController (@Controller('jobs')):
- Constructor: inject JobService
 
Endpoints (from BACKEND_PART2.md):
1. @Post()
   - POST /jobs
   - @UseGuards(SupabaseAuthGuard)
   - Create job
   - Response: 201
 
2. @Get('search')
   - GET /jobs/search?q=senior&jobLevel=SENIOR
   - @Public()
   - Search with filters
   - Response: 200
 
3. @Get(':id')
   - GET /jobs/:id
   - @Public()
   - Increment viewCount
   - Return job
   - Response: 200
 
4. @Get('company/:companyId')
   - GET /jobs/company/:companyId
   - @Public()
   - Return company's jobs
   - Response: 200
 
5. @Patch(':id')
   - PATCH /jobs/:id
   - @UseGuards(SupabaseAuthGuard)
   - Update job
   - Response: 200
 
6. @Patch(':id/close')
   - PATCH /jobs/:id/close
   - @UseGuards(SupabaseAuthGuard)
   - Call closeJob()
   - Response: 200
 
JobModule (@Module()):
- imports: [SharedModule, CompanyModule]
- controllers: [JobController]
- providers: [JobService, JobRepository]
- exports: [JobService, JobRepository]
 
Update app.module.ts:
- Add JobModule to imports
```
 
---
 
# PHASE 5B: Resume Module - Upload & Parsing (Weeks 5-6)
 
## Prompt 5B.1: Resume Module - Upload with Supabase
 
```
I'm implementing Phase 5B of JobFits backend - Resume Module (Upload).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5B: Resume Upload, lines 1-600)
2. ./docs/BACKEND_PART2.md (Resume Module: Upload section)
3. ./docs/PATTERNS.md (Entity Pattern, Repository Pattern, Service Pattern)
4. ./docs/QUICK_REFERENCE.md (Error messages, HTTP codes)
 
Task: Create Resume module with Supabase storage integration
 
Files to create:
1. Update prisma/schema.prisma - Add Resume, ParsedResumeData models
2. src/modules/resume/domain/entities/resume.entity.ts
3. src/infrastructure/storage/supabase-storage.service.ts
4. src/modules/resume/infrastructure/repositories/resume.repository.ts
5. src/modules/resume/infrastructure/repositories/parsed-resume-data.repository.ts
6. src/modules/resume/application/services/resume.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
Prisma models:
- Resume model:
  - id, userId (relation)
  - fileName, fileUrl, fileSize, fileType (PDF or DOCX)
  - title?, isDefault (@default(false))
  - parsedData relation
  - parsingStatus: PENDING, PROCESSING, SUCCESS, FAILED
  - parsingError?
  - atsScore?, qualityScore?
  - version (@default(1))
  - applications[], recommendations[]
  - createdAt, updatedAt
  - Indexes: userId, isDefault, parsingStatus
 
- ParsedResumeData model:
  - id, resumeId @unique, resume relation
  - fullName?, email?, phone?, location?
  - summary?, experiences?, educations?, skills?, certifications? (JSON strings)
  - rawText?
 
Resume entity (extends AggregateRoot):
- Properties: userId, fileName, fileUrl, fileSize, fileType, title?, isDefault, parsingStatus, atsScore?, qualityScore?
- static create(props): Resume
- updateParsingStatus(status, error?): void
- setAsDefault(): void
 
SupabaseStorageService (@Injectable):
- Constructor: inject environment config
- upload(path: string, file: Express.Multer.File): Promise<string>
  - Upload to Supabase Storage
  - Return fileUrl
- download(fileUrl: string): Promise<Buffer>
  - Download file from Supabase
  - Return buffer
- delete(fileUrl: string): Promise<void>
  - Delete file from Supabase
 
ResumeService (@Injectable):
- Constructor: inject ResumeRepository, UserRepository, SupabaseStorageService, BullMQ
 
- Methods (from BACKEND_PART2.md):
  - async uploadResume(userId: string, file: Express.Multer.File, title?: string): Promise<Resume>
    - Verify user exists
    - Upload to Supabase via SupabaseStorageService
    - Create Resume entity
    - Save to repository
    - Queue parsing job via BullMQ
    - Return resume with PENDING status
 
  - async getResume(resumeId: string): Promise<Resume>
    - Find resume
    - Return
 
  - async getUserResumes(userId: string): Promise<Resume[]>
    - Find all for user
    - Order by createdAt desc
 
  - async deleteResume(resumeId: string): Promise<void>
    - Find resume
    - Delete from Supabase
    - Soft delete from DB
 
  - async setDefaultResume(userId: string, resumeId: string): Promise<void>
    - Unset other defaults for user
    - Set this one as default
 
ResumeRepository (implements IRepository<Resume>):
- save(), findById(), delete()
- findByUserId(userId): Promise<Resume[]>
- findDefaultByUserId(userId): Promise<Resume | null>
 
ParsedResumeDataRepository:
- save(), findByResumeId()
- updateParsingStatus(resumeId, status, error?)
 
CODE QUALITY (from PATTERNS.md):
- Entity pattern
- Repository pattern
- Service pattern
- Error handling
- File handling with proper validation
 
After creating:
1. npx prisma migrate dev --name resume_module
2. Configure Supabase environment variables
3. Install npm packages: pdf-parse, mammoth
```
 
---
 
## Prompt 5B.2: Resume Async Parsing with BullMQ
 
```
I'm implementing Phase 5B of JobFits backend - Resume Module (Async Parsing).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5B: Async Parsing, lines 600-1200)
2. ./docs/BACKEND_PART2.md (Resume Module: Parsing section)
3. ./docs/PATTERNS.md (Service Pattern section)
4. ./docs/QUICK_REFERENCE.md (Error messages)
 
Task: Create async resume parsing with BullMQ and PDF/DOCX extraction
 
Files to create:
1. src/infrastructure/queue/bull-queue.service.ts
2. src/modules/resume/application/services/resume-parser.service.ts
3. src/modules/resume/infrastructure/queue/resume-parsing.processor.ts
4. src/modules/resume/domain/events/resume-parsed.event.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
BullQueueService (@Injectable):
- Uses @nestjs/bull for job queue
- Configuration: connect to Redis from .env
- Methods:
  - addJob(queueName, jobName, data): Promise<Job>
  - getJob(jobId): Promise<Job | undefined>
  - removeJob(jobId): Promise<void>
 
ResumeParsing (Processor):
- @Processor('resume-parsing')
- @Process('parseResume') handle(job: Job)
- Receives job.data: { resumeId, fileUrl, fileType }
- Calls ResumeParserService.parseResume()
- Handles errors: update parsingStatus = "FAILED", parsingError = error message
 
ResumeParserService (@Injectable):
- Constructor: inject ResumeRepository, ParsedResumeDataRepository, SupabaseStorageService
 
- Methods (from BACKEND_PART2.md):
  - async parseResume(resumeId: string, fileUrl: string, fileType: string): Promise<void>
    - Download file from Supabase
    - Extract text based on fileType (PDF or DOCX)
    - Parse structured data
    - Save ParsedResumeData
    - Update Resume.parsingStatus = "SUCCESS"
    - Emit ResumeParsedEvent
    - Error handling: catch, log, update status = "FAILED"
 
  - private async extractText(buffer: Buffer, fileType: string): Promise<string>
    - If PDF: use pdf-parse library
    - If DOCX: use mammoth library
    - Return plain text
 
  - private async extractStructuredData(text: string): Promise<ParsedData>
    - Extract: fullName (from common patterns like "John Doe")
    - Extract: email (find email pattern)
    - Extract: phone (use PHONE_REGEX from QUICK_REFERENCE.md)
    - Extract: location (find common location patterns)
    - Extract: experiences (parse job sections)
    - Extract: educations (parse education sections)
    - Extract: skills (find skill keywords)
    - Return { fullName, email, phone, location, experiences, educations, skills }
 
ResumeParsedEvent:
- Extends DomainEvent
- aggregateId (resumeId)
- fullName?: string
- email?: string
 
CODE QUALITY (from PATTERNS.md):
- Processor pattern for async jobs
- Error handling with try-catch
- Event publishing
- Use value objects where applicable
 
Dependencies:
- npm install @nestjs/bull bull
- npm install pdf-parse mammoth
- Configure BullModule in resume.module.ts
```
 
---
 
## Prompt 5B.3: Resume Controller & Module
 
```
I'm implementing Phase 5B of JobFits backend - Resume Module (Controller).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5B: Controller, lines 1200-1500)
2. ./docs/BACKEND_PART2.md (Resume Module: API Endpoints)
3. ./docs/PATTERNS.md (Controller Pattern with FileInterceptor)
4. ./docs/QUICK_REFERENCE.md (HTTP Status Codes)
 
Task: Create Resume controller and module
 
Files to create:
1. src/modules/resume/application/dtos/upload-resume.dto.ts
2. src/modules/resume/presentation/controllers/resume.controller.ts
3. src/modules/resume/resume.module.ts
 
REQUIREMENTS:
 
UploadResumeDto:
- @IsOptional() @IsString() @MinLength(2) title?: string
- file: Express.Multer.File (handled by @UseInterceptors)
- Validation: file type (PDF, DOCX), max 5MB
 
ResumeController (@Controller('resumes')):
- Constructor: inject ResumeService
 
Endpoints (from BACKEND_PART2.md):
1. @Post()
   - POST /resumes
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - @UseInterceptors(FileInterceptor('file'))
   - @UploadedFile() file
   - @Body() dto: UploadResumeDto
   - Validate file: PDF or DOCX, max 5MB
   - Call resumeService.uploadResume(user.id, file, dto.title)
   - Return { id, status: PENDING, fileName }
   - Response: 201 CREATED
 
2. @Get()
   - GET /resumes
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - Call resumeService.getUserResumes(user.id)
   - Return array
   - Response: 200
 
3. @Get(':id')
   - GET /resumes/:id
   - @UseGuards(SupabaseAuthGuard)
   - Call resumeService.getResume(id)
   - Return resume
   - Response: 200
 
4. @Delete(':id')
   - DELETE /resumes/:id
   - @UseGuards(SupabaseAuthGuard)
   - Call resumeService.deleteResume(id)
   - Response: 204
 
5. @Patch(':id/set-default')
   - PATCH /resumes/:id/set-default
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - Call resumeService.setDefaultResume(user.id, id)
   - Response: 200
 
6. @Get(':id/parsing-status')
   - GET /resumes/:id/parsing-status
   - @UseGuards(SupabaseAuthGuard)
   - Return { status, error? }
   - Response: 200
 
ResumeModule (@Module()):
- imports: [
    BullModule.registerQueue({ name: 'resume-parsing' }),
    SharedModule,
    UserModule,
  ]
- controllers: [ResumeController]
- providers: [
    ResumeService,
    ResumeRepository,
    ParsedResumeDataRepository,
    ResumeParserService,
    ResumeParsingProcessor,
  ]
- exports: [ResumeService]
 
Update app.module.ts:
- Add ResumeModule to imports after JobModule
```
 
---
 
# PHASE 5C: Resume Scoring (Week 6)
 
## Prompt 5C.1: Resume Scoring Service
 
```
I'm implementing Phase 5C of JobFits backend - Resume Module (Scoring).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5C: Scoring, lines 1-400)
2. ./docs/BACKEND_PART2.md (Resume Module: Scoring section)
3. ./docs/PATTERNS.md (Service Pattern)
4. ./docs/QUICK_REFERENCE.md (VALIDATION constants)
 
Task: Create resume scoring service
 
File to create:
src/modules/resume/application/services/resume-scorer.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
ResumeScorerService (@Injectable):
 
Algorithm (from BACKEND_PART2.md):
- ATS Score = (20% Formatting) + (30% Keywords) + (20% Parsing) + (15% Length) + (15% Contact Info)
- Quality Score = (30% Content) + (25% Completeness) + (20% Grammar) + (25% Keywords Quality)
 
Methods:
- async calculateATSScore(resumeId: string): Promise<number>
  - Get resume and parsed data
  - Call private scoring methods
  - Return weighted total (0-100)
 
- async calculateQualityScore(resumeId: string): Promise<number>
  - Similar pattern
  - Return weighted total (0-100)
 
Private methods:
- private scoreFormatting(text: string): number
  - Check for bullets (• or -)
  - Check for consistent spacing
  - Check for font consistency
  - Return 0-100
 
- private scoreKeywords(parsed: ParsedResumeData): number
  - Count job keywords from parsed.rawText
  - Compare against common keywords
  - Return 0-100
 
- private scoreParsability(parsed: ParsedResumeData): number
  - Rate how easy to parse
  - Has all sections: name, email, phone, experiences, skills
  - Return 0-100
 
- private scoreLength(text: string): number
  - Ideal 1-2 pages (estimated by character count)
  - Too short or too long = lower score
  - Return 0-100
 
- private scoreContactInfo(parsed: ParsedResumeData): number
  - Has email: yes/no
  - Has phone: yes/no
  - Has location: yes/no
  - Return 0-100 (all = 100)
 
- private scoreContent(parsed: ParsedResumeData): number
  - Has experiences: yes/no
  - Has educations: yes/no
  - Has skills: yes/no
  - Return 0-100
 
- private scoreCompleteness(parsed: ParsedResumeData): number
  - Check for gaps (missing years)
  - Check for all required fields filled
  - Return 0-100
 
- private scoreGrammar(text: string): number
  - Basic spell check
  - Check for common mistakes
  - Return 0-100 (simplified)
 
- private scoreKeywordsQuality(parsed: ParsedResumeData): number
  - Check for industry-relevant skills
  - Count strong action verbs
  - Return 0-100
 
Final calculation (after all scores):
- atsScore = (formatting * 0.2) + (keywords * 0.3) + (parsing * 0.2) + (length * 0.15) + (contactInfo * 0.15)
- qualityScore = (content * 0.3) + (completeness * 0.25) + (grammar * 0.2) + (keywordsQuality * 0.25)
- return Math.round(score) for both
 
CODE QUALITY (from PATTERNS.md):
- Service pattern
- Cacheable: save scores to Resume.atsScore, Resume.qualityScore
- Error handling for missing parsed data
```
 
---
 
## Prompt 5C.2: Resume Scoring Endpoints
 
```
I'm implementing Phase 5C of JobFits backend - Resume Module (Scoring Endpoints).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 5C: Endpoints, lines 400-600)
2. ./docs/BACKEND_PART2.md (Resume Module: API)
3. ./docs/PATTERNS.md (Controller Pattern)
 
Task: Add scoring endpoints to Resume controller
 
File to update:
src/modules/resume/presentation/controllers/resume.controller.ts
 
Endpoints to add (from BACKEND_PART2.md):
 
1. @Get(':id/ats-score')
   - GET /resumes/:id/ats-score
   - @UseGuards(SupabaseAuthGuard)
   - Call resumeScorerService.calculateATSScore(id)
   - Return { resumeId, atsScore, breakdown? }
   - Response: 200
 
2. @Get(':id/quality-score')
   - GET /resumes/:id/quality-score
   - @UseGuards(SupabaseAuthGuard)
   - Call resumeScorerService.calculateQualityScore(id)
   - Return { resumeId, qualityScore, breakdown? }
   - Response: 200
 
3. @Get(':id/scores')
   - GET /resumes/:id/scores
   - @UseGuards(SupabaseAuthGuard)
   - Call both scoring methods
   - Return { atsScore, qualityScore, total: average }
   - Response: 200
 
4. @Post(':id/score')
   - POST /resumes/:id/score
   - @UseGuards(SupabaseAuthGuard)
   - Manually trigger calculation
   - Save scores to Resume entity
   - Return { atsScore, qualityScore }
   - Response: 200
 
CODE QUALITY (from PATTERNS.md):
- Controller pattern
- Guard protected with @UseGuards(SupabaseAuthGuard)
- Return properly formatted responses
- Error handling for invalid resume IDs
```
 
---
 
# PHASE 6: Application Module (Week 7)
 
## Prompt 6.1: Application Entity, Timeline, Contact Person
 
```
I'm implementing Phase 6 of JobFits backend - Application Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 6: Application Module, lines 1-600)
2. ./docs/BACKEND_PART2.md (Application Module section)
3. ./docs/PATTERNS.md (Aggregate Root Pattern, Entity Pattern)
4. ./docs/QUICK_REFERENCE.md (ApplicationStatus enum)
 
Task: Create Application aggregate, timeline, and contact person entities
 
Files to create:
1. Update prisma/schema.prisma - Add Application, ApplicationTimeline, ContactPerson models
2. src/modules/application/domain/entities/application.entity.ts
3. src/modules/application/domain/entities/application-timeline.entity.ts
4. src/modules/application/domain/entities/contact-person.entity.ts
5. src/modules/application/domain/events/application-submitted.event.ts
6. src/modules/application/domain/events/application-status-changed.event.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
Prisma models:
- Application:
  - id, userId (relation), jobId (relation), resumeId? (relation)
  - status (ApplicationStatus @default(SUBMITTED))
  - appliedAt (@default(now()))
  - contactPerson relation
  - notes?, coverLetter?
  - timeline relation
  - createdAt, updatedAt
  - Unique: [userId, jobId]
  - Indexes: userId, status
 
- ApplicationTimeline:
  - id, applicationId (relation)
  - status (ApplicationStatus)
  - eventType (string)
  - description?
  - eventDate (@default(now()))
 
- ContactPerson:
  - id, applicationId @unique
  - name, email?, phone?, title?, linkedinUrl?
 
Application entity (extends AggregateRoot):
- Properties: userId, jobId, resumeId?, status, appliedAt, notes?, coverLetter?
- static create(props): Application
  - Emits ApplicationSubmittedEvent
- Methods:
  - updateStatus(newStatus: ApplicationStatus): void
    - Validates transition
    - Emits ApplicationStatusChangedEvent
  - addContactPerson(name, email?, phone?): void
  - addNote(note: string): void
  
ApplicationTimeline entity (extends Entity):
- Properties: applicationId, status, eventType, description?, eventDate
- static create(props): ApplicationTimeline
- Immutable (no update methods)
 
ContactPerson entity (extends Entity):
- Properties: name, email?, phone?, title?, linkedinUrl?
- static create(props): ContactPerson
 
Domain events:
- ApplicationSubmittedEvent: aggregateId, userId, jobId
- ApplicationStatusChangedEvent: aggregateId, oldStatus, newStatus
 
CODE QUALITY (from PATTERNS.md):
- Aggregate Root pattern for Application
- Entity pattern for others
- Event publishing
- Error handling for invalid status transitions
```
 
---
 
## Prompt 6.2: Application Repositories & Services
 
```
I'm implementing Phase 6 of JobFits backend - Application Module (Repos & Services).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 6: Repositories & Services, lines 600-900)
2. ./docs/BACKEND_PART2.md (Application Module section)
3. ./docs/PATTERNS.md (Repository Pattern, Service Pattern with Events)
4. ./docs/QUICK_REFERENCE.md (ApplicationStatus enum valid transitions)
 
Task: Create application repositories and services
 
Files to create:
1. src/modules/application/infrastructure/repositories/application.repository.ts
2. src/modules/application/infrastructure/repositories/application-timeline.repository.ts
3. src/modules/application/infrastructure/repositories/contact-person.repository.ts
4. src/modules/application/application.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
ApplicationRepository (implements IRepository<Application>):
- save(), findById(), delete()
- findByUserId(userId): Promise<Application[]>
- findByJobId(jobId): Promise<Application[]>
- findByUserAndJob(userId, jobId): Promise<Application | null>
- countByUserId(userId): Promise<number>
 
ApplicationTimelineRepository:
- save(), findById()
- findByApplicationId(applicationId): Promise<ApplicationTimeline[]>
- addEvent(applicationId, status, eventType, description?)
 
ContactPersonRepository:
- save(), findById()
- findByApplicationId(applicationId): Promise<ContactPerson | null>
 
ApplicationService (@Injectable):
- Constructor: inject repositories, UserRepository, JobRepository, DomainEventBus
 
- Methods (from BACKEND_PART2.md):
  - async submitApplication(userId: string, dto: SubmitApplicationDto): Promise<Application>
    - Verify user exists
    - Verify job exists
    - Check no duplicate application (userId + jobId)
    - Create Application aggregate
    - Save to repository
    - Add timeline entry (SUBMITTED)
    - Increment Job.applicantCount
    - Publish ApplicationSubmittedEvent
    - Return application
 
  - async updateStatus(applicationId: string, newStatus: ApplicationStatus): Promise<Application>
    - Get application
    - Validate status transition (from BACKEND_PART2.md valid transitions)
    - Call application.updateStatus(newStatus)
    - Save
    - Add timeline entry (new status)
    - Publish ApplicationStatusChangedEvent
    - Return application
 
  - async getApplications(userId: string, skip?: number, take?: number): Promise<Application[]>
    - Get all for user with pagination
    - Include related job, company info
    - Order by appliedAt desc
 
  - async getApplicationTimeline(applicationId: string): Promise<ApplicationTimeline[]>
    - Get timeline entries
    - Order by eventDate asc
 
  - async addContactPerson(applicationId: string, dto: any): Promise<void>
    - Get application
    - Create ContactPerson
    - Save
 
Valid status transitions (from BACKEND_PART2.md):
- DRAFT → SUBMITTED
- SUBMITTED → SCREENING, WITHDRAWN
- SCREENING → INTERVIEW, REJECTED
- INTERVIEW → OFFER, REJECTED
- OFFER → ACCEPTED, NEGOTIATING, REJECTED
 
CODE QUALITY (from PATTERNS.md):
- Repository pattern
- Service pattern with events
- Validation of status transitions
- Error handling: NotFoundException, BadRequestException
```
 
---
 
## Prompt 6.3: Application Controller & Module
 
```
I'm implementing Phase 6 of JobFits backend - Application Module (Controller).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 6: Controller, lines 900-1200)
2. ./docs/BACKEND_PART2.md (Application Module: API Endpoints)
3. ./docs/PATTERNS.md (DTO Pattern, Controller Pattern)
4. ./docs/QUICK_REFERENCE.md (ApplicationStatus enum, HTTP Status Codes)
 
Task: Create Application controller and module
 
Files to create:
1. src/modules/application/application.dtos/submit-application.dto.ts
2. src/modules/application/presentation/controllers/application.controller.ts
3. src/modules/application/application.module.ts
 
REQUIREMENTS:
 
SubmitApplicationDto:
- @IsNotEmpty() @IsString() jobId
- @IsOptional() @IsString() resumeId
- @IsOptional() @IsString() @MaxLength(1000) coverLetter
- @IsOptional() @IsString() @MaxLength(500) notes
 
ApplicationController (@Controller('applications')):
- Constructor: inject ApplicationService
 
Endpoints (from BACKEND_PART2.md):
1. @Post()
   - POST /applications
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - @Body() dto: SubmitApplicationDto
   - Call submitApplication(user.id, dto)
   - Response: 201
 
2. @Get()
   - GET /applications
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - @Query('status') status?: ApplicationStatus (filter)
   - Call getApplications(user.id)
   - Response: 200
 
3. @Get(':id')
   - GET /applications/:id
   - @UseGuards(SupabaseAuthGuard)
   - Return single application
   - Response: 200
 
4. @Patch(':id/status')
   - PATCH /applications/:id/status
   - @UseGuards(SupabaseAuthGuard)
   - @Body() { newStatus: ApplicationStatus }
   - Call updateStatus(id, newStatus)
   - Response: 200
 
5. @Get(':id/timeline')
   - GET /applications/:id/timeline
   - @UseGuards(SupabaseAuthGuard)
   - Return timeline entries
   - Response: 200
 
6. @Post(':id/contact-person')
   - POST /applications/:id/contact-person
   - @UseGuards(SupabaseAuthGuard)
   - @Body() dto: AddContactPersonDto
   - Call addContactPerson(id, dto)
   - Response: 201
 
ApplicationModule (@Module()):
- imports: [JobModule, ResumeModule, UserModule, SharedModule]
- controllers: [ApplicationController]
- providers: [
    ApplicationService,
    ApplicationRepository,
    ApplicationTimelineRepository,
    ContactPersonRepository,
  ]
- exports: [ApplicationService]
 
Update app.module.ts:
- Add ApplicationModule to imports
```
 
---
 
# PHASE 7: Matching Module (Week 8)
 
## Prompt 7.1: Match Score Calculator & Recommendation Service
 
```
I'm implementing Phase 7 of JobFits backend - Matching Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 7: Matching, lines 1-600)
2. ./docs/BACKEND_PART2.md (Matching Module section)
3. ./docs/PATTERNS.md (Service Pattern)
4. ./docs/QUICK_REFERENCE.md (For context on all enums)
 
Task: Create match score calculator and recommendation service
 
Files to create:
1. Update prisma/schema.prisma - Add Recommendation model
2. src/modules/matching/domain/entities/recommendation.entity.ts
3. src/modules/matching/domain/events/recommendation-generated.event.ts
4. src/modules/matching/infrastructure/repositories/recommendation.repository.ts
5. src/modules/matching/application/services/match-score-calculator.service.ts
6. src/modules/matching/application/services/matching.service.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
Prisma Recommendation model:
- id, userId (relation), jobId (relation)
- matchScore (Int, 0-100)
- explanation (String)
- userAction? (applied, saved, skipped, not_interested)
- createdAt, updatedAt
- Indexes: userId, createdAt
 
Match Score Algorithm (from BACKEND_PART2.md):
- Final Score = (40% Skills) + (20% Experience) + (15% Location) + (15% Salary) + (10% Culture)
 
- scoreSkills(resume, job): 0-100
  - Count overlapping skills
  - Weight by proficiency
  - Normalize by total required
 
- scoreExperience(resume, job): 0-100
  - Years vs job level
  - Title similarity
  - Employment type match
 
- scoreLocation(profile, job): 0-100
  - REMOTE: 100
  - HYBRID: 75 same city, 50 same state, 0 other
  - ON_SITE: 100 same city, 50 same state, 0 other
 
- scoreSalary(profile, job): 0-100
  - Overlaps: 100
  - Within 20%: 75
  - Within 50%: 50
  - Otherwise: 0
 
- scoreCulture(profile, job): 0-100
  - Company glassdoor rating vs preferences
  - Industry match
  - Company size match
 
Recommendation entity (extends AggregateRoot):
- Properties: userId, jobId, matchScore, explanation
- static create(props): Recommendation
- recordUserAction(action: string): void
- Extends AggregateRoot
 
MatchScoreCalculatorService (@Injectable):
- calculateMatchScore(resume, job, profile): Promise<number>
  - Call all scoring methods
  - Apply weights
  - Return Math.round(total) (0-100)
- Private score* methods for each factor
 
RecommendationRepository (implements IRepository<Recommendation>):
- save(), findById(), delete()
- findByUserId(userId): Promise<Recommendation[]>
- countByUserId(userId): Promise<number>
 
MatchingService (@Injectable):
- Constructor: inject repositories, services
 
- Methods (from BACKEND_PART2.md):
  - async generateRecommendations(userId: string): Promise<Recommendation[]>
    - Get user profile and resume
    - Get active jobs matching preferences
    - For each job, calculate match score
    - Filter >= 50% match
    - Save recommendations
    - Publish RecommendationGeneratedEvent
    - Return recommendations
 
  - async recordFeedback(recommendationId: string, action: string): Promise<void>
    - Validate action: applied, saved, skipped, not_interested
    - Find recommendation
    - Call recordUserAction(action)
    - Save
 
  - async getRecommendations(userId: string, limit?, skip?): Promise<Recommendation[]>
    - Get with pagination
    - Order by matchScore desc
 
CODE QUALITY (from PATTERNS.md):
- Service pattern
- Entity pattern
- Event publishing
- Weighted scoring algorithm
```
 
---
 
## Prompt 7.2: Nightly Batch Job & Controller
 
```
I'm implementing Phase 7 of JobFits backend - Matching Module (Batch & Controller).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 7: Batch & Controller, lines 600-1200)
2. ./docs/BACKEND_PART2.md (Matching Module: Batch Job section)
3. ./docs/PATTERNS.md (Service Pattern)
4. ./docs/QUICK_REFERENCE.md (Error handling)
 
Task: Create nightly batch job scheduler and controller
 
Files to create:
1. src/modules/matching/infrastructure/schedule/recommendation.schedule.ts
2. src/modules/matching/domain/events/user-feedback-recorded.event.ts
3. src/modules/matching/presentation/controllers/matching.controller.ts
4. src/modules/matching/matching.module.ts
 
REQUIREMENTS FROM BACKEND_PART2.md:
 
RecommendationScheduleService (@Injectable):
- Constructor: inject MatchingService, UserRepository
 
- @Cron('0 2 * * *') - 2 AM daily
  - @generateNightlyRecommendations()
    - Get all active users
    - For each user:
      - Try: call matchingService.generateRecommendations(userId)
      - Catch: log error but continue
    - Log completion
 
Domain events:
- RecommendationGeneratedEvent: aggregateId, userId, jobId, matchScore
- UserFeedbackRecordedEvent: aggregateId, action
 
MatchingController (@Controller('recommendations')):
- Constructor: inject MatchingService
 
Endpoints (from BACKEND_PART2.md):
1. @Get()
   - GET /recommendations
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - @Query('limit') limit = 20
   - @Query('skip') skip = 0
   - Call getRecommendations(user.id, limit, skip)
   - Return array
   - Response: 200
 
2. @Get(':id')
   - GET /recommendations/:id
   - @UseGuards(SupabaseAuthGuard)
   - Return single
   - Response: 200
 
3. @Get(':id/explain')
   - GET /recommendations/:id/explain
   - @UseGuards(SupabaseAuthGuard)
   - Return { explanation }
   - Response: 200
 
4. @Post(':id/feedback')
   - POST /recommendations/:id/feedback
   - @UseGuards(SupabaseAuthGuard)
   - @Body() { action: 'applied'|'saved'|'skipped'|'not_interested' }
   - Call recordFeedback(id, action)
   - Return updated recommendation
   - Response: 200
 
5. @Get('job/:jobId/match-score')
   - GET /recommendations/job/:jobId/match-score
   - @UseGuards(SupabaseAuthGuard)
   - @CurrentUser() user
   - Get job, resume, profile
   - Calculate match score
   - Return { matchScore, explanation }
   - Response: 200
 
MatchingModule (@Module()):
- imports: [
    ScheduleModule.forRoot(),
    JobModule,
    UserModule,
    ResumeModule,
    SharedModule,
  ]
- controllers: [MatchingController]
- providers: [
    MatchingService,
    MatchScoreCalculatorService,
    RecommendationRepository,
    RecommendationScheduleService,
  ]
- exports: [MatchingService]
 
Update app.module.ts:
- Add MatchingModule to imports
 
CODE QUALITY (from PATTERNS.md):
- Controller pattern
- Scheduler pattern (@Cron)
- Error handling in batch job
- Event publishing
```
 
---
 
# PHASES 8-12: Summary Prompts
 
## Prompt 8: Notification Module (Summary)
 
```
I'm implementing Phase 8 of JobFits backend - Notification Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 8, lines 1-600)
2. ./docs/BACKEND_PART2.md (Notification Module section)
3. ./docs/PATTERNS.md (Service Pattern, Event Listener Pattern)
4. ./docs/QUICK_REFERENCE.md (NotificationType enum)
 
Task Summary: Build event-driven notifications with email & in-app support
 
Key components to build:
1. Notification entity & repository
   - id, userId, type (NotificationType), title, message, read, createdAt
 
2. NotificationService
   - sendEmail(to, template, data)
   - sendInApp(userId, notification)
   - Methods use SendGrid or AWS SES
 
3. NotificationPreference entity
   - userId, quietHoursStart?, quietHoursEnd?, disabledTypes[]
 
4. Event listeners (subscribe to domain events):
   - UserCreatedEvent → welcome email
   - ApplicationSubmittedEvent → confirmation
   - ApplicationStatusChangedEvent → status update
   - RecommendationGeneratedEvent → new job recommendation
   - JobClosedEvent → job closed notification
 
5. API endpoints:
   - GET /notifications (user's notifications)
   - PATCH /notifications/:id (mark read)
   - GET /settings/notification-preferences
   - PATCH /settings/notification-preferences (update)
 
6. Email templates (for SendGrid):
   - welcome.html
   - application-submitted.html
   - status-update.html
   - recommendation.html
 
Technology:
- @sendgrid/mail or aws-sdk for SES
- Email templates in src/modules/notification/templates/
- Event listeners in src/modules/notification/infrastructure/listeners/
 
Expected outcomes:
- Users receive real-time email & in-app notifications
- Preferences honored (quiet hours, disabled types)
- Full event-to-notification pipeline
```
 
---
 
## Prompt 9: Payment Module (Summary)
 
```
I'm implementing Phase 9 of JobFits backend - Payment Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 9, lines 1-500)
2. ./docs/BACKEND_PART2.md (Payment Module section)
3. ./docs/PATTERNS.md (Service Pattern)
4. ./docs/QUICK_REFERENCE.md (SubscriptionTier enum)
 
Task Summary: Build Stripe payment & subscription management
 
Key components:
1. Subscription entity
   - userId, stripeCustomerId, stripeSubscriptionId
   - tier (SubscriptionTier: FREE, PREMIUM, PROFESSIONAL)
   - status, currentPeriodStart, currentPeriodEnd
 
2. PaymentService
   - createSubscription(userId, tier)
   - cancelSubscription(userId)
   - updatePaymentMethod(userId, paymentMethodId)
   - handleWebhook(event) for Stripe events
 
3. Stripe webhook handlers:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_succeeded
   - invoice.payment_failed
 
4. Premium feature gates:
   - Resume optimizer (PREMIUM+)
   - Salary intelligence (PREMIUM+)
   - Advanced search (PROFESSIONAL)
 
5. API endpoints:
   - POST /subscriptions (create)
   - GET /subscriptions (get user's)
   - POST /subscriptions/:id/cancel
   - GET /billing-history
   - POST /webhook/stripe (webhook handler)
 
6. Environment variables needed:
   - STRIPE_SECRET_KEY
   - STRIPE_PUBLISHABLE_KEY
   - STRIPE_WEBHOOK_SECRET
 
Technology:
- npm install stripe
- @nestjs/stripe or direct stripe SDK
 
Expected outcomes:
- Full subscription lifecycle management
- Webhook-based events from Stripe
- Premium feature access control
- Billing history & invoices
```
 
---
 
## Prompt 10: Admin Module (Summary)
 
```
I'm implementing Phase 10 of JobFits backend - Admin Module.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 10, lines 1-400)
2. ./docs/BACKEND_PART2.md (Admin Module section)
3. ./docs/PATTERNS.md (Controller Pattern with RolesGuard)
4. ./docs/QUICK_REFERENCE.md (UserRole enum)
 
Task Summary: Build admin dashboard & platform moderation
 
Key components:
1. AdminService
   - getDashboard(): { totalUsers, totalJobs, totalApplications, revenueThisMonth, userGrowthRate, topCompanies, topSkills }
   - getUser(userId) with full profile
   - suspendUser(userId)
   - unsuspendUser(userId)
   - getJob(jobId)
   - flagJob(jobId, reason)
   - removeJob(jobId)
   - getAnalytics(startDate?, endDate?)
 
2. Admin API endpoints (all @Roles('ADMIN')):
   - GET /admin/dashboard
   - GET /admin/users
   - GET /admin/users/:id
   - PATCH /admin/users/:id/suspend
   - PATCH /admin/users/:id/unsuspend
   - GET /admin/jobs
   - GET /admin/jobs/:id
   - POST /admin/jobs/:id/flag
   - DELETE /admin/jobs/:id
   - GET /admin/analytics
   - GET /admin/analytics/revenue
 
3. RolesGuard implementation (if not done):
   - Check @Roles() metadata
   - Verify user.role in allowed roles
   - Allow UserRole.ADMIN for all endpoints
 
4. Moderation features:
   - Content flagging system
   - User suspension
   - Job removal
   - Analytics queries
 
Technology:
- Custom @Roles() decorator
- RolesGuard (CanActivate)
- Complex database queries for KPIs
 
Expected outcomes:
- Admin dashboard with KPIs
- User moderation tools
- Content moderation
- Platform analytics
```
 
---
 
## Prompt 11: Advanced Features (Summary - Optional)
 
```
I'm implementing Phase 11 of JobFits backend - Advanced Features (Optional).
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 11, lines 1-400)
2. ./docs/BACKEND_PART2.md (Advanced Features section, if present)
3. ./docs/PATTERNS.md (Service Pattern)
 
Task Summary: Build premium/advanced features (choose 1-2)
 
Option 1: Resume Optimizer (AI-powered)
- ResumeOptimizerService
- Suggests improvements to resume content
- Recommends better keywords, bullet points
- Predicts score improvement
- Optionally integrate OpenAI API or local LLM
 
Option 2: Interview Prep
- InterviewPrepService
- QuestionBank entity (role-specific questions)
- UserInterviewNote entity (user's notes)
- GET /interview-prep/questions?jobLevel=SENIOR
- GET /jobs/:id/interview-questions (tailored)
- POST /interview-prep/notes
 
Option 3: Salary Intelligence
- SalaryService
- Query Glassdoor/PayScale data
- getSalaryData(title, location, experience)
- Return: median, p25, p75, trend, negotiation tips
- GET /salary-data endpoint
 
Option 4: Learning Paths
- LearningPathService
- Skill gap analysis
- Recommend courses for gaps
- GET /learning-paths/:userId
- GET /skills/:skillId/learning-resources
 
Option 5: User Analytics
- Extend UserAnalyticsService
- Track: applicationRate, interviewRate, offerRate
- Track engagement metrics
- GET /analytics/my-stats
 
Choose 1-2 features that add most value for your MVP.
 
Expected outcomes:
- Enhanced user engagement
- Additional premium value propositions
- Better job matching and preparation
```
 
---
 
## Prompt 12: Testing & Deployment (Summary)
 
```
I'm implementing Phase 12 of JobFits backend - Testing & Deployment.
 
REFERENCES (read all):
1. ./docs/IMPLEMENTATION_ROADMAP.md (Phase 12, lines 1-1400)
2. ./docs/PATTERNS.md (Unit Test Pattern, Integration Test Pattern)
3. ./docs/QUICK_REFERENCE.md (Common commands)
 
Task Summary: Add test coverage and deploy to production
 
Testing strategy:
 
1. Unit Tests (for services & repositories)
   - Mock all dependencies
   - Test happy path
   - Test error cases
   - Test edge cases
   - Target: 80%+ coverage per service
 
   Command: npm run test
 
2. Integration Tests (multi-module flows)
   - User signup → profile → recommendations
   - Job creation → recommendation generation
   - Application submission → status changes → email
   - Resume upload → parsing → scoring
 
   Command: npm run test:integration
 
3. E2E Tests (full user journeys)
   - Complete job application flow
   - Complete job discovery to application
 
   Command: npm run test:e2e
 
Test file structure:
- src/modules/[module]/__tests__/
  - [service].spec.ts (unit)
  - [module].integration.spec.ts (integration)
  - e2e.spec.ts (E2E)
 
Deployment:
 
1. Create Dockerfile (multistage build)
   - Build stage: compile TypeScript
   - Runtime stage: run Node app
   - FROM node:18-alpine
 
2. Create docker-compose.yml for local development
   - backend service
   - postgres service
   - redis service
 
3. Create GitHub Actions CI/CD (.github/workflows/deploy.yml)
   - Trigger on push to main
   - Run linter
   - Run tests
   - Build Docker image
   - Deploy to production
 
4. Environment variables needed:
   - All from QUICK_REFERENCE.md
 
5. Pre-deployment checklist:
   - All tests passing
   - npm run build succeeds
   - Database backups configured
   - Monitoring setup (Sentry, DataDog)
 
6. Post-deployment:
   - Health checks
   - Auth flow verification
   - Database query performance
   - Error tracking operational
 
Deploy commands:
- docker build -t jobfits-backend:latest .
- docker-compose up
- docker push [registry]/jobfits-backend:latest
 
Expected outcomes:
- Production-ready code
- High test coverage (80%+)
- Automated CI/CD pipeline
- Easy deployment & rollback
```
 
---
 
# SUMMARY: COMPLETE PROMPT STRUCTURE
 
Each prompt now includes:
 
✅ All 4 file references (ROADMAP, BACKEND_PART, PATTERNS, QUICK_REFERENCE)  
✅ Specific line numbers for reference  
✅ Complete requirements from all documents  
✅ Exact enum values from QUICK_REFERENCE.md  
✅ Exact error messages from QUICK_REFERENCE.md  
✅ Exact code patterns from PATTERNS.md  
✅ Exact business logic from BACKEND_PART1/2.md  
✅ Method signatures with full specifications  
✅ Error handling requirements  
✅ Code quality standards  
✅ What to do after creating  
 
**Copy entire prompt including ALL REFERENCES section into Copilot/Codex for best results!**
 
---
 
**READY TO BUILD!** 🚀
 
Pick Phase 1, Prompt 1.1, and start building.
 
All prompts are complete, detailed, and reference ALL documentation files.
 
Good luck! 💪

