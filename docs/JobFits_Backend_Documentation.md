# JobFits Backend Documentation
**Version:** 1.0  
**Last Updated:** July 2026  
**Status:** Pre-Development Design Document  
**Architecture:** NestJS + Prisma + PostgreSQL + DDD + Clean Architecture

---

## TABLE OF CONTENTS

1. [Project Architecture Overview](#project-architecture-overview)
2. [Shared Kernel Module](#shared-kernel-module)
3. [Core & Events Infrastructure](#core--events-infrastructure)
4. [Module Documentation](#module-documentation)
   - [User Module](#user-module)
   - [Company Module](#company-module)
   - [Job Module](#job-module)
   - [Resume Module](#resume-module)
   - [Application Module](#application-module)
   - [Matching Module](#matching-module)
   - [Notification Module](#notification-module)
   - [Payment Module](#payment-module)
   - [Admin Module](#admin-module)
5. [Infrastructure Services](#infrastructure-services)
6. [Inter-Module Communication](#inter-module-communication)
7. [Data Flow Examples](#data-flow-examples)

---

## PROJECT ARCHITECTURE OVERVIEW

### Architecture Principles

**JobFits Backend** follows a **Modular Monolith** architecture with **Domain-Driven Design (DDD)** and **Clean Architecture** principles:

```
┌─────────────────────────────────────────────────────────────────┐
│                     REST API Layer (Controllers)                 │
├─────────────────────────────────────────────────────────────────┤
│                     Application Layer (Use Cases)                │
│                    (Services, DTOs, Validators)                 │
├─────────────────────────────────────────────────────────────────┤
│                      Domain Layer (DDD)                          │
│         (Entities, Aggregate Roots, Value Objects,              │
│          Domain Events, Business Logic)                         │
├─────────────────────────────────────────────────────────────────┤
│              Infrastructure Layer (Adapters)                     │
│         (Prisma, Supabase, Storage, Queue, Mail, etc.)          │
└─────────────────────────────────────────────────────────────────┘
```

### Module Organization

```
Modules (Feature-Based)
├── User Module          # Job-seeker & employer profiles
├── Company Module       # Employer companies
├── Job Module           # Job postings & search
├── Resume Module        # Resume management & parsing
├── Application Module   # Job applications & tracking
├── Matching Module      # AI recommendation algorithm
├── Notification Module  # Email + in-app notifications
├── Payment Module       # Stripe subscriptions
└── Admin Module         # Platform management

Supporting Modules
├── Shared-Kernel        # Reusable domain entities (Skills, Industries, etc.)
├── Events               # Domain event bus & publishing
└── Infrastructure       # Prisma, Supabase, Storage, Queue, Mail
```

### Request Flow Example

```
HTTP Request (e.g., POST /api/jobs/search)
    ↓
Controller (Route Handler)
    ↓
DTO Validation (Pipes)
    ↓
Service (Use Case / Application Logic)
    ↓
Repository (Data Access)
    ↓
Prisma Client (Query Builder)
    ↓
PostgreSQL Database
    ↓
Response Transformation & Return
```

### Dependency Injection Pattern

All services use **NestJS Dependency Injection** via constructor:

```typescript
// Example: JobService depends on JobRepository and MatchingService
@Injectable()
export class JobService {
  constructor(
    private jobRepository: JobRepository,
    private matchingService: MatchingService,
    private eventBus: EventBusService,
  ) {}
}
```

---

## SHARED KERNEL MODULE

The **Shared Kernel** contains reusable domain entities, value objects, and enums used across multiple modules.

### Purpose
- Prevent duplication across modules
- Establish common domain language
- Centralize reference data (skills, industries, job levels, etc.)

### Folder Structure

```
src/shared-kernel/
├── skills/
│   ├── skill.entity.ts
│   ├── skill.repository.ts
│   ├── skill.module.ts
│   └── dtos/
│       └── skill.dto.ts
├── industries/
│   ├── industry.entity.ts
│   ├── industry.repository.ts
│   └── industry.module.ts
├── enums/
│   ├── job-level.enum.ts
│   ├── remote-type.enum.ts
│   ├── employment-type.enum.ts
│   ├── currency.enum.ts
│   ├── user-role.enum.ts
│   ├── application-status.enum.ts
│   ├── subscription-tier.enum.ts
│   ├── notification-type.enum.ts
│   └── degree-level.enum.ts
├── value-objects/
│   ├── salary-range.vo.ts
│   ├── location.vo.ts
│   ├── email.vo.ts
│   ├── phone.vo.ts
│   └── currency.vo.ts
└── constants/
    └── default-values.const.ts
```

### Enums (Database Mapping)

#### Job Level Enum
```typescript
// Maps to: jobs.experienceLevel
export enum JobLevel {
  ENTRY = 'entry',           // 0-2 years
  MID = 'mid',               // 2-5 years
  SENIOR = 'senior',         // 5-10 years
  LEAD = 'lead',             // 10+ years
  DIRECTOR = 'director',     // 10+ years, management
  C_LEVEL = 'c_level',       // CTO, VP, CEO
}
```

#### Remote Type Enum
```typescript
// Maps to: jobs.remoteType, profiles.remotePreference
export enum RemoteType {
  REMOTE_ONLY = 'remote_only',
  HYBRID = 'hybrid',
  ON_SITE = 'on_site',
  FLEXIBLE = 'flexible',
}
```

#### Employment Type Enum
```typescript
// Maps to: jobs.employmentType
export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  TEMPORARY = 'temporary',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
}
```

#### User Role Enum
```typescript
// Maps to: users.role
export enum UserRole {
  USER = 'USER',           // Job seeker
  PREMIUM = 'PREMIUM',     // Job seeker with premium subscription
  PROFESSIONAL = 'PROFESSIONAL', // Job seeker with professional subscription
  ADMIN = 'ADMIN',         // Platform admin
}
```

#### Application Status Enum
```typescript
// Maps to: applications.status
export enum ApplicationStatus {
  APPLIED = 'applied',
  FIRST_CONTACT = 'first_contact',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  INTERVIEW_COMPLETED = 'interview_completed',
  OFFER_RECEIVED = 'offer_received',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_REJECTED = 'offer_rejected',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}
```

#### Subscription Tier Enum
```typescript
// Maps to: subscriptions.tier
export enum SubscriptionTier {
  FREE = 'free',
  PREMIUM = 'premium',
  PROFESSIONAL = 'professional',
}
```

#### Notification Type Enum
```typescript
// Maps to: notifications.notificationType
export enum NotificationType {
  RESUME_PARSED = 'resume_parsed',
  NEW_RECOMMENDATION = 'new_recommendation',
  INTERVIEW_REMINDER = 'interview_reminder',
  APPLICATION_DEADLINE = 'application_deadline',
  STATUS_UPDATE = 'status_update',
  WEEKLY_DIGEST = 'weekly_digest',
  NEW_FEATURE = 'new_feature',
  PROMOTIONAL = 'promotional',
}
```

#### Degree Level Enum
```typescript
// Maps to: education.degreeLevel
export enum DegreeLevel {
  HIGH_SCHOOL = 'high_school',
  BACHELOR = 'bachelor',
  MASTER = 'master',
  PHD = 'phd',
  BOOTCAMP = 'bootcamp',
  CERTIFICATE = 'certificate',
}
```

### Skills Entity

**Database Table:** `skills` (shared reference data)

```typescript
// src/shared-kernel/skills/skill.entity.ts
export class Skill extends AggregateRoot {
  id: string;                    // UUID, PK
  name: string;                  // e.g., "Python", "AWS"
  category?: string;             // e.g., "programming_language", "tool", "framework"
  createdAt: Date;
  updatedAt: Date;

  // Methods
  static create(name: string, category?: string): Skill
  isValid(): boolean
}
```

**Skill Repository Interface:**
```typescript
export interface ISkillRepository {
  findByName(name: string): Promise<Skill | null>;
  findById(id: string): Promise<Skill | null>;
  findAll(): Promise<Skill[]>;
  findByIds(ids: string[]): Promise<Skill[]>;
  create(skill: Skill): Promise<Skill>;
  update(skill: Skill): Promise<Skill>;
  delete(id: string): Promise<void>;
  // Search with autocomplete
  searchByNamePrefix(prefix: string, limit?: number): Promise<Skill[]>;
}
```

### Industries Entity

**Database Table:** `industries` (shared reference data)

```typescript
// src/shared-kernel/industries/industry.entity.ts
export class Industry extends AggregateRoot {
  id: string;                    // UUID, PK
  name: string;                  // e.g., "Technology", "Finance"
  slug: string;                  // e.g., "technology", "finance"
  createdAt: Date;

  static create(name: string): Industry
}
```

**Industry Repository Interface:**
```typescript
export interface IIndustryRepository {
  findByName(name: string): Promise<Industry | null>;
  findById(id: string): Promise<Industry | null>;
  findAll(): Promise<Industry[]>;
  create(industry: Industry): Promise<Industry>;
}
```

### Value Objects

#### SalaryRange Value Object

```typescript
// src/shared-kernel/value-objects/salary-range.vo.ts
export class SalaryRange {
  constructor(
    readonly min: number,      // e.g., 120000
    readonly max: number,      // e.g., 150000
    readonly currency: string = 'USD'
  ) {
    if (min > max) {
      throw new Error('Minimum salary cannot exceed maximum salary');
    }
  }

  isWithinRange(salary: number): boolean {
    return salary >= this.min && salary <= this.max;
  }

  getMedian(): number {
    return (this.min + this.max) / 2;
  }

  equals(other: SalaryRange): boolean {
    return this.min === other.min && 
           this.max === other.max && 
           this.currency === other.currency;
  }
}
```

#### Location Value Object

```typescript
// src/shared-kernel/value-objects/location.vo.ts
export class Location {
  constructor(
    readonly city: string,
    readonly state: string,
    readonly country: string = 'US',
    readonly latitude?: number,
    readonly longitude?: number
  ) {
    if (!city || !state || !country) {
      throw new Error('City, state, and country are required');
    }
  }

  getFullAddress(): string {
    return `${this.city}, ${this.state}, ${this.country}`;
  }

  equals(other: Location): boolean {
    return this.city === other.city &&
           this.state === other.state &&
           this.country === other.country;
  }
}
```

#### Email Value Object

```typescript
// src/shared-kernel/value-objects/email.vo.ts
export class Email {
  constructor(readonly value: string) {
    if (!this.isValid(value)) {
      throw new Error('Invalid email format');
    }
  }

  private isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  equals(other: Email): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }

  toString(): string {
    return this.value;
  }
}
```

### Module Setup

```typescript
// src/shared-kernel/shared-kernel.module.ts
@Module({
  imports: [],
  providers: [SkillRepository, IndustryRepository],
  exports: [SkillRepository, IndustryRepository],
})
export class SharedKernelModule {}
```

---

## CORE & EVENTS INFRASTRUCTURE

### DDD Building Blocks

```typescript
// src/core/domain/entity.ts
export abstract class Entity<T> {
  protected _id: T;

  constructor(id: T) {
    this._id = id;
  }

  get id(): T {
    return this._id;
  }

  abstract equals(object?: Entity<T>): boolean;
}

// src/core/domain/aggregate-root.ts
export abstract class AggregateRoot<T = string> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  getDomainEvents(): DomainEvent[] {
    return this._domainEvents;
  }
}

// src/core/domain/value-object.ts
export abstract class ValueObject {
  abstract equals(vo?: ValueObject): boolean;
}

// src/core/domain/domain-event.ts
export abstract class DomainEvent {
  public readonly occurredAt: Date = new Date();
  public readonly aggregateId: string;

  constructor(aggregateId: string) {
    this.aggregateId = aggregateId;
  }

  abstract getAggregateId(): string;
  abstract getEventName(): string;
}
```

### Domain Events

Domain events represent significant business occurrences that other parts of the system should know about.

```typescript
// src/events/domain-events.registry.ts
export class DomainEventsRegistry {
  private handlers: Map<string, Function[]> = new Map();

  register(eventName: string, handler: Function): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push(handler);
  }

  getHandlers(eventName: string): Function[] {
    return this.handlers.get(eventName) || [];
  }
}

// src/events/event-names.const.ts
export const DOMAIN_EVENTS = {
  // User events
  USER_REGISTERED: 'user.registered',
  USER_PROFILE_UPDATED: 'user.profile.updated',

  // Resume events
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_PARSING_COMPLETED: 'resume.parsing.completed',
  RESUME_PARSING_FAILED: 'resume.parsing.failed',

  // Job events
  JOB_PUBLISHED: 'job.published',
  JOB_CLOSED: 'job.closed',
  JOB_VIEWED: 'job.viewed',

  // Application events
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status.changed',
  APPLICATION_WITHDRAWN: 'application.withdrawn',

  // Recommendation events
  RECOMMENDATIONS_GENERATED: 'recommendations.generated',
  RECOMMENDATION_VIEWED: 'recommendation.viewed',

  // Offer events
  OFFER_SENT: 'offer.sent',
  OFFER_ACCEPTED: 'offer.accepted',
  OFFER_REJECTED: 'offer.rejected',

  // Interview events
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  INTERVIEW_REMINDER: 'interview.reminder',
};
```

### Event Bus Service

```typescript
// src/events/event-bus.service.ts
@Injectable()
export class EventBusService {
  constructor(
    private eventEmitter: EventEmitter2,
    private logger: Logger,
  ) {}

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publishEvent(event);
    }
  }

  async publishEvent(event: DomainEvent): Promise<void> {
    const eventName = event.getEventName();
    this.logger.log(`Publishing event: ${eventName}`);
    this.eventEmitter.emit(eventName, event);
  }

  subscribe(eventName: string, handler: (event: DomainEvent) => void): void {
    this.eventEmitter.on(eventName, handler);
  }

  subscribeAsync(
    eventName: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): void {
    this.eventEmitter.onAsync(eventName, handler);
  }
}

// src/events/event-bus.module.ts
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
```

---

## MODULE DOCUMENTATION

---

## USER MODULE

### Module Overview

The **User Module** manages job-seeker and employer profiles, personal information, preferences, work history, skills, education, and settings.

**Database Tables:**
- `users` - User identity & authentication
- `profiles` - Job-seeker specific profile data
- `skills` - User's professional skills (FK to shared-kernel skills)
- `experience` - Work history entries
- `education` - Educational background
- `certifications` - Professional certifications
- `projects` - Personal projects/portfolio
- `user_analytics` - User performance metrics
- `user_settings` - Preferences (theme, language, timezone, etc.)

### Module Responsibilities

1. **Profile Management**
   - Store & retrieve job-seeker profile data
   - Update personal information, bio, location, preferences
   - Manage profile visibility & settings

2. **Background Information**
   - Manage skills, proficiency levels, years of experience
   - Track work experience with companies, positions, responsibilities
   - Store educational background (degrees, institutions, graduation dates)
   - Manage professional certifications & credentials

3. **User Settings & Analytics**
   - Store user preferences (theme, language, timezone, etc.)
   - Track application metrics (total applications, interviews, offers)
   - Calculate engagement & retention metrics

4. **Profile Completion**
   - Calculate profile completion percentage
   - Identify missing sections or data
   - Suggest areas for improvement

### Folder Structure

```
src/modules/user/
├── controllers/
│   ├── user.controller.ts         # REST endpoints
│   └── profile.controller.ts      # Profile-specific endpoints
├── services/
│   ├── user.service.ts            # User management use cases
│   ├── profile.service.ts         # Profile management
│   ├── skills.service.ts          # Skill management
│   ├── experience.service.ts      # Work history management
│   ├── education.service.ts       # Education management
│   └── user-analytics.service.ts  # Analytics & metrics
├── repositories/
│   ├── user.repository.ts
│   ├── profile.repository.ts
│   ├── experience.repository.ts
│   ├── education.repository.ts
│   └── certification.repository.ts
├── entities/
│   ├── user.entity.ts
│   ├── profile.entity.ts
│   ├── experience.entity.ts
│   └── education.entity.ts
├── dtos/
│   ├── create-profile.dto.ts
│   ├── update-profile.dto.ts
│   ├── create-skill.dto.ts
│   ├── create-experience.dto.ts
│   ├── create-education.dto.ts
│   ├── update-education.dto.ts
│   ├── create-certification.dto.ts
│   ├── user-analytics.dto.ts
│   └── profile-response.dto.ts
├── events/
│   ├── user-registered.event.ts
│   ├── profile-updated.event.ts
│   └── user-analytics-updated.event.ts
└── user.module.ts
```

### Domain Entities

#### User Entity

```typescript
// src/modules/user/entities/user.entity.ts
export class User extends AggregateRoot<string> {
  id: string;                        // UUID (from Supabase Auth)
  email: Email;                      // Email value object
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string;
  role: UserRole;                    // USER, PREMIUM, PROFESSIONAL, ADMIN
  isEmailVerified: boolean;
  locked: boolean;
  lastLoginAt?: Date;
  onboardingComplete: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  profile?: Profile;                 // One-to-One with profiles table
  analytics?: UserAnalytics;         // One-to-One with user_analytics table

  // Methods
  static create(email: string, firstName: string, lastName: string): User
  getFullName(): string
  isOnboarded(): boolean
  isAdmin(): boolean
  isPremium(): boolean
  isProfessional(): boolean
}
```

#### Profile Entity

```typescript
// src/modules/user/entities/profile.entity.ts
export class Profile extends AggregateRoot<string> {
  id: string;                        // UUID
  userId: string;                    // FK to users
  phone?: string;
  dateOfBirth?: Date;
  location: Location;                // Value object
  bio?: string;
  remotePreference: RemoteType;      // REMOTE_ONLY, HYBRID, ON_SITE, FLEXIBLE
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  preferredRoles: string[];          // Array of role titles
  willingToRelocate: boolean;
  profileVisibility: 'public' | 'private';
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  user: User;
  skills: UserSkill[];              // Many-to-Many with skills
  experiences: Experience[];         // One-to-Many
  educations: Education[];           // One-to-Many

  // Methods
  static create(userId: string, location: Location): Profile
  updatePreferences(remoteType: RemoteType, salary: SalaryRange): void
  getCompletionPercentage(): number  // 0-100
  addSkill(skillId: string, proficiency: string): void
}
```

#### Experience Entity

```typescript
// src/modules/user/entities/experience.entity.ts
export class Experience extends Entity<string> {
  id: string;
  userId: string;
  company: string;
  position: string;
  startDate: Date;
  endDate?: Date;                    // null if current role
  responsibilities: string[];        // Array of bullet points
  technologiesUsed: string[];        // Array of tech/tools
  keyAchievements: string[];        // Array of achievements
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;

  static create(
    userId: string,
    company: string,
    position: string,
    startDate: Date,
  ): Experience

  getDuration(): string              // "2 years 6 months"
  isCurrentRole(): boolean
  equals(other?: Entity<string>): boolean
}
```

#### Education Entity

```typescript
// src/modules/user/entities/education.entity.ts
export class Education extends Entity<string> {
  id: string;
  userId: string;
  institution: string;
  degreeLevel: DegreeLevel;          // BACHELOR, MASTER, PHD, etc.
  fieldOfStudy: string;
  graduationYear: number;
  gpa?: number;                      // e.g., 3.8
  honors?: string;                   // e.g., "Cum Laude"
  createdAt: Date;
  updatedAt: Date;

  static create(
    userId: string,
    institution: string,
    degreeLevel: DegreeLevel,
    fieldOfStudy: string,
    graduationYear: number,
  ): Education

  equals(other?: Entity<string>): boolean
}
```

#### Certification Entity

```typescript
// src/modules/user/entities/certification.entity.ts
export class Certification extends Entity<string> {
  id: string;
  userId: string;
  name: string;                      // e.g., "AWS Certified Solutions Architect"
  organization: string;              // e.g., "Amazon Web Services"
  issuedDate: Date;
  expirationDate?: Date;             // Optional, null if no expiry
  credentialId?: string;
  credentialUrl?: string;
  createdAt: Date;
  updatedAt: Date;

  static create(
    userId: string,
    name: string,
    organization: string,
    issuedDate: Date,
  ): Certification

  isExpired(): boolean
  equals(other?: Entity<string>): boolean
}
```

#### UserAnalytics Entity

```typescript
// src/modules/user/entities/user-analytics.entity.ts
export class UserAnalytics extends Entity<string> {
  id: string;
  userId: string;
  totalApplications: number = 0;
  totalInterviews: number = 0;
  totalOffers: number = 0;
  interviewRate: number = 0;         // Calculated: (interviews / applications) * 100
  offerRate: number = 0;             // Calculated: (offers / interviews) * 100
  lastApplicationDate?: Date;
  lastInterviewDate?: Date;
  lastOfferDate?: Date;
  updatedAt: Date;
  createdAt: Date;

  static create(userId: string): UserAnalytics

  calculateInterviewRate(): number
  calculateOfferRate(): number
  updateFromApplications(applications: Application[]): void
  equals(other?: Entity<string>): boolean
}
```

### DTOs

```typescript
// src/modules/user/dtos/create-profile.dto.ts
export class CreateProfileDto {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: Date;
  location: {
    city: string;
    state: string;
    country?: string;
  };
  bio?: string;
  remotePreference: RemoteType;
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  preferredRoles?: string[];
  profileVisibility: 'public' | 'private';
}

// src/modules/user/dtos/update-profile.dto.ts
export class UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  remotePreference?: RemoteType;
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  preferredRoles?: string[];
  profileVisibility?: 'public' | 'private';
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

// src/modules/user/dtos/create-skill.dto.ts
export class CreateSkillDto {
  skillId: string;                   // FK to shared-kernel skills
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience: number;
}

// src/modules/user/dtos/create-experience.dto.ts
export class CreateExperienceDto {
  company: string;
  position: string;
  startDate: Date;
  endDate?: Date;
  responsibilities: string[];
  technologiesUsed: string[];
  keyAchievements: string[];
  isCurrent: boolean;
}

// src/modules/user/dtos/create-education.dto.ts
export class CreateEducationDto {
  institution: string;
  degreeLevel: DegreeLevel;
  fieldOfStudy: string;
  graduationYear: number;
  gpa?: number;
  honors?: string;
}

// src/modules/user/dtos/create-certification.dto.ts
export class CreateCertificationDto {
  name: string;
  organization: string;
  issuedDate: Date;
  expirationDate?: Date;
  credentialId?: string;
  credentialUrl?: string;
}

// src/modules/user/dtos/profile-response.dto.ts
export class ProfileResponseDto {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location: string;
  bio?: string;
  remotePreference: RemoteType;
  expectedSalary?: {
    min: number;
    max: number;
  };
  preferredRoles: string[];
  profileVisibility: string;
  completionPercentage: number;
  skills: {
    id: string;
    name: string;
    proficiency: string;
    yearsOfExperience: number;
  }[];
  experiences: {
    id: string;
    company: string;
    position: string;
    duration: string;
  }[];
  educations: {
    id: string;
    institution: string;
    degree: string;
    field: string;
    year: number;
  }[];
  contacts: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// src/modules/user/dtos/user-analytics.dto.ts
export class UserAnalyticsDto {
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  interviewRate: number;             // 0-100
  offerRate: number;                 // 0-100
  lastApplicationDate?: Date;
  lastInterviewDate?: Date;
  updatedAt: Date;
}
```

### Services

```typescript
// src/modules/user/services/user.service.ts
@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private profileService: ProfileService,
    private analyticsService: UserAnalyticsService,
    private eventBus: EventBusService,
  ) {}

  /**
   * Create a new user (called during signup)
   * Frontend: Flow 0 - Authentication → Signup
   */
  async createUser(
    email: string,
    firstName: string,
    lastName: string,
    photoUrl?: string,
  ): Promise<User> {
    const emailVO = new Email(email);
    const user = User.create(emailVO, firstName, lastName, photoUrl);

    const savedUser = await this.userRepository.save(user);

    // Publish domain event
    const event = new UserRegisteredEvent(savedUser.id, email);
    await this.eventBus.publishEvent(event);

    return savedUser;
  }

  /**
   * Get user by ID with all related data
   */
  async getUserById(userId: string): Promise<User> {
    return this.userRepository.findByIdWithRelations(userId);
  }

  /**
   * Update user basic info
   */
  async updateUser(
    userId: string,
    data: Partial<User>,
  ): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  /**
   * Mark onboarding as complete
   * Frontend: Flow 1 - Onboarding → Phase 5
   */
  async completeOnboarding(userId: string): Promise<void> {
    await this.userRepository.update(userId, { onboardingComplete: true });
  }

  /**
   * Upgrade user subscription tier
   * Frontend: Flow 8 - Subscriptions
   */
  async upgradeSubscription(userId: string, newRole: UserRole): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.role = newRole;
    return this.userRepository.save(user);
  }
}

// src/modules/user/services/profile.service.ts
@Injectable()
export class ProfileService {
  constructor(
    private profileRepository: ProfileRepository,
    private skillRepository: SkillRepository,
    private eventBus: EventBusService,
  ) {}

  /**
   * Create profile during onboarding
   * Frontend: Flow 1 - Onboarding → Phase 1
   */
  async createProfile(
    userId: string,
    dto: CreateProfileDto,
  ): Promise<Profile> {
    const location = new Location(
      dto.location.city,
      dto.location.state,
      dto.location.country,
    );

    const profile = Profile.create(userId, location);
    profile.remotePreference = dto.remotePreference;
    profile.preferredRoles = dto.preferredRoles || [];
    profile.profileVisibility = dto.profileVisibility;

    if (dto.expectedSalaryMin && dto.expectedSalaryMax) {
      profile.expectedSalaryMin = dto.expectedSalaryMin;
      profile.expectedSalaryMax = dto.expectedSalaryMax;
    }

    const saved = await this.profileRepository.save(profile);

    // Publish event
    const event = new ProfileCreatedEvent(userId);
    await this.eventBus.publishEvent(event);

    return saved;
  }

  /**
   * Get full profile with all details
   * Frontend: Flow 4A - My Profile
   */
  async getProfile(userId: string): Promise<Profile> {
    return this.profileRepository.findByUserIdWithRelations(userId);
  }

  /**
   * Update profile information
   * Frontend: Flow 4A - My Profile → Edit
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Profile> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    Object.assign(profile, dto);
    const updated = await this.profileRepository.save(profile);

    // Publish event
    const event = new ProfileUpdatedEvent(userId);
    await this.eventBus.publishEvent(event);

    return updated;
  }

  /**
   * Calculate profile completion percentage
   * Frontend: Flow 4A - My Profile → Completion Score
   */
  async getProfileCompletionPercentage(userId: string): Promise<number> {
    const profile = await this.profileRepository.findByUserIdWithRelations(userId);
    if (!profile) return 0;

    let score = 0;
    const checks = [];

    // Personal Info
    if (profile.user.firstName && profile.user.lastName) checks.push(true);
    if (profile.user.profilePhotoUrl) checks.push(true);
    if (profile.bio) checks.push(true);

    // Work Preferences
    if (profile.remotePreference) checks.push(true);
    if (profile.expectedSalaryMin && profile.expectedSalaryMax) checks.push(true);
    if (profile.preferredRoles?.length > 0) checks.push(true);

    // Background
    if (profile.skills?.length > 0) checks.push(true);
    if (profile.experiences?.length > 0) checks.push(true);
    if (profile.educations?.length > 0) checks.push(true);

    score = (checks.length / 9) * 100; // 9 = total checks
    return Math.round(score);
  }
}

// src/modules/user/services/skills.service.ts
@Injectable()
export class SkillsService {
  constructor(
    private profileRepository: ProfileRepository,
    private skillRepository: SkillRepository,
  ) {}

  /**
   * Add skill to user profile
   * Frontend: Flow 4C - Skills & Experience → Tab 1
   */
  async addSkill(
    userId: string,
    skillId: string,
    proficiency: string,
    yearsOfExperience: number,
  ): Promise<void> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    // Verify skill exists in shared-kernel
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) throw new BadRequestException('Skill not found');

    // Add to profile's many-to-many relationship
    profile.addSkill(skillId, proficiency, yearsOfExperience);
    await this.profileRepository.save(profile);
  }

  /**
   * Remove skill from user profile
   * Frontend: Flow 4C - Skills & Experience → Tab 1 → Delete
   */
  async removeSkill(userId: string, skillId: string): Promise<void> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    profile.removeSkill(skillId);
    await this.profileRepository.save(profile);
  }

  /**
   * Get user's skills with details
   */
  async getUserSkills(userId: string): Promise<UserSkill[]> {
    return this.profileRepository.findUserSkills(userId);
  }

  /**
   * Search for skills (autocomplete)
   * Frontend: Flow 4C - Skills & Experience → Add Skill
   */
  async searchSkills(query: string, limit: number = 20): Promise<Skill[]> {
    return this.skillRepository.searchByNamePrefix(query, limit);
  }
}

// src/modules/user/services/experience.service.ts
@Injectable()
export class ExperienceService {
  constructor(
    private experienceRepository: ExperienceRepository,
    private profileRepository: ProfileRepository,
  ) {}

  /**
   * Add work experience
   * Frontend: Flow 1 - Onboarding → Phase 4
   * Frontend: Flow 4C - Skills & Experience → Tab 2
   */
  async addExperience(
    userId: string,
    dto: CreateExperienceDto,
  ): Promise<Experience> {
    const experience = Experience.create(userId, dto);
    return this.experienceRepository.save(experience);
  }

  /**
   * Get all experiences for user
   */
  async getUserExperiences(userId: string): Promise<Experience[]> {
    return this.experienceRepository.findByUserId(userId);
  }

  /**
   * Update experience entry
   */
  async updateExperience(
    userId: string,
    experienceId: string,
    dto: Partial<CreateExperienceDto>,
  ): Promise<Experience> {
    const experience = await this.experienceRepository.findById(experienceId);
    if (!experience || experience.userId !== userId) {
      throw new NotFoundException('Experience not found');
    }

    Object.assign(experience, dto);
    return this.experienceRepository.save(experience);
  }

  /**
   * Remove experience entry
   */
  async removeExperience(userId: string, experienceId: string): Promise<void> {
    const experience = await this.experienceRepository.findById(experienceId);
    if (!experience || experience.userId !== userId) {
      throw new NotFoundException('Experience not found');
    }

    await this.experienceRepository.delete(experienceId);
  }
}

// src/modules/user/services/education.service.ts
@Injectable()
export class EducationService {
  constructor(
    private educationRepository: EducationRepository,
  ) {}

  /**
   * Add education entry
   * Frontend: Flow 1 - Onboarding → Phase 4
   * Frontend: Flow 4C - Skills & Experience → Tab 3
   */
  async addEducation(
    userId: string,
    dto: CreateEducationDto,
  ): Promise<Education> {
    const education = Education.create(userId, dto);
    return this.educationRepository.save(education);
  }

  /**
   * Get all education entries for user
   */
  async getUserEducations(userId: string): Promise<Education[]> {
    return this.educationRepository.findByUserId(userId);
  }

  /**
   * Update education entry
   */
  async updateEducation(
    userId: string,
    educationId: string,
    dto: Partial<CreateEducationDto>,
  ): Promise<Education> {
    const education = await this.educationRepository.findById(educationId);
    if (!education || education.userId !== userId) {
      throw new NotFoundException('Education not found');
    }

    Object.assign(education, dto);
    return this.educationRepository.save(education);
  }

  /**
   * Remove education entry
   */
  async removeEducation(userId: string, educationId: string): Promise<void> {
    const education = await this.educationRepository.findById(educationId);
    if (!education || education.userId !== userId) {
      throw new NotFoundException('Education not found');
    }

    await this.educationRepository.delete(educationId);
  }
}

// src/modules/user/services/user-analytics.service.ts
@Injectable()
export class UserAnalyticsService {
  constructor(
    private analyticsRepository: UserAnalyticsRepository,
    private applicationRepository: ApplicationRepository,
  ) {}

  /**
   * Get user analytics dashboard
   * Frontend: Flow 3D - My Stats
   */
  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    return this.analyticsRepository.findByUserId(userId);
  }

  /**
   * Recalculate analytics from applications
   * Triggered by: Application events, scheduled nightly job
   */
  async recalculateAnalytics(userId: string): Promise<void> {
    const applications = await this.applicationRepository.findByUserId(userId);

    const analytics = await this.analyticsRepository.findByUserId(userId);
    if (!analytics) throw new NotFoundException('Analytics not found');

    // Count statuses
    const totalApplications = applications.length;
    const totalInterviews = applications.filter(
      a => a.status.includes('interview') || a.status === ApplicationStatus.OFFER_RECEIVED || a.status === ApplicationStatus.OFFER_ACCEPTED,
    ).length;
    const totalOffers = applications.filter(
      a => a.status === ApplicationStatus.OFFER_RECEIVED || a.status === ApplicationStatus.OFFER_ACCEPTED,
    ).length;

    analytics.totalApplications = totalApplications;
    analytics.totalInterviews = totalInterviews;
    analytics.totalOffers = totalOffers;

    // Calculate rates
    const interviewRate = totalApplications > 0 ? (totalInterviews / totalApplications) * 100 : 0;
    const offerRate = totalInterviews > 0 ? (totalOffers / totalInterviews) * 100 : 0;

    analytics.interviewRate = Math.round(interviewRate);
    analytics.offerRate = Math.round(offerRate);

    // Get last dates
    const sortedByDate = applications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    analytics.lastApplicationDate = sortedByDate[0]?.createdAt;
    analytics.lastInterviewDate = applications.find(a => a.status.includes('interview'))?.createdAt;
    analytics.lastOfferDate = applications.find(a => a.status === ApplicationStatus.OFFER_RECEIVED || a.status === ApplicationStatus.OFFER_ACCEPTED)?.createdAt;

    await this.analyticsRepository.save(analytics);
  }

  /**
   * Get analytics timeline (applications per month)
   * Frontend: Flow 3D - My Stats → Charts
   */
  async getApplicationsTimeline(
    userId: string,
    months: number = 3,
  ): Promise<{ month: string; count: number }[]> {
    return this.analyticsRepository.findApplicationsTimeline(userId, months);
  }

  /**
   * Get application source breakdown
   * Frontend: Flow 3D - My Stats → Charts
   */
  async getApplicationSourceBreakdown(userId: string): Promise<{
    recommendations: number;
    search: number;
    saved: number;
    extension: number;
  }> {
    return this.analyticsRepository.findApplicationSourceBreakdown(userId);
  }
}
```

### Repositories

```typescript
// src/modules/user/repositories/user.repository.ts
@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaService) {}

  async save(user: User): Promise<User> {
    const existing = await this.prisma.users.findUnique({
      where: { id: user.id },
    });

    if (existing) {
      return this.prisma.users.update({
        where: { id: user.id },
        data: {
          email: user.email.value,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePhotoUrl: user.profilePhotoUrl,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          locked: user.locked,
          lastLoginAt: user.lastLoginAt,
          onboardingComplete: user.onboardingComplete,
        },
        include: { profile: true, analytics: true },
      }) as Promise<User>;
    }

    return this.prisma.users.create({
      data: {
        id: user.id,
        email: user.email.value,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePhotoUrl: user.profilePhotoUrl,
        role: user.role,
        createdAt: user.createdAt,
      },
    }) as Promise<User>;
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.users.findUnique({ where: { id } }) as Promise<User | null>;
  }

  async findByIdWithRelations(id: string): Promise<User> {
    const user = await this.prisma.users.findUnique({
      where: { id },
      include: {
        profile: {
          include: {
            skills: { include: { skill: true } },
            experiences: true,
            educations: true,
            certifications: true,
          },
        },
        analytics: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user as unknown as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.users.findUnique({
      where: { email },
    }) as Promise<User | null>;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.users.update({
      where: { id },
      data: data as any,
    }) as Promise<User>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.users.delete({ where: { id } });
  }
}

// src/modules/user/repositories/profile.repository.ts
@Injectable()
export class ProfileRepository implements IProfileRepository {
  constructor(private prisma: PrismaService) {}

  async save(profile: Profile): Promise<Profile> {
    const existing = await this.prisma.profiles.findUnique({
      where: { id: profile.id },
    });

    if (existing) {
      return this.prisma.profiles.update({
        where: { id: profile.id },
        data: {
          phone: profile.phone,
          dateOfBirth: profile.dateOfBirth,
          location: JSON.stringify({
            city: profile.location.city,
            state: profile.location.state,
            country: profile.location.country,
          }),
          bio: profile.bio,
          remotePreference: profile.remotePreference,
          expectedSalaryMin: profile.expectedSalaryMin,
          expectedSalaryMax: profile.expectedSalaryMax,
          preferredRoles: profile.preferredRoles,
          profileVisibility: profile.profileVisibility,
          linkedinUrl: profile.linkedinUrl,
          githubUrl: profile.githubUrl,
          portfolioUrl: profile.portfolioUrl,
        },
        include: {
          skills: { include: { skill: true } },
          experiences: true,
          educations: true,
        },
      }) as Promise<Profile>;
    }

    return this.prisma.profiles.create({
      data: {
        id: profile.id,
        userId: profile.userId,
        location: JSON.stringify({
          city: profile.location.city,
          state: profile.location.state,
          country: profile.location.country,
        }),
        remotePreference: profile.remotePreference,
        profileVisibility: profile.profileVisibility,
        createdAt: profile.createdAt,
      },
      include: {
        skills: { include: { skill: true } },
        experiences: true,
        educations: true,
      },
    }) as Promise<Profile>;
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profiles.findUnique({
      where: { userId },
    }) as Promise<Profile | null>;
  }

  async findByUserIdWithRelations(userId: string): Promise<Profile> {
    const profile = await this.prisma.profiles.findUnique({
      where: { userId },
      include: {
        user: true,
        skills: { include: { skill: true } },
        experiences: true,
        educations: true,
        certifications: true,
      },
    });

    if (!profile) throw new NotFoundException('Profile not found');
    return profile as unknown as Profile;
  }

  async findUserSkills(userId: string): Promise<UserSkill[]> {
    return this.prisma.userSkills.findMany({
      where: { profile: { userId } },
      include: { skill: true },
    });
  }
}

// src/modules/user/repositories/experience.repository.ts
@Injectable()
export class ExperienceRepository implements IExperienceRepository {
  constructor(private prisma: PrismaService) {}

  async save(experience: Experience): Promise<Experience> {
    return this.prisma.experiences.upsert({
      where: { id: experience.id || 'new' },
      create: {
        userId: experience.userId,
        company: experience.company,
        position: experience.position,
        startDate: experience.startDate,
        endDate: experience.endDate,
        responsibilities: experience.responsibilities,
        technologiesUsed: experience.technologiesUsed,
        keyAchievements: experience.keyAchievements,
        isCurrent: experience.isCurrent,
      },
      update: {
        company: experience.company,
        position: experience.position,
        startDate: experience.startDate,
        endDate: experience.endDate,
        responsibilities: experience.responsibilities,
        technologiesUsed: experience.technologiesUsed,
        keyAchievements: experience.keyAchievements,
        isCurrent: experience.isCurrent,
      },
    }) as Promise<Experience>;
  }

  async findByUserId(userId: string): Promise<Experience[]> {
    return this.prisma.experiences.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    }) as Promise<Experience[]>;
  }

  async findById(id: string): Promise<Experience | null> {
    return this.prisma.experiences.findUnique({
      where: { id },
    }) as Promise<Experience | null>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.experiences.delete({ where: { id } });
  }
}

// src/modules/user/repositories/education.repository.ts
@Injectable()
export class EducationRepository implements IEducationRepository {
  constructor(private prisma: PrismaService) {}

  async save(education: Education): Promise<Education> {
    return this.prisma.educations.upsert({
      where: { id: education.id || 'new' },
      create: {
        userId: education.userId,
        institution: education.institution,
        degreeLevel: education.degreeLevel,
        fieldOfStudy: education.fieldOfStudy,
        graduationYear: education.graduationYear,
        gpa: education.gpa,
        honors: education.honors,
      },
      update: {
        institution: education.institution,
        degreeLevel: education.degreeLevel,
        fieldOfStudy: education.fieldOfStudy,
        graduationYear: education.graduationYear,
        gpa: education.gpa,
        honors: education.honors,
      },
    }) as Promise<Education>;
  }

  async findByUserId(userId: string): Promise<Education[]> {
    return this.prisma.educations.findMany({
      where: { userId },
      orderBy: { graduationYear: 'desc' },
    }) as Promise<Education[]>;
  }

  async findById(id: string): Promise<Education | null> {
    return this.prisma.educations.findUnique({
      where: { id },
    }) as Promise<Education | null>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.educations.delete({ where: { id } });
  }
}

// src/modules/user/repositories/user-analytics.repository.ts
@Injectable()
export class UserAnalyticsRepository implements IUserAnalyticsRepository {
  constructor(private prisma: PrismaService) {}

  async save(analytics: UserAnalytics): Promise<UserAnalytics> {
    return this.prisma.userAnalytics.upsert({
      where: { userId: analytics.userId },
      create: {
        userId: analytics.userId,
        totalApplications: analytics.totalApplications,
        totalInterviews: analytics.totalInterviews,
        totalOffers: analytics.totalOffers,
      },
      update: {
        totalApplications: analytics.totalApplications,
        totalInterviews: analytics.totalInterviews,
        totalOffers: analytics.totalOffers,
        interviewRate: analytics.interviewRate,
        offerRate: analytics.offerRate,
        lastApplicationDate: analytics.lastApplicationDate,
        lastInterviewDate: analytics.lastInterviewDate,
      },
    }) as Promise<UserAnalytics>;
  }

  async findByUserId(userId: string): Promise<UserAnalytics> {
    const analytics = await this.prisma.userAnalytics.findUnique({
      where: { userId },
    });

    if (!analytics) throw new NotFoundException('Analytics not found');
    return analytics as unknown as UserAnalytics;
  }

  async findApplicationsTimeline(
    userId: string,
    months: number,
  ): Promise<{ month: string; count: number }[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const results = await this.prisma.applications.groupBy({
      by: ['createdAt'],
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // Group by month
    const timeline: Record<string, number> = {};
    results.forEach(({ createdAt, _count }) => {
      const monthKey = new Date(createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });
      timeline[monthKey] = (timeline[monthKey] || 0) + _count;
    });

    return Object.entries(timeline).map(([month, count]) => ({ month, count }));
  }

  async findApplicationSourceBreakdown(userId: string): Promise<{
    recommendations: number;
    search: number;
    saved: number;
    extension: number;
  }> {
    const applications = await this.prisma.applications.findMany({
      where: { userId },
      select: { source: true },
    });

    return {
      recommendations: applications.filter(a => a.source === 'recommendations').length,
      search: applications.filter(a => a.source === 'search').length,
      saved: applications.filter(a => a.source === 'saved').length,
      extension: applications.filter(a => a.source === 'extension').length,
    };
  }
}
```

### API Endpoints

```typescript
// src/modules/user/controllers/profile.controller.ts
@Controller('api/profiles')
export class ProfileController {
  constructor(
    private userService: UserService,
    private profileService: ProfileService,
    private skillsService: SkillsService,
    private experienceService: ExperienceService,
    private educationService: EducationService,
  ) {}

  /**
   * GET /api/profiles/:userId
   * Get user profile with all details
   * Frontend: Flow 4A - My Profile
   */
  @Get(':userId')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Param('userId') userId: string) {
    const profile = await this.profileService.getProfile(userId);
    const completeness = await this.profileService.getProfileCompletionPercentage(userId);
    
    return {
      ...profile,
      completionPercentage: completeness,
    };
  }

  /**
   * PATCH /api/profiles/:userId
   * Update user profile
   * Frontend: Flow 4A - My Profile → Edit
   */
  @Patch(':userId')
  @UseGuards(SupabaseAuthGuard)
  async updateProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, dto);
  }

  /**
   * GET /api/user-analytics
   * Get user analytics dashboard
   * Frontend: Flow 3D - My Stats
   */
  @Get(':userId/analytics')
  @UseGuards(SupabaseAuthGuard)
  async getUserAnalytics(@Param('userId') userId: string) {
    return this.analyticsService.getUserAnalytics(userId);
  }

  /**
   * GET /api/skills/search
   * Search skills (autocomplete)
   * Frontend: Flow 4C - Skills & Experience → Add Skill
   */
  @Get('skills/search')
  @UseGuards(SupabaseAuthGuard)
  async searchSkills(@Query('q') query: string, @Query('limit') limit: string) {
    return this.skillsService.searchSkills(query, parseInt(limit) || 20);
  }

  /**
   * POST /api/skills
   * Add skill to profile
   * Frontend: Flow 4C - Skills & Experience → Tab 1
   */
  @Post('skills')
  @UseGuards(SupabaseAuthGuard)
  async addSkill(
    @CurrentUser() user: User,
    @Body() dto: CreateSkillDto,
  ) {
    await this.skillsService.addSkill(
      user.id,
      dto.skillId,
      dto.proficiency,
      dto.yearsOfExperience,
    );
    return { success: true };
  }

  /**
   * DELETE /api/skills/:skillId
   * Remove skill from profile
   */
  @Delete('skills/:skillId')
  @UseGuards(SupabaseAuthGuard)
  async removeSkill(
    @CurrentUser() user: User,
    @Param('skillId') skillId: string,
  ) {
    await this.skillsService.removeSkill(user.id, skillId);
    return { success: true };
  }

  /**
   * POST /api/experience
   * Add work experience
   * Frontend: Flow 4C - Skills & Experience → Tab 2
   */
  @Post('experience')
  @UseGuards(SupabaseAuthGuard)
  async addExperience(
    @CurrentUser() user: User,
    @Body() dto: CreateExperienceDto,
  ) {
    return this.experienceService.addExperience(user.id, dto);
  }

  /**
   * GET /api/experience
   * Get all work experiences
   */
  @Get('experience')
  @UseGuards(SupabaseAuthGuard)
  async getExperiences(@CurrentUser() user: User) {
    return this.experienceService.getUserExperiences(user.id);
  }

  /**
   * PATCH /api/experience/:experienceId
   * Update work experience
   */
  @Patch('experience/:experienceId')
  @UseGuards(SupabaseAuthGuard)
  async updateExperience(
    @CurrentUser() user: User,
    @Param('experienceId') experienceId: string,
    @Body() dto: Partial<CreateExperienceDto>,
  ) {
    return this.experienceService.updateExperience(user.id, experienceId, dto);
  }

  /**
   * DELETE /api/experience/:experienceId
   * Remove work experience
   */
  @Delete('experience/:experienceId')
  @UseGuards(SupabaseAuthGuard)
  async deleteExperience(
    @CurrentUser() user: User,
    @Param('experienceId') experienceId: string,
  ) {
    await this.experienceService.removeExperience(user.id, experienceId);
    return { success: true };
  }

  /**
   * POST /api/education
   * Add education entry
   * Frontend: Flow 4C - Skills & Experience → Tab 3
   */
  @Post('education')
  @UseGuards(SupabaseAuthGuard)
  async addEducation(
    @CurrentUser() user: User,
    @Body() dto: CreateEducationDto,
  ) {
    return this.educationService.addEducation(user.id, dto);
  }

  /**
   * GET /api/education
   * Get all education entries
   */
  @Get('education')
  @UseGuards(SupabaseAuthGuard)
  async getEducations(@CurrentUser() user: User) {
    return this.educationService.getUserEducations(user.id);
  }

  /**
   * PATCH /api/education/:educationId
   * Update education entry
   */
  @Patch('education/:educationId')
  @UseGuards(SupabaseAuthGuard)
  async updateEducation(
    @CurrentUser() user: User,
    @Param('educationId') educationId: string,
    @Body() dto: Partial<CreateEducationDto>,
  ) {
    return this.educationService.updateEducation(user.id, educationId, dto);
  }

  /**
   * DELETE /api/education/:educationId
   * Remove education entry
   */
  @Delete('education/:educationId')
  @UseGuards(SupabaseAuthGuard)
  async deleteEducation(
    @CurrentUser() user: User,
    @Param('educationId') educationId: string,
  ) {
    await this.educationService.removeEducation(user.id, educationId);
    return { success: true };
  }
}
```

### Module Configuration

```typescript
// src/modules/user/user.module.ts
@Module({
  imports: [SharedKernelModule, EventBusModule],
  controllers: [ProfileController, UserController],
  providers: [
    UserService,
    ProfileService,
    SkillsService,
    ExperienceService,
    EducationService,
    UserAnalyticsService,
    UserRepository,
    ProfileRepository,
    ExperienceRepository,
    EducationRepository,
    CertificationRepository,
    UserAnalyticsRepository,
  ],
  exports: [
    UserService,
    ProfileService,
    UserRepository,
    ProfileRepository,
  ],
})
export class UserModule {}
```

---

## COMPANY MODULE

### Module Overview

The **Company Module** manages employer company profiles, branding, information, and verification.

**Database Tables:**
- `companies` - Company information (employer profiles)
- `company_jobs` - Count of open jobs per company (denormalized)

### Module Responsibilities

1. **Company Profile Management**
   - Store & retrieve employer company information
   - Manage company branding (logo, website, description)
   - Track company metadata (industry, size, founded year, funding stage)

2. **Company Information Display**
   - Provide company profiles for job postings
   - Display Glassdoor ratings & review counts
   - Show company salary data context

3. **Company Search & Discovery**
   - Search companies by name
   - Filter by industry, size, location

### Folder Structure

```
src/modules/company/
├── controllers/
│   └── company.controller.ts
├── services/
│   └── company.service.ts
├── repositories/
│   └── company.repository.ts
├── entities/
│   └── company.entity.ts
├── dtos/
│   ├── create-company.dto.ts
│   ├── update-company.dto.ts
│   └── company-response.dto.ts
└── company.module.ts
```

### Domain Entities

#### Company Entity

```typescript
// src/modules/company/entities/company.entity.ts
export class Company extends AggregateRoot<string> {
  id: string;                        // UUID
  name: string;
  slug: string;                      // URL-friendly name
  website?: string;
  logoUrl?: string;
  description?: string;              // Company description
  industry?: string;                 // FK to industries
  employeeCount?: number;            // e.g., 50-200, 200-500, etc.
  fundingStage?: string;             // Pre-seed, Seed, Series A, Series B, Public, etc.
  foundedYear?: number;
  headquarters?: string;             // City, Country
  glassdoorRating?: number;          // e.g., 4.2
  glassdoorReviewCount?: number;
  openJobsCount: number = 0;         // Denormalized count
  createdAt: Date;
  updatedAt: Date;

  // Methods
  static create(name: string, slug: string): Company
  updateGlassdoorData(rating: number, reviewCount: number): void
  incrementOpenJobsCount(): void
  decrementOpenJobsCount(): void
}
```

### Services

```typescript
// src/modules/company/services/company.service.ts
@Injectable()
export class CompanyService {
  constructor(
    private companyRepository: CompanyRepository,
  ) {}

  /**
   * Create or find company
   * Used when posting a new job
   * Frontend: Job posting form (employer flow)
   */
  async createOrFindCompany(data: {
    name: string;
    website?: string;
    industry?: string;
  }): Promise<Company> {
    const slug = this.slugify(data.name);
    const existing = await this.companyRepository.findBySlug(slug);

    if (existing) return existing;

    const company = Company.create(data.name, slug);
    if (data.website) company.website = data.website;
    if (data.industry) company.industry = data.industry;

    return this.companyRepository.save(company);
  }

  /**
   * Get company details
   * Frontend: Flow 2B - Job Detail Page → Company Info
   */
  async getCompanyDetails(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Get company by name
   */
  async getCompanyByName(name: string): Promise<Company | null> {
    const slug = this.slugify(name);
    return this.companyRepository.findBySlug(slug);
  }

  /**
   * Search companies
   * Frontend: Flow 2B - Job Search → Company Filter
   */
  async searchCompanies(query: string, limit: number = 20): Promise<Company[]> {
    return this.companyRepository.searchByName(query, limit);
  }

  /**
   * Update company information
   */
  async updateCompany(companyId: string, data: Partial<Company>): Promise<Company> {
    return this.companyRepository.update(companyId, data);
  }

  /**
   * Sync Glassdoor data
   * Triggered by: Scheduled job, manual admin action
   */
  async syncGlassdoorData(companyId: string, rating: number, reviewCount: number): Promise<void> {
    const company = await this.companyRepository.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    company.updateGlassdoorData(rating, reviewCount);
    await this.companyRepository.save(company);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
  }
}
```

### API Endpoints

```typescript
// src/modules/company/controllers/company.controller.ts
@Controller('api/companies')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  /**
   * GET /api/companies/search?q=
   * Search companies
   * Frontend: Flow 2B - Job Search → Company Filter
   */
  @Get('search')
  async searchCompanies(
    @Query('q') query: string,
    @Query('limit') limit: string,
  ) {
    return this.companyService.searchCompanies(query, parseInt(limit) || 20);
  }

  /**
   * GET /api/companies/:companyId
   * Get company details
   * Frontend: Flow 2B - Job Detail Page → Company Info
   */
  @Get(':companyId')
  async getCompanyDetails(@Param('companyId') companyId: string) {
    return this.companyService.getCompanyDetails(companyId);
  }
}
```

---

Due to token limitations, I'll continue the documentation in a structured format below. Let me create a comprehensive outline for the remaining modules:

---

## REMAINING MODULES (ABBREVIATED)

Due to length constraints, here's the structure for remaining modules:

### JOB MODULE
- **Responsibility:** Job postings, listing, search, filtering
- **Tables:** jobs, job_forms, job_form_responses
- **Key Services:** JobService, JobSearchService, JobFilterService
- **APIs:** POST/GET jobs, GET jobs/search, GET jobs/{id}

### RESUME MODULE
- **Responsibility:** Resume management, parsing, scoring
- **Tables:** resumes, media (for file storage)
- **Key Services:** ResumeService, ResumeParsingService, ResumeScoreService
- **APIs:** POST resumes/upload, GET resumes, PATCH resumes/{id}, GET resumes/{id}/ats-breakdown

### APPLICATION MODULE
- **Responsibility:** Job applications, status tracking, timeline
- **Tables:** applications, application_timeline, contact_persons
- **Key Services:** ApplicationService, ApplicationStatusService
- **APIs:** POST applications, GET applications, PATCH applications/{id}, POST applications/{id}/timeline

### MATCHING MODULE
- **Responsibility:** AI recommendation algorithm, match scoring
- **Tables:** recommendations, user_preferences (implicit)
- **Key Services:** MatchingService, MatchScoreCalculator
- **APIs:** GET recommendations, PATCH recommendations/{id}/action, POST recommendations/generate

### NOTIFICATION MODULE
- **Responsibility:** Email & in-app notifications, preference management
- **Tables:** notifications, notification_preferences
- **Key Services:** NotificationService, EmailService, NotificationPreferenceService
- **APIs:** GET notifications, PATCH notifications/{id}, POST notifications/clear-all

### PAYMENT MODULE
- **Responsibility:** Subscriptions, billing, Stripe integration
- **Tables:** subscriptions, payments
- **Key Services:** PaymentService, SubscriptionService, StripeAdapterService
- **APIs:** GET subscriptions/plans, POST subscriptions/checkout, GET/PATCH subscriptions/{id}

### ADMIN MODULE
- **Responsibility:** Platform management, moderation, analytics
- **Tables:** All tables (read access)
- **Key Services:** AdminDashboardService, UserModerationService, AnalyticsService
- **APIs:** GET admin/dashboard, GET admin/users, GET admin/jobs, GET admin/analytics

---

## INTER-MODULE COMMUNICATION

Modules communicate through:

1. **Dependency Injection** - Services from other modules injected via constructor
2. **Domain Events** - Published via EventBusService for loose coupling
3. **Repository Pattern** - Consistent data access across modules

### Example: Application Submission Flow

```
ApplicationController
  ↓
ApplicationService.submitApplication()
  ↓
ApplicationRepository.save()
  ↓
[Event] ApplicationSubmitted published
  ↓
NotificationService (listens to event)
  ↓
Send email notification to user & company
```

---

**Next Steps:** Refer to the organized Frontend Documentation for frontend-backend alignment. Each backend endpoint maps directly to frontend flows documented in Flows 0-9.

---

