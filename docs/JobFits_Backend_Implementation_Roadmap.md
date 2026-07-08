# JobFits Backend - Detailed Implementation Roadmap

**Version:** 2.0  
**Status:** Ready for Incremental Development  
**Target Timeline:** 12-14 weeks  
**Optimization:** AI-assistant friendly with phase-by-phase context

---

## QUICK PHASE OVERVIEW

| Phase | Name | Duration | Priority | Status |
|-------|------|----------|----------|--------|
| 1 | Foundation & Infrastructure | 1 week | 🔴 CRITICAL | Pre-build |
| 2 | Shared Kernel & Enums | 1 week | 🔴 CRITICAL | Pre-build |
| 3 | User Module (Identity) | 2 weeks | 🔴 CRITICAL | Week 3-4 |
| 4 | Company Module | 0.5 weeks | 🟡 HIGH | Week 4.5 |
| 5A | Job Module (Core) | 1 week | 🟡 HIGH | Week 5 |
| 5B | Resume (Upload & Parse) | 1.5 weeks | 🟡 HIGH | Week 5-6 |
| 5C | Resume (Scoring) | 0.5 weeks | 🟡 HIGH | Week 6 |
| 6 | Application Module | 1 week | 🟡 HIGH | Week 7 |
| 7 | Matching Module | 1 week | 🟡 HIGH | Week 8 |
| 8 | Notification Module | 1 week | 🟢 MEDIUM | Week 9 |
| 9 | Payment Module | 1 week | 🟢 MEDIUM | Week 10 |
| 10 | Admin Module | 1 week | 🟢 MEDIUM | Week 11 |
| 11 | Advanced Features | 1 week | 🔵 OPTIONAL | Week 12 |
| 12 | Testing & Deployment | 2 weeks | 🔴 CRITICAL | Week 13-14 |

---

# PHASE 1: Foundation & Infrastructure (Week 1)

## Goal
Establish the NestJS project skeleton with DDD building blocks and global patterns.

## Deliverables

### 1.1 Project Setup
```bash
# What to have at the end
jobfits-backend/
├── src/
│   ├── common/              # Shared utilities
│   │   ├── abstracts/
│   │   │   ├── entity.ts
│   │   │   ├── aggregate-root.ts
│   │   │   ├── value-object.ts
│   │   │   ├── domain-event.ts
│   │   │   └── repository.ts
│   │   ├── decorators/
│   │   │   ├── current-user.ts
│   │   │   ├── public.ts
│   │   │   └── roles.ts
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts
│   │   ├── middleware/
│   │   │   └── logging.middleware.ts
│   │   ├── guards/
│   │   │   ├── supabase-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   └── types/
│   │       └── index.ts
│   ├── events/
│   │   ├── domain-event-bus.service.ts
│   │   └── domain-events.registry.ts
│   ├── main.ts
│   └── app.module.ts
├── prisma/
│   └── schema.prisma        # Start with basic User table
├── .env.example
├── .env
├── tsconfig.json
└── package.json
```

### 1.2 NestJS Setup
- [ ] Create NestJS project: `nest new jobfits-backend`
- [ ] Install dependencies: Prisma, class-validator, class-transformer
- [ ] Configure TypeScript strict mode
- [ ] Set up environment variables (.env, .env.example)

### 1.3 Prisma & PostgreSQL
```
Dependencies:
  - PostgreSQL running locally or via Docker
  - Prisma CLI installed
  
Tasks:
  - [ ] Initialize Prisma: `npx prisma init`
  - [ ] Configure DATABASE_URL in .env
  - [ ] Create initial User table in schema.prisma
  - [ ] Create & verify database connection
```

### 1.4 DDD Building Blocks (Core Infrastructure)
Create in `src/common/abstracts/`:

**entity.ts**
```typescript
export abstract class Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  
  constructor(props: any, id?: string) {
    this.id = id || crypto.randomUUID();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
```

**aggregate-root.ts**
```typescript
import { Entity } from './entity';
import { DomainEvent } from './domain-event';

export abstract class AggregateRoot extends Entity {
  private domainEvents: DomainEvent[] = [];
  
  addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }
  
  getDomainEvents(): DomainEvent[] {
    return this.domainEvents;
  }
  
  clearDomainEvents(): void {
    this.domainEvents = [];
  }
}
```

