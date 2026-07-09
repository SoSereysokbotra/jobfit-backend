# JobFits Backend - Implementation Roadmap Part 2
## Phases 4-12: From Companies to Deployment

---

# PHASE 4: Company Module (Week 4.5)

## Goal
Company metadata & search for employer profiles.

## Deliverables

### 4.1 Prisma Schema
```prisma
model Company {
  id String @id @default(cuid())
  name String @unique
  description String?
  website String?
  logoUrl String?
  
  industry String?  // Industry ID
  size String?  // STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE
  foundedYear Int?
  
  // Location
  city String?
  state String?
  country String?
  
  // Glassdoor data
  glassdoorId String?
  glassdoorRating Float?
  glassdoorReviews Int?
  
  // Relations
  jobs Job[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([name])
  @@index([industry])
  @@fulltext([name, description])  // For FTS
}
```

### 4.2 Company Entity
```typescript
import { Entity } from '@core/domain/entity';
import { Location } from '@/shared/kernel/value-objects/location.vo';

export class Company extends Entity {
  name: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  industry?: string;
  size?: string;
  location?: Location;
  glassdoorRating?: number;

  constructor(props: any, id?: string) {
    super(props, id);
    this.name = props.name;
    this.description = props.description;
    this.website = props.website;
    this.logoUrl = props.logoUrl;
    this.industry = props.industry;
    this.size = props.size;
    this.location = props.location;
    this.glassdoorRating = props.glassdoorRating;
  }

  static create(props: any): Company {
    return new Company(props);
  }
}
```

### 4.3 CompanyService
- `searchCompanies(query: string, filters?)`: Search by name, industry, location
- `getCompanyById(id: string)`: Get single company with jobs count
- `syncGlassdoorData(companyId: string)`: External API call to fetch ratings
- `getCompanyStats(id: string)`: Job count, reviews, applications

### 4.4 API Endpoints
```
GET /companies/search?q=google&industry=tech
GET /companies/:id
GET /companies/:id/stats
GET /companies/:id/jobs
```

## Checklist
- [ ] Company entity & repository
- [ ] CompanyService with search & sync methods
- [ ] Prisma FTS configured for company search
- [ ] API endpoints working
- [ ] Can search companies by name & filter by industry

## Test This Phase
```bash
npx prisma migrate dev --name company_module

# Test search
GET /companies/search?q=google
```

---

# PHASE 5A: Job Module - Core (Week 5)

## Goal
Job posting & basic search without custom forms or AI.

## Deliverables

### 5A.1 Prisma Schema
```prisma
model Job {
  id String @id @default(cuid())
  companyId String
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  title String
  description String
  requirements String?  // Skills, experience required
  
  jobLevel JobLevel
  remoteType RemoteType
  employmentType EmploymentType
  
  salaryMin Int?
  salaryMax Int?
  salaryCurrency String @default("USD")
  
  // Location
  city String?
  state String?
  country String?
  
  // Classification
  industry String?  // Industry ID
  technologies String[]  // Tech stack
  
  // Job metadata
  applicantCount Int @default(0)
  viewCount Int @default(0)
  
  isActive Boolean @default(true)
  publishedAt DateTime @default(now())
  closedAt DateTime?
  expiresAt DateTime?
  
  // Relations
  applications Application[]
  recommendations Recommendation[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([companyId])
  @@index([jobLevel])
  @@index([remoteType])
  @@index([isActive])
  @@fulltext([title, description, requirements])  // FTS
}
```

### 5A.2 Job Entity
```typescript
import { AggregateRoot } from '@core/domain/aggregate-root';
import { JobLevel } from '@/shared/kernel/enums/job-level.enum';
import { RemoteType } from '@/shared/kernel/enums/remote-type.enum';
import { JobCreatedEvent } from '../events/job-created.event';

export class Job extends AggregateRoot {
  companyId: string;
  title: string;
  description: string;
  requirements?: string;
  jobLevel: JobLevel;
  remoteType: RemoteType;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  technologies: string[] = [];
  applicantCount: number = 0;
  viewCount: number = 0;
  isActive: boolean = true;

  constructor(props: any, id?: string) {
    super(props, id);
    Object.assign(this, props);
  }

  static create(props: any): Job {
    const job = new Job(props);
    job.addDomainEvent(new JobCreatedEvent(job.id, job.title, job.companyId));
    return job;
  }

  incrementApplicantCount(): void {
    this.applicantCount++;
  }

  incrementViewCount(): void {
    this.viewCount++;
  }

  close(): void {
    this.isActive = false;
    this.closedAt = new Date();
  }
}
```

