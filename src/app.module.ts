import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

// Config
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import supabaseConfig from './config/supabase.config';
import redisConfig from './config/redis.config';
import aiConfig from './config/ai.config';
import { validateEnv } from './config/env.validation';
import { authThrottlers } from './config/throttler.config';
import { buildLoggerParams, LogFormat } from './config/logger.config';

// Infra
import { PrismaModule } from './infra/prisma/prisma.module';
import { StorageModule } from '@infra/storage/storage.module';
import { AiModule } from './infra/ai/ai.module';

// Events
import { EventBusModule } from './events/event-bus.module';

// Shared services (Prisma/Jwt/Email/Redis/Logger) — needed app-wide (e.g. by the
// global JwtAuthGuard, which injects the @nestjs/jwt JwtService).
import { SharedModule } from './shared/shared.module';

// Common guards (applied globally). Self-managed JWT auth — @Public() bypasses.
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Global catch-all exception filter (DI-provided so it can inject PinoLogger).
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';

// Shared kernel
import { SkillModule } from './shared-kernel/skills/skill.module';
import { IndustryModule } from './shared-kernel/industries/industry.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CompanyModule } from './modules/company/company.module';
import { SalaryModule } from './modules/salary/salary.module';
import { JobModule } from './modules/job/job.module';
import { ResumeModule } from './modules/resume/resume.module';
import { ApplicationModule } from './modules/application/application.module';
import { OfferModule } from './modules/offer/offer.module';
import { SavedJobModule } from './modules/saved-job/saved-job.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { MatchingModule } from './modules/matching/matching.module';
import { LocationModule } from './modules/location/location.module';
import { GenerationModule } from './modules/generation/generation.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminModule } from './modules/admin/admin.module';
import { EmployerModule } from './modules/employer/employer.module';
import { EmployerRequestModule } from './modules/employer-request/employer-request.module';
import { LearningModule } from './modules/learning/learning.module';
import { JobTrackerModule } from './modules/job-tracker/job-tracker.module';
import { MatchReportModule } from './modules/match-report/match-report.module';
import { SyncModule } from './modules/sync/sync.module';
import { ResumeBuilderModule } from './modules/resume-builder/resume-builder.module';

// Observability (Phase 3) — health probes + Prometheus metrics.
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';

// Alerting (Phase 4) — system_events + Slack, used by the global exception filter.
import { AlertingModule } from './modules/alerting/alerting.module';

@Module({
  imports: [
    // ── Config (global) ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, supabaseConfig, redisConfig, aiConfig],
      validate: validateEnv,
    }),

    // ── Structured logging (Phase 0) — pino as the app-wide logger ────────────
    // GCP-structured JSON in prod, pretty in dev; correlation id (requestId) on
    // every line via AsyncLocalStorage. Global module — Logger/PinoLogger inject
    // anywhere.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerParams(
          config.get<string>('app.nodeEnv', 'development'),
          config.get<string>('app.logLevel', 'info'),
          config.get<LogFormat>('app.logFormat', 'json'),
        ),
    }),

    // ── Rate limiting (named limiters opted into per-route via @RateLimit) ─────
    ThrottlerModule.forRoot(authThrottlers),

    // ── Infrastructure ───────────────────────────────────────────────────────
    PrismaModule,
    StorageModule,
    EventBusModule,
    SharedModule,
    AiModule,
    IdempotencyModule,

    // ── Shared Kernel ────────────────────────────────────────────────────────
    SkillModule,
    IndustryModule,

    // ── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    UserModule,
    CompanyModule,
    SalaryModule,
    JobModule,
    ResumeModule,
    ResumeBuilderModule,
    ApplicationModule,
    OfferModule,
    SavedJobModule,
    IngestionModule,
    LocationModule,
    MatchingModule,
    GenerationModule,
    NotificationModule,
    PaymentModule,
    AdminModule,
    EmployerModule,
    EmployerRequestModule,
    LearningModule,
    JobTrackerModule,
    MatchReportModule,

    // ── PWA offline mode (Phase 2) — delta sync + bootstrap ──────────────────
    SyncModule,

    // ── Observability (Phase 3) ──────────────────────────────────────────────
    HealthModule,
    MetricsModule,

    // ── Alerting (Phase 4) ───────────────────────────────────────────────────
    AlertingModule,
  ],
  providers: [
    // Apply JwtAuthGuard globally — secure by default; use @Public() to open a route.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Apply RolesGuard globally — use @Roles() to restrict by role.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Catch-all exception filter (structured logging + redaction, Phase 1).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Idempotency-key replay protection. Global, but inert unless a route is marked
    // @Idempotent() AND the caller sends an Idempotency-Key header (PWA offline, Phase 1).
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