**value-object.ts**
```typescript
export abstract class ValueObject {
  protected equals(vo?: ValueObject): boolean {
    if (!vo) return false;
    return JSON.stringify(this) === JSON.stringify(vo);
  }
}
```

**domain-event.ts**
```typescript
export abstract class DomainEvent {
  readonly occurredAt: Date;
  readonly aggregateId: string;
  
  constructor(aggregateId: string) {
    this.aggregateId = aggregateId;
    this.occurredAt = new Date();
  }
}
```

**repository.ts**
```typescript
export interface IRepository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
  delete(id: string): Promise<void>;
}
```

### 1.5 Event Bus Infrastructure
Create `src/events/`:

**domain-event-bus.service.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { DomainEvent } from '@/common/abstracts/domain-event';

@Injectable()
export class DomainEventBus {
  private handlers: Map<string, Function[]> = new Map();
  
  subscribe(eventName: string, handler: Function): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const eventName = event.constructor.name;
    const eventHandlers = this.handlers.get(eventName) || [];
    
    await Promise.all(eventHandlers.map(handler => handler(event)));
  }
}
```

**domain-events.registry.ts**
```typescript
// Will populate this in Phase 2+ as we define events
export const DOMAIN_EVENTS = {
  // USER_CREATED: 'UserCreated',
  // PROFILE_UPDATED: 'ProfileUpdated',
  // ... (add as modules are created)
};
```

### 1.6 Global Middleware & Filters
Create in `src/common/`:

**global-exception.filter.ts**
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }
    
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
```

### 1.7 Supabase Auth Integration
Create `src/common/guards/supabase-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SupabaseAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
```

### 1.8 Custom Decorators
Create `src/common/decorators/`:

**current-user.ts**
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

**public.ts**
```typescript
import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('isPublic', true);
```

**roles.ts**
```typescript
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

### 1.9 App Module Bootstrap
Create `src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import { DomainEventBus } from '@/events/domain-event-bus.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [
    DomainEventBus,
    {
      provide: 'APP_FILTER',
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
```

## Checklist
- [ ] NestJS project created & runs locally
- [ ] PostgreSQL connected via Prisma
- [ ] DDD abstracts implemented & testable
- [ ] Event bus service created
- [ ] Global exception filter works
- [ ] Custom decorators functional
- [ ] Environment variables configured
- [ ] Can run: `npm run start:dev` without errors

## Test This Phase
```bash
# Should output "NestJS app running on port 3000"
npm run start:dev

# Verify Prisma connection
npx prisma db push
```

## AI Prompt Template for Phase 1
```
I'm building JobFits backend in NestJS with DDD and event-driven architecture.
Reference: ./docs/BACKEND_PART1.md (Architecture section, lines 1-100)

Task: [Specific task, e.g., "Create a Supabase auth module with JWT guard"]
Use these patterns:
- DDD building blocks (Entity, AggregateRoot, ValueObject, DomainEvent)
- Dependency Injection via NestJS modules
- Global exception handling
- Custom decorators for @CurrentUser(), @Roles()

Requirements:
- Fully typed TypeScript with no 'any'
- Follows NestJS best practices
- Includes error handling
```

---

# PHASE 2: Shared Kernel & Enums (Week 2)

## Goal
Define the common language across all modules: enums, value objects, constants.

## Deliverables

### 2.1 Shared Module Structure
```
src/shared/
├── kernel/
│   ├── enums/
│   │   ├── job-level.enum.ts
│   │   ├── remote-type.enum.ts
│   │   ├── employment-type.enum.ts
│   │   ├── user-role.enum.ts
│   │   ├── application-status.enum.ts
│   │   ├── subscription-tier.enum.ts
│   │   ├── notification-type.enum.ts
│   │   ├── degree-level.enum.ts
│   │   └── index.ts
│   ├── value-objects/
│   │   ├── salary-range.vo.ts
│   │   ├── location.vo.ts
│   │   ├── email.vo.ts
│   │   ├── phone.vo.ts
│   │   ├── currency.vo.ts
│   │   └── index.ts
│   ├── constants/
│   │   ├── validation.constants.ts
│   │   ├── pagination.constants.ts
│   │   └── index.ts
│   └── index.ts
├── entities/
│   ├── skill.entity.ts
│   ├── industry.entity.ts
│   └── index.ts
└── shared.module.ts
```

### 2.2 Enums

**job-level.enum.ts**
```typescript
export enum JobLevel {
  INTERN = 'INTERN',
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  C_LEVEL = 'C_LEVEL',
}
```

**remote-type.enum.ts**
```typescript
export enum RemoteType {
  ON_SITE = 'ON_SITE',
  HYBRID = 'HYBRID',
  REMOTE = 'REMOTE',
}
```

**employment-type.enum.ts**
```typescript
export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  TEMPORARY = 'TEMPORARY',
  FREELANCE = 'FREELANCE',
}
```

**user-role.enum.ts**
```typescript
export enum UserRole {
  JOB_SEEKER = 'JOB_SEEKER',
  EMPLOYER = 'EMPLOYER',
  ADMIN = 'ADMIN',
}
```

**application-status.enum.ts**
```typescript
export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  SCREENING = 'SCREENING',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  ARCHIVED = 'ARCHIVED',
}
```

**subscription-tier.enum.ts**
```typescript
export enum SubscriptionTier {
  FREE = 'FREE',
  PREMIUM = 'PREMIUM',
  PROFESSIONAL = 'PROFESSIONAL',
}
```

**notification-type.enum.ts**
```typescript
export enum NotificationType {
  JOB_RECOMMENDATION = 'JOB_RECOMMENDATION',
  APPLICATION_UPDATE = 'APPLICATION_UPDATE',
  INTERVIEW_REMINDER = 'INTERVIEW_REMINDER',
  OFFER_UPDATE = 'OFFER_UPDATE',
  MESSAGE = 'MESSAGE',
  SYSTEM = 'SYSTEM',
}
```

**degree-level.enum.ts**
```typescript
export enum DegreeLevel {
  HIGH_SCHOOL = 'HIGH_SCHOOL',
  ASSOCIATE = 'ASSOCIATE',
  BACHELOR = 'BACHELOR',
  MASTER = 'MASTER',
  DOCTORATE = 'DOCTORATE',
  CERTIFICATION = 'CERTIFICATION',
}
```

### 2.3 Value Objects

**salary-range.vo.ts**
```typescript
import { ValueObject } from '@/common/abstracts/value-object';