### 5A.3 JobService with Full-Text Search
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { Job } from '../../domain/entities/job.entity';
import { JobRepository } from '../../infrastructure/repositories/job.repository';

@Injectable()
export class JobService {
  constructor(
    private jobRepository: JobRepository,
    private prisma: PrismaService,
  ) {}

  async createJob(props: any): Promise<Job> {
    const job = Job.create(props);
    await this.jobRepository.save(job);
    return job;
  }

  async getJobById(id: string): Promise<Job | null> {
    return this.jobRepository.findById(id);
  }

  async searchJobs(query: string, filters?: any): Promise<Job[]> {
    // Postgres Full-Text Search (FTS)
    const jobs = await this.prisma.job.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [
              { title: { search: query } },
              { description: { search: query } },
              { requirements: { search: query } },
            ],
          },
          filters?.jobLevel && { jobLevel: filters.jobLevel },
          filters?.remoteType && { remoteType: filters.remoteType },
          filters?.industry && { industry: filters.industry },
          filters?.minSalary && { salaryMin: { gte: filters.minSalary } },
          filters?.maxSalary && { salaryMax: { lte: filters.maxSalary } },
        ].filter(Boolean),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 20,
      skip: filters?.skip || 0,
    });

    return jobs.map(j => this.mapToEntity(j));
  }

  async getJobsByCompany(companyId: string): Promise<Job[]> {
    const jobs = await this.prisma.job.findMany({
      where: { companyId, isActive: true },
    });
    return jobs.map(j => this.mapToEntity(j));
  }

  async closeJob(jobId: string): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (job) {
      job.close();
      await this.jobRepository.save(job);
    }
  }

  private mapToEntity(raw: any): Job {
    return new Job(raw, raw.id);
  }
}
```

### 5A.4 JobRepository
- `save(job)`: Save or update job
- `findById(id)`: Get single job with company details
- `findByCompanyId(companyId)`: List company's jobs
- `search(query, filters)`: Full-text search with filters

### 5A.5 API Endpoints
```
POST /jobs (create)
GET /jobs/:id (get single)
GET /jobs/search?q=software&jobLevel=SENIOR
GET /jobs/company/:companyId
PATCH /jobs/:id (update)
PATCH /jobs/:id/close (close posting)
```

## Checklist
- [ ] Job entity with Postgres FTS search
- [ ] JobService with search & filtering
- [ ] All endpoints returning correct data
- [ ] Applicant count tracking
- [ ] Job closing workflow
- [ ] Can search jobs by title, description, requirements

---

# PHASE 5B: Resume Module - Upload & Parsing (Weeks 5-6)

## Goal
Resume storage, async parsing, and content extraction.

## Deliverables

### 5B.1 Prisma Schema
```prisma
model Resume {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  fileName String
  fileUrl String
  fileSize Int
  fileType String  // PDF or DOCX
  
  title String?  // "Main Resume", "LinkedIn Version", etc
  isDefault Boolean @default(false)
  
  // Parsed data
  parsedData ParsedResumeData?
  parsingStatus String @default("PENDING")  // PENDING, PROCESSING, SUCCESS, FAILED
  parsingError String?
  
  // Scores
  atsScore Int?
  qualityScore Int?
  
  version Int @default(1)  // For multi-version support
  
  // Relations
  applications Application[]
  recommendations Recommendation[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
  @@index([isDefault])
  @@index([parsingStatus])
}

model ParsedResumeData {
  id String @id @default(cuid())
  resumeId String @unique
  resume Resume @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  
  // Extracted content
  fullName String?
  email String?
  phone String?
  location String?
  
  summary String?
  experiences String?  // JSON array
  educations String?   // JSON array
  skills String?       // JSON array
  certifications String?  // JSON array
  
  // Raw text
  rawText String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 5B.2 ResumeService
```typescript
@Injectable()
export class ResumeService {
  constructor(
    private resumeRepository: ResumeRepository,
    private supabaseService: SupabaseStorageService,
    private resumeParserService: ResumeParserService,
    private queue: BullMQService,
  ) {}

  async uploadResume(
    userId: string,
    file: Express.Multer.File,
    title?: string,
  ): Promise<Resume> {
    // 1. Upload to Supabase Storage
    const fileUrl = await this.supabaseService.upload(
      `resumes/${userId}/${file.originalname}`,
      file,
    );

    // 2. Create resume record
    const resume = Resume.create({
      userId,
      fileName: file.originalname,
      fileUrl,
      fileSize: file.size,
      fileType: file.mimetype.includes('pdf') ? 'PDF' : 'DOCX',
      title: title || 'Resume',
    });

    await this.resumeRepository.save(resume);

    // 3. Queue parsing job (async)
    await this.queue.addJob('parseResume', {
      resumeId: resume.id,
      fileUrl,
      fileType: resume.fileType,
    });

    return resume;
  }

  async getResume(resumeId: string): Promise<Resume | null> {
    return this.resumeRepository.findById(resumeId);
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    return this.resumeRepository.findByUserId(userId);
  }

  async deleteResume(resumeId: string): Promise<void> {
    const resume = await this.resumeRepository.findById(resumeId);
    if (resume) {
      await this.supabaseService.delete(resume.fileUrl);
      await this.resumeRepository.delete(resumeId);
    }
  }

  async setDefaultResume(userId: string, resumeId: string): Promise<void> {
    // Unset other defaults
    await this.prisma.resume.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set new default
    await this.prisma.resume.update({
      where: { id: resumeId },
      data: { isDefault: true },
    });
  }
}
```

### 5B.3 ResumeParserService (Async)
```typescript
@Injectable()
export class ResumeParserService {
  constructor(
    private resumeRepository: ResumeRepository,
    private supabaseService: SupabaseStorageService,
  ) {}

  async parseResume(resumeId: string, fileUrl: string): Promise<void> {
    try {
      // 1. Download file from storage
      const fileBuffer = await this.supabaseService.download(fileUrl);

      // 2. Extract text (use pdfparse, mammoth, or external API)
      const text = await this.extractText(fileBuffer);

      // 3. Parse structured data (use regex, NLP, or external API)
      const parsed = await this.extractStructuredData(text);

      // 4. Save parsed data to database
      await this.resumeRepository.saveParsedData(resumeId, parsed);

      // 5. Update parsing status
      await this.resumeRepository.updateParsingStatus(
        resumeId,
        'SUCCESS',
      );
    } catch (error) {
      await this.resumeRepository.updateParsingStatus(
        resumeId,
        'FAILED',
        error.message,
      );
    }
  }

  private async extractText(buffer: Buffer): Promise<string> {
    // Use PDF/DOCX parsing library
    // Implement extraction logic
  }

  private async extractStructuredData(text: string): Promise<any> {
    // Parse text to extract:
    // - Name, Email, Phone, Location
    // - Experiences, Educations, Skills
    // Can use NLP or regex patterns
  }
}
```

### 5B.4 BullMQ Job Queue
```typescript
// In app.module.ts or queue configuration
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'resume-parsing',
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
      },
    }),
  ],
})
export class AppModule {}

// Resume parsing processor
@Processor('resume-parsing')
export class ResumeParsingProcessor {
  constructor(private resumeParserService: ResumeParserService) {}

  @Process('parseResume')
  async handleParseResume(job: Job) {
    const { resumeId, fileUrl } = job.data;
    await this.resumeParserService.parseResume(resumeId, fileUrl);
  }
}
```

### 5B.5 API Endpoints
```
POST /resumes (upload, returns resumeId)
GET /resumes (list user's resumes)
GET /resumes/:id (get single)
DELETE /resumes/:id
PATCH /resumes/:id/set-default
GET /resumes/:id/parsed-data (get extracted content)
GET /resumes/:id/parsing-status
```

## Checklist
- [ ] Supabase Storage integration working
- [ ] Resume upload endpoint accepting PDF & DOCX
- [ ] BullMQ queue configured with Redis
- [ ] Parsing processor handling async jobs
- [ ] Parsed data stored in ParsedResumeData table
- [ ] Can track parsing status
- [ ] Can set default resume
- [ ] File deletion working

---

# PHASE 5C: Resume Module - Scoring (Week 6)

## Goal
ATS score and quality score calculation.

## Deliverables

### 5C.1 ResumeScorerService
```typescript
@Injectable()
export class ResumeScorerService {
  async calculateATSScore(resumeId: string): Promise<number> {
    const resume = await this.resumeRepository.findById(resumeId);
    const parsed = resume.parsedData;

    let score = 0;

    // Formatting (20%): Check for bullets, consistent spacing
    score += this.scoreFormatting(parsed.rawText) * 0.2;

    // Keywords (30%): Count job keywords in resume
    score += this.scoreKeywords(parsed) * 0.3;

    // Parsing (20%): Easy to parse
    score += this.scoreParsability(parsed) * 0.2;

    // Length (15%): Ideal 1-2 pages
    score += this.scoreLength(parsed.rawText) * 0.15;

    // Contact Info (15%): Has email, phone, location
    score += this.scoreContactInfo(parsed) * 0.15;

    return Math.round(score);
  }

  async calculateQualityScore(resumeId: string): Promise<number> {
    const resume = await this.resumeRepository.findById(resumeId);
    const parsed = resume.parsedData;

    let score = 0;

    // Content (30%): Has experiences, educations, skills
    score += this.scoreContent(parsed) * 0.3;

    // Completeness (25%): All sections filled
    score += this.scoreCompleteness(parsed) * 0.25;

    // Grammar (20%): Spell check
    score += this.scoreGrammar(parsed.rawText) * 0.2;

    // Keywords (25%): Industry-relevant skills
    score += this.scoreKeywordsQuality(parsed) * 0.25;

    return Math.round(score);
  }

  private scoreFormatting(text: string): number {
    // Check for bullets, consistent spacing, font issues
    let points = 0;
    if (text.includes('•') || text.includes('-')) points += 50;
    // More checks...
    return Math.min(points, 100);
  }

  // ... other scoring methods
}
```

### 5C.2 Resume Scoring Endpoint
```
GET /resumes/:id/ats-score
GET /resumes/:id/quality-score
GET /resumes/:id/scores (returns both)
```

### 5C.3 Update Resume Entity
Add to Resume:
```typescript
atsScore?: number;
qualityScore?: number;
```

## Checklist
- [ ] ATS score calculation working (0-100)
- [ ] Quality score calculation working
- [ ] Scores persisted to database
- [ ] Endpoints returning scores
- [ ] Score breakdown available (optional)

---

# PHASE 6: Application Module (Week 7)

## Goal
Job applications, status tracking, and timeline.

## Key Entities
- Application (core)
- ApplicationTimeline (status history)
- ContactPerson (recruiter/hiring info)

### 6.1 Prisma Schema
```prisma
model Application {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  jobId String
  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)
  
  resumeId String?
  resume Resume? @relation(fields: [resumeId], references: [id])
  
  status ApplicationStatus @default(SUBMITTED)
  appliedAt DateTime @default(now())
  
  // Contact
  contactPerson ContactPerson?
  
  // Notes & Metadata
  notes String?
  coverLetter String?
  
  // Timeline
  timeline ApplicationTimeline[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([userId, jobId])  // Can't apply twice
  @@index([userId])
  @@index([status])
}

model ApplicationTimeline {
  id String @id @default(cuid())
  applicationId String
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  
  status ApplicationStatus
  eventType String  // APPLIED, INTERVIEW_SCHEDULED, OFFER_RECEIVED, etc.
  description String?
  
  eventDate DateTime @default(now())
}

model ContactPerson {
  id String @id @default(cuid())
  applicationId String @unique
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  
  name String
  email String?
  phone String?
  title String?  // Recruiter, Hiring Manager, etc.
  linkedinUrl String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 6.2 Application Service
```typescript
@Injectable()
export class ApplicationService {
  async submitApplication(dto: SubmitApplicationDto): Promise<Application> {
    const application = Application.create({
      userId: dto.userId,
      jobId: dto.jobId,
      resumeId: dto.resumeId,
      coverLetter: dto.coverLetter,
    });

    await this.applicationRepository.save(application);

    // Emit event
    for (const event of application.getDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return application;
  }

  async updateStatus(
    applicationId: string,
    newStatus: ApplicationStatus,
  ): Promise<void> {
    const application = await this.applicationRepository.findById(applicationId);
    
    application.updateStatus(newStatus);
    await this.applicationRepository.save(application);
    
    // Add to timeline
    await this.timelineRepository.addEvent(applicationId, {
      status: newStatus,
      eventType: this.mapStatusToEventType(newStatus),
      eventDate: new Date(),
    });

    // Emit event
    for (const event of application.getDomainEvents()) {
      await this.eventBus.publish(event);
    }
  }

  async getApplications(userId: string): Promise<Application[]> {
    return this.applicationRepository.findByUserId(userId);
  }

  async getApplicationTimeline(applicationId: string): Promise<any[]> {
    return this.timelineRepository.findByApplicationId(applicationId);
  }
}
```

### 6.3 API Endpoints
```
POST /applications (submit)
GET /applications (list user's)
GET /applications/:id
PATCH /applications/:id/status
GET /applications/:id/timeline
POST /applications/:id/contact-person
```

## Checklist
- [ ] Application entity with status workflow
- [ ] ApplicationTimeline tracking
- [ ] ContactPerson management
- [ ] Status update workflow working
- [ ] Cannot apply to same job twice
- [ ] Timeline populated on status change
- [ ] Domain events emitted

---

# PHASE 7: Matching Module - AI Recommendations (Week 8)

## Goal
Smart job recommendations with match scoring.

### 7.1 Match Score Algorithm
```
Score = (40% Skills) + (20% Experience) + (15% Location) + (15% Salary) + (10% Culture)

Skills Match:
  - Count overlapping skills between resume and job requirements
  - Weight by proficiency level
  - 0-100

Experience Match:
  - Years of experience vs job level requirements
  - Role similarity (job titles)
  - 0-100

Location Match:
  - If job is REMOTE: 100
  - If hybrid: 75 if user in same city, 50 if same state
  - If on-site: 100 if same city, 50 if same state, 0 otherwise

Salary Match:
  - If user salary range overlaps with job: 100
  - If within 20%: 75
  - If within 50%: 50
  - Otherwise: 0

Culture Match:
  - Based on industry preferences, company ratings
  - 0-100
```

### 7.2 Recommendation Entity & Service
```typescript
@Injectable()
export class MatchingService {
  async generateRecommendations(userId: string): Promise<Recommendation[]> {
    const user = await this.userRepository.findById(userId);
    const userProfile = await this.profileRepository.findByUserId(userId);
    const userResume = await this.resumeRepository.findDefault(userId);

    // Get active jobs matching user preferences
    const potentialJobs = await this.jobRepository.findMatching({
      industries: userProfile.desiredIndustries,
      jobLevels: userProfile.desiredJobLevels,
      remoteTypes: userProfile.desiredRemoteTypes,
      salaryRange: userProfile.salaryRange,
    });

    const recommendations = [];

    for (const job of potentialJobs) {
      const matchScore = await this.matchScoreCalculatorService.calculate(
        userResume,
        job,
        userProfile,
      );

      if (matchScore >= 50) {  // Only recommend if > 50% match
        const recommendation = Recommendation.create({
          userId,
          jobId: job.id,
          matchScore,
          explanation: this.generateExplanation(matchScore),
        });

        recommendations.push(recommendation);
      }
    }

    // Save to database
    for (const rec of recommendations) {
      await this.recommendationRepository.save(rec);
    }

    return recommendations;
  }

  async recordFeedback(
    recommendationId: string,
    action: 'applied' | 'saved' | 'skipped' | 'not_interested',
  ): Promise<void> {
    const rec = await this.recommendationRepository.findById(recommendationId);
    rec.recordUserAction(action);
    await this.recommendationRepository.save(rec);
  }
}
```

### 7.3 Nightly Batch Job
```typescript
// In schedule service
@Injectable()
export class RecommendationScheduleService {
  constructor(
    private matchingService: MatchingService,
    private userRepository: UserRepository,
  ) {}

  @Cron('0 2 * * *')  // Run at 2 AM daily
  async generateNightlyRecommendations() {
    const allUsers = await this.userRepository.findAll();
    
    for (const user of allUsers) {
      try {
        await this.matchingService.generateRecommendations(user.id);
      } catch (error) {
        console.error(`Failed to generate recommendations for ${user.id}`, error);
      }
    }
  }
}
```

### 7.4 API Endpoints
```
GET /recommendations (list for user)
GET /recommendations/:id
POST /recommendations/:id/feedback (applied/saved/skipped)
GET /recommendations/:id/explain (why matched)
GET /jobs/:jobId/match-score (for specific job)
```

## Checklist
- [ ] MatchScoreCalculatorService calculating scores
- [ ] Recommendation entity with match explanation
- [ ] Nightly batch job scheduled & working
- [ ] User action tracking (applied, saved, skipped)
- [ ] Endpoints returning recommendations with explanations
- [ ] Only recommending jobs > 50% match

---

# PHASE 8-12: Infrastructure & Deployment

## Phase 8: Notification Module
- Event listeners for all domain events
- Email templates
- In-app notifications
- User preferences (quiet hours, notification types)

## Phase 9: Payment Module
- Stripe integration
- Subscription management
- Premium feature gates

## Phase 10: Admin Module
- Dashboard queries
- User moderation
- Content moderation

## Phase 11: Advanced Features (Optional)
- Resume optimizer (AI suggestions)
- Interview prep (question bank)
- Salary intelligence
- Learning paths
- User analytics

## Phase 12: Testing & Deployment

### 12.1 Testing Strategy
```
Unit Tests: Services, repositories, value objects
- Each service: mocked dependencies
- Each repository: mocked Prisma
- Coverage target: 80%+

Integration Tests: Multi-module flows
- User creates profile → Gets recommendations
- User applies → Status updates → Email sent
- Resume upload → Parsing → Scoring

E2E Tests: Full user journeys
- Complete job application flow
- Complete job discovery to application

Command:
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:cov
```

### 12.2 Deployment Checklist
```
Pre-Deployment:
- [ ] All environment variables configured
- [ ] Database migrations tested
- [ ] Redis instance running
- [ ] Supabase project set up
- [ ] Stripe test account ready
- [ ] Email service configured
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code review completed
- [ ] Security scan passed

Deployment:
- [ ] Build succeeds: npm run build
- [ ] Run migrations: npx prisma migrate deploy
- [ ] Deploy to production (Docker, ECS, etc.)
- [ ] Set up CI/CD pipeline
- [ ] Configure monitoring (Sentry, DataDog)
- [ ] Configure alerts

Post-Deployment:
- [ ] All endpoints responding
- [ ] Database connected
- [ ] Auth flow working
- [ ] Error tracking operational
- [ ] Logs being collected
- [ ] Database backup configured
```

### 12.3 Production Deployment Example (Docker)
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://...
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

---

# IMPLEMENTATION BEST PRACTICES

## Per-Phase Workflow
1. **Read Documentation:** Reference your backend docs before each phase
2. **Create Entities:** Define domain models first
3. **Create DTOs:** Define API contracts
4. **Create Repositories:** Implement data access
5. **Create Services:** Implement business logic
6. **Create Controllers:** Expose endpoints
7. **Define Events:** Emit domain events where applicable
8. **Test:** Unit test services, integration test flows
9. **Move to Next Phase:** Don't wait for 100% perfection

## AI Assistant Prompting
When asking Copilot/Codex:

**DO:**
```
Reference: ./docs/BACKEND_PART1.md (User Module, lines 250-500)
Task: Create UserService.updateProfile() method

Requirements:
- Validate input with class-validator
- Return updated Profile entity
- Emit ProfileUpdatedEvent
- Handle errors gracefully
```

**DON'T:**
```
Create the entire User module for me
```

The more specific the reference and requirement, the better the output.

## Dependency Injection Pattern
```typescript
// Import module in parent
@Module({
  imports: [UserModule, JobModule],  // Job depends on User
  exports: [JobService],
})
export class JobModule {}

// Inject in service
@Injectable()
export class JobService {
  constructor(
    private userRepository: UserRepository,  // Injected
    private jobRepository: JobRepository,
  ) {}
}
```

## Error Handling Pattern
```typescript
try {
  const user = await this.userRepository.findById(userId);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  // business logic
} catch (error) {
  if (error instanceof NotFoundException) {
    throw error;  // Let global filter handle
  }
  throw new InternalServerErrorException(error.message);
}
```

## Testing Pattern
```typescript
describe('UserService', () => {
  let service: UserService;
  let mockUserRepository: Mock;

  beforeEach(() => {
    mockUserRepository = jest.mock(UserRepository);
    service = new UserService(mockUserRepository);
  });

  it('should create user successfully', async () => {
    // Arrange
    const dto = { email: 'test@test.com', supabaseId: 'sub_123' };
    
    // Act
    const result = await service.createUser(dto);
    
    // Assert
    expect(result.email).toBe('test@test.com');
    expect(mockUserRepository.save).toHaveBeenCalled();
  });
});
```

---

# COMMON PITFALLS & SOLUTIONS

| Pitfall | Solution |
|---------|----------|
| Mixing domain logic with API logic | Use services, not controllers, for business logic |
| Forgetting to emit domain events | Every aggregate mutation should emit event |
| Not validating DTOs | Use class-validator decorators on all DTOs |
| Tight coupling between modules | Use dependency injection & event bus |
| Skipping tests | Write unit tests as you go, not after |
| Inconsistent error handling | Use global exception filter consistently |
| N+1 database queries | Use repository queries thoughtfully, add .include() |
| Forgetting soft deletes | Add deletedAt field for audit trails |
| Not indexing Prisma queries | Index frequently-queried fields |
| Breaking existing endpoints | Use versioning or backward-compatible changes |

---

# PHASE COMPLETION CRITERIA

Each phase is complete when:
- [ ] All Prisma migrations run successfully
- [ ] All entities can be created & queried
- [ ] All repositories tested & working
- [ ] All services have business logic
- [ ] All controllers respond to requests
- [ ] Endpoints documented in Postman/Swagger
- [ ] Domain events defined & publishable
- [ ] No breaking changes to previous phases
- [ ] Code review passed
- [ ] Ready to move to next phase

---

# QUICK REFERENCE: Module Dependencies

```
Phase 1 (Foundation)
└─ Phase 2 (Shared Kernel)
   ├─ Phase 3 (User Module) ← CORE
   │  ├─ Phase 4 (Company)
   │  │  └─ Phase 5A (Job)
   │  │     ├─ Phase 5B-C (Resume)
   │  │     └─ Phase 6 (Application)
   │  │        └─ Phase 7 (Matching)
   │  └─ Phase 8 (Notifications)
   │
   ├─ Phase 9 (Payment)
   ├─ Phase 10 (Admin)
   ├─ Phase 11 (Advanced)
   └─ Phase 12 (Testing & Deploy)
```

Key insight: **Phase 3 (User) is the critical path.** Once it's solid, other modules follow quickly because they all reference users.

---

**Ready to start Phase 1?**

Next steps:
1. Reference this document in your AI prompts
2. Start with Phase 1 Foundation & Infrastructure
3. Increment through phases, testing each before moving forward
4. Use the provided code templates as starting points, not final solutions
5. Keep asking your AI assistant to follow the patterns defined here

Good luck building JobFits! 🚀