export class SalaryRange extends ValueObject {
  readonly min: number;
  readonly max: number;
  readonly currency: string;

  constructor(min: number, max: number, currency: string = 'USD') {
    super();
    if (min > max) throw new Error('Min salary cannot exceed max');
    this.min = min;
    this.max = max;
    this.currency = currency;
  }

  static create(min: number, max: number, currency?: string): SalaryRange {
    return new SalaryRange(min, max, currency);
  }

  get isValid(): boolean {
    return this.min > 0 && this.max > this.min;
  }
}
```

**location.vo.ts**
```typescript
import { ValueObject } from '@/common/abstracts/value-object';

export class Location extends ValueObject {
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly latitude?: number;
  readonly longitude?: number;

  constructor(
    city: string,
    state: string,
    country: string,
    latitude?: number,
    longitude?: number,
  ) {
    super();
    this.city = city;
    this.state = state;
    this.country = country;
    this.latitude = latitude;
    this.longitude = longitude;
  }

  static create(
    city: string,
    state: string,
    country: string,
    latitude?: number,
    longitude?: number,
  ): Location {
    return new Location(city, state, country, latitude, longitude);
  }

  get displayName(): string {
    return `${this.city}, ${this.state}, ${this.country}`;
  }
}
```

**email.vo.ts**
```typescript
import { ValueObject } from '@/common/abstracts/value-object';

export class Email extends ValueObject {
  readonly value: string;

  constructor(value: string) {
    super();
    if (!this.isValidEmail(value)) {
      throw new Error('Invalid email format');
    }
    this.value = value;
  }

  static create(value: string): Email {
    return new Email(value);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
```

**phone.vo.ts**
```typescript
import { ValueObject } from '@/common/abstracts/value-object';

export class Phone extends ValueObject {
  readonly value: string;
  readonly countryCode: string;

  constructor(value: string, countryCode: string = '+1') {
    super();
    this.value = value;
    this.countryCode = countryCode;
  }

  static create(value: string, countryCode?: string): Phone {
    return new Phone(value, countryCode);
  }

  get fullNumber(): string {
    return `${this.countryCode}${this.value}`;
  }
}
```

**currency.vo.ts**
```typescript
import { ValueObject } from '@/common/abstracts/value-object';

export class Currency extends ValueObject {
  readonly code: string;
  readonly symbol: string;

  constructor(code: string, symbol: string) {
    super();
    this.code = code;
    this.symbol = symbol;
  }

  static USD = new Currency('USD', '$');
  static EUR = new Currency('EUR', '€');
  static GBP = new Currency('GBP', '£');
  static KHR = new Currency('KHR', '៛');
}
```

### 2.4 Shared Entities

**skill.entity.ts**
```typescript
import { Entity } from '@/common/abstracts/entity';

export class Skill extends Entity {
  name: string;
  category: string;
  endorsementCount: number = 0;

  constructor(props: { name: string; category: string }, id?: string) {
    super(props, id);
    this.name = props.name;
    this.category = props.category;
  }

  static create(props: { name: string; category: string }): Skill {
    return new Skill(props);
  }

  endorse(): void {
    this.endorsementCount++;
  }
}
```

**industry.entity.ts**
```typescript
import { Entity } from '@/common/abstracts/entity';

export class Industry extends Entity {
  name: string;
  description: string;
  iconUrl?: string;

  constructor(props: { name: string; description: string; iconUrl?: string }, id?: string) {
    super(props, id);
    this.name = props.name;
    this.description = props.description;
    this.iconUrl = props.iconUrl;
  }

  static create(props: { name: string; description: string; iconUrl?: string }): Industry {
    return new Industry(props);
  }
}
```

### 2.5 Prisma Schema Updates
Add to `prisma/schema.prisma`:
```prisma
enum JobLevel {
  INTERN
  ENTRY
  MID
  SENIOR
  LEAD
  MANAGER
  DIRECTOR
  C_LEVEL
}

enum RemoteType {
  ON_SITE
  HYBRID
  REMOTE
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
  TEMPORARY
  FREELANCE
}

enum UserRole {
  JOB_SEEKER
  EMPLOYER
  ADMIN
}

enum ApplicationStatus {
  DRAFT
  SUBMITTED
  SCREENING
  INTERVIEW
  OFFER
  REJECTED
  WITHDRAWN
  ARCHIVED
}

enum SubscriptionTier {
  FREE
  PREMIUM
  PROFESSIONAL
}

enum NotificationType {
  JOB_RECOMMENDATION
  APPLICATION_UPDATE
  INTERVIEW_REMINDER
  OFFER_UPDATE
  MESSAGE
  SYSTEM
}

enum DegreeLevel {
  HIGH_SCHOOL
  ASSOCIATE
  BACHELOR
  MASTER
  DOCTORATE
  CERTIFICATION
}

model Skill {
  id String @id @default(cuid())
  name String @unique
  category String
  endorsementCount Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Industry {
  id String @id @default(cuid())
  name String @unique
  description String
  iconUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 2.6 Constants
**validation.constants.ts**
```typescript
export const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\+?1?\d{9,15}$/,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  BIO_MAX_LENGTH: 500,
  URL_REGEX: /^https?:\/\/.+/,
};

export const ERROR_MESSAGES = {
  INVALID_EMAIL: 'Email format is invalid',
  INVALID_PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, and numbers',
  USER_NOT_FOUND: 'User not found',
  INVALID_CREDENTIALS: 'Invalid email or password',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
};
```

**pagination.constants.ts**
```typescript
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
```

### 2.7 Shared Module
Create `src/shared/shared.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { Skill } from './entities/skill.entity';
import { Industry } from './entities/industry.entity';

@Module({
  providers: [Skill, Industry],
  exports: [Skill, Industry],
})
export class SharedModule {}
```

## Checklist
- [ ] All 8 enums created & exported
- [ ] All 5 value objects created with validation
- [ ] Skill & Industry entities created
- [ ] Prisma schema updated with enums & tables
- [ ] `npx prisma migrate dev` successful
- [ ] SharedModule exported & importable
- [ ] Value objects are immutable & testable
- [ ] Constants file organized

## Test This Phase
```bash
# Verify Prisma schema
npx prisma validate

# Run migration
npx prisma migrate dev --name init_shared_kernel

# Create a Skill & Industry in a seeder
npx prisma db seed
```

## AI Prompt Template for Phase 2
```
I'm creating the Shared Kernel for JobFits backend.
Reference: ./docs/BACKEND_PART1.md (Shared Kernel section)

Task: [e.g., "Create a Location value object with city, state, country, and coordinates"]

Requirements:
- Immutable ValueObject pattern (extends ValueObject abstract)
- Factory method: Location.create()
- Validation logic in constructor
- Get methods for display names
- No side effects
```

---

# PHASE 3: User Module - Core Identity (Weeks 3-4)

## Goal
Full user identity & profile management: registration, profiles, skills, experience, education.

## Critical Phase
This is the foundation for everything. Once User is solid, other modules snap together quickly.

## Deliverables

### 3.1 Prisma Schema (User-related tables)
Add to `prisma/schema.prisma`:

```prisma
model User {
  id String @id @default(cuid())
  supabaseId String @unique  // Links to Supabase Auth
  email Email @unique
  role UserRole @default(JOB_SEEKER)
  subscriptionTier SubscriptionTier @default(FREE)
  
  // Relations
  profile Profile?
  experiences Experience[]
  educations Education[]
  certifications Certification[]
  skills UserSkill[]
  resumes Resume[]
  applications Application[]
  recommendations Recommendation[]
  notifications Notification[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  
  @@index([email])
  @@index([subscriptionTier])
}

model Profile {
  id String @id @default(cuid())
  userId String @unique
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  firstName String
  lastName String
  phone String?
  photoUrl String?
  bio String?
  headline String?  // e.g., "Senior Software Engineer at Google"
  
  // Location
  city String?
  state String?
  country String?
  latitude Float?
  longitude Float?
  
  // Work Preferences
  desiredJobLevels JobLevel[]
  desiredRemoteTypes RemoteType[]
  desiredEmploymentTypes EmploymentType[]
  desiredIndustries String[]  // Industry IDs
  
  // Salary
  minSalary Int?
  maxSalary Int?
  salaryCurrency String @default("USD")
  
  // Social Links
  linkedinUrl String?
  githubUrl String?
  portfolioUrl String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
}

model Experience {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  company String
  title String
  jobLevel JobLevel
  employmentType EmploymentType
  industry String  // Industry ID
  
  description String?
  isCurrentJob Boolean @default(false)
  
  startDate DateTime
  endDate DateTime?
  
  technologies String[]  // Array of tech used
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
  @@index([company])
}

model Education {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  institution String
  degreeLevel DegreeLevel
  fieldOfStudy String
  description String?
  
  startDate DateTime
  endDate DateTime?
  gpa Float?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
  @@index([institution])
}

model Certification {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name String
  issuer String
  credentialId String?
  credentialUrl String?
  
  issueDate DateTime
  expirationDate DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
}

model UserSkill {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  skillId String
  skill Skill @relation(fields: [skillId], references: [id], onDelete: Restrict)
  
  endorsementCount Int @default(0)
  proficiencyLevel String @default("INTERMEDIATE")  // BEGINNER, INTERMEDIATE, ADVANCED, EXPERT
  yearsOfExperience Float?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([userId, skillId])
  @@index([userId])
  @@index([skillId])
}

model UserAnalytics {
  id String @id @default(cuid())
  userId String @unique
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  totalApplications Int @default(0)
  totalInterviews Int @default(0)
  totalOffers Int @default(0)
  applicationAcceptanceRate Float @default(0)
  interviewAcceptanceRate Float @default(0)
  
  profileViewCount Int @default(0)
  lastProfileViewDate DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
}

model Skill {
  id String @id @default(cuid())
  name String @unique
  category String
  endorsementCount Int @default(0)
  userSkills UserSkill[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3.2 Entities (Domain Layer)
Create `src/modules/user/domain/entities/`:

**user.entity.ts**
```typescript
import { AggregateRoot } from '@/common/abstracts/aggregate-root';
import { UserRole } from '@/shared/kernel/enums/user-role.enum';
import { SubscriptionTier } from '@/shared/kernel/enums/subscription-tier.enum';
import { UserCreatedEvent } from '../events/user-created.event';

export class User extends AggregateRoot {
  supabaseId: string;
  email: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  
  constructor(
    props: {
      supabaseId: string;
      email: string;
      role?: UserRole;
      subscriptionTier?: SubscriptionTier;
    },
    id?: string,
  ) {
    super(props, id);
    this.supabaseId = props.supabaseId;
    this.email = props.email;
    this.role = props.role || UserRole.JOB_SEEKER;
    this.subscriptionTier = props.subscriptionTier || SubscriptionTier.FREE;
  }

  static create(props: {
    supabaseId: string;
    email: string;
    role?: UserRole;
  }): User {
    const user = new User(props);
    user.addDomainEvent(new UserCreatedEvent(user.id, user.email));
    return user;
  }

  upgradeSubscription(tier: SubscriptionTier): void {
    this.subscriptionTier = tier;
    this.updatedAt = new Date();
  }

  changeRole(role: UserRole): void {
    this.role = role;
    this.updatedAt = new Date();
  }
}
```

**profile.entity.ts**
```typescript
import { Entity } from '@/common/abstracts/entity';
import { Location } from '@/shared/kernel/value-objects/location.vo';
import { SalaryRange } from '@/shared/kernel/value-objects/salary-range.vo';

export class Profile extends Entity {
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;
  headline?: string;
  
  location?: Location;
  desiredJobLevels: string[] = [];
  desiredRemoteTypes: string[] = [];
  desiredEmploymentTypes: string[] = [];
  desiredIndustries: string[] = [];
  
  salaryRange?: SalaryRange;
  
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;

  constructor(props: any, id?: string) {
    super(props, id);
    this.userId = props.userId;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.phone = props.phone;
    this.photoUrl = props.photoUrl;
    this.bio = props.bio;
    this.headline = props.headline;
    this.location = props.location;
    this.desiredJobLevels = props.desiredJobLevels || [];
    this.desiredRemoteTypes = props.desiredRemoteTypes || [];
    this.desiredEmploymentTypes = props.desiredEmploymentTypes || [];
    this.desiredIndustries = props.desiredIndustries || [];
    this.salaryRange = props.salaryRange;
    this.linkedinUrl = props.linkedinUrl;
    this.githubUrl = props.githubUrl;
    this.portfolioUrl = props.portfolioUrl;
  }

  static create(props: any): Profile {
    return new Profile(props);
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  updateWorkPreferences(prefs: {
    jobLevels?: string[];
    remoteTypes?: string[];
    employmentTypes?: string[];
    industries?: string[];
  }): void {
    if (prefs.jobLevels) this.desiredJobLevels = prefs.jobLevels;
    if (prefs.remoteTypes) this.desiredRemoteTypes = prefs.remoteTypes;
    if (prefs.employmentTypes) this.desiredEmploymentTypes = prefs.employmentTypes;
    if (prefs.industries) this.desiredIndustries = prefs.industries;
    this.updatedAt = new Date();
  }
}
```

**experience.entity.ts, education.entity.ts, certification.entity.ts, user-skill.entity.ts** → Similar pattern to Profile

### 3.3 DTOs
Create `src/modules/user/application/dtos/`:

**create-user.dto.ts**
```typescript
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  supabaseId: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  lastName: string;
}
```

**create-profile.dto.ts, add-experience.dto.ts, add-skill.dto.ts**, etc. → Similar validation patterns

### 3.4 Repositories
Create `src/modules/user/infrastructure/repositories/`:

**user.repository.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { User } from '../../domain/entities/user.entity';
import { IRepository } from '@/common/abstracts/repository';

@Injectable()
export class UserRepository implements IRepository<User> {
  constructor(private prisma: PrismaService) {}

  async save(user: User): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      update: {
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        updatedAt: user.updatedAt,
      },
      create: {
        id: user.id,
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { id } });
    if (!data) return null;
    
    return new User({
      supabaseId: data.supabaseId,
      email: data.email,
      role: data.role,
      subscriptionTier: data.subscriptionTier,
    }, data.id);
  }

  async findByEmail(email: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { email } });
    if (!data) return null;
    return new User({
      supabaseId: data.supabaseId,
      email: data.email,
      role: data.role,
      subscriptionTier: data.subscriptionTier,
    }, data.id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findAll(skip: number = 0, take: number = 20): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      skip,
      take,
    });
    return users.map(u => new User({
      supabaseId: u.supabaseId,
      email: u.email,
      role: u.role,
      subscriptionTier: u.subscriptionTier,
    }, u.id));
  }
}
```

**profile.repository.ts, experience.repository.ts**, etc. → Similar structure

### 3.5 Services (Business Logic)
Create `src/modules/user/application/services/`:

**user.service.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { User } from '../../domain/entities/user.entity';
import { CreateUserDto } from '../dtos/create-user.dto';
import { DomainEventBus } from '@/events/domain-event-bus.service';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private eventBus: DomainEventBus,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    const user = User.create({
      supabaseId: dto.supabaseId,
      email: dto.email,
    });

    await this.userRepository.save(user);

    // Publish domain events
    for (const event of user.getDomainEvents()) {
      await this.eventBus.publish(event);
    }
    user.clearDomainEvents();

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async getAllUsers(skip: number = 0, take: number = 20): Promise<User[]> {
    return this.userRepository.findAll(skip, take);
  }
}
```

**profile.service.ts, experience.service.ts, skills.service.ts**, etc. → Implement business logic for each

### 3.6 Controllers (API Endpoints)
Create `src/modules/user/presentation/controllers/`:

**user.controller.ts**
```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from '../../application/services/user.service';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { SupabaseAuthGuard } from '@/common/guards/supabase-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    const user = await this.userService.createUser(dto);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  @Get(':id')
  @UseGuards(SupabaseAuthGuard)
  async getUser(@Param('id') id: string) {
    const user = await this.userService.getUserById(id);
    if (!user) throw new BadRequestException('User not found');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
    };
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async getCurrentUser(@CurrentUser() user: any) {
    return user;
  }

  @Get()
  async getAllUsers() {
    const users = await this.userService.getAllUsers();
    return users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
    }));
  }
}
```

**profile.controller.ts, skills.controller.ts**, etc. → Additional endpoints for each entity

### 3.7 Domain Events
Create `src/modules/user/domain/events/`:

**user-created.event.ts**
```typescript
import { DomainEvent } from '@/common/abstracts/domain-event';

export class UserCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public email: string,
  ) {
    super(aggregateId);
  }
}
```

**profile-updated.event.ts, skill-added.event.ts**, etc.

### 3.8 Module Bootstrap
Create `src/modules/user/user.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UserService } from './application/services/user.service';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { UserController } from './presentation/controllers/user.controller';
import { ProfileService } from './application/services/profile.service';
// ... import other services/repos/controllers

@Module({
  imports: [],
  controllers: [UserController, ProfileController, SkillsController],
  providers: [
    UserService,
    UserRepository,
    ProfileService,
    ProfileRepository,
    SkillsService,
    SkillsRepository,
    // ... other services
  ],
  exports: [UserService, ProfileService, SkillsService],
})
export class UserModule {}
```

### 3.9 Update App Module
Add to `src/app.module.ts`:
```typescript
import { UserModule } from './modules/user/user.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [UserModule, SharedModule],
  // ...
})
export class AppModule {}
```

## API Endpoints Delivered

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/users` | Create user (signup) |
| GET | `/users/:id` | Get user by ID |
| GET | `/users/me` | Get current user |
| GET | `/users` | List all users (admin) |
| PATCH | `/profiles/:id` | Update profile |
| POST | `/profiles/:id/skills` | Add skill |
| DELETE | `/profiles/:id/skills/:skillId` | Remove skill |
| POST | `/profiles/:id/experience` | Add experience |
| POST | `/profiles/:id/education` | Add education |
| POST | `/profiles/:id/certifications` | Add certification |

## Checklist
- [ ] All Prisma models created & migrated
- [ ] User entity with domain events
- [ ] Profile, Experience, Education, Certification entities
- [ ] UserSkill & UserAnalytics entities
- [ ] All DTOs with validation
- [ ] All repositories implemented
- [ ] All services with business logic
- [ ] All controllers with endpoints
- [ ] Domain events defined & publishable
- [ ] UserModule exports & integrated
- [ ] All endpoints return correct data

## Test This Phase
```bash
# Run migrations
npx prisma migrate dev --name user_module

# Test endpoints
POST /users
{
  "email": "john@example.com",
  "supabaseId": "sub_123",
  "firstName": "John",
  "lastName": "Doe"
}

# Verify user created
GET /users/me (with auth token)
```

## AI Prompt Template for Phase 3
```
I'm implementing the User Module for JobFits (core identity & profiles).
Reference: ./docs/BACKEND_PART1.md (User Module section, lines 250-800)

Task: [e.g., "Create ProfileService with updateWorkPreferences method"]

Entities:
- User (AggregateRoot)
- Profile, Experience, Education, Certification, UserSkill, UserAnalytics

Requirements:
- Follow DDD pattern (Domain entity → Persistence with Prisma)
- Include validation in DTOs
- Emit domain events (e.g., UserCreated, SkillAdded)
- All methods fully typed, no 'any'
- Error handling & logging
```

---

[Continue with remaining phases in next section...]

