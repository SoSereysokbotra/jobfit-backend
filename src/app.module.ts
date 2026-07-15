import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

// Config
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import supabaseConfig from './config/supabase.config';
import redisConfig from './config/redis.config';
import { validateEnv } from './config/env.validation';
import { authThrottlers } from './config/throttler.config';
import { buildLoggerParams, LogFormat } from './config/logger.config';

// Infra
import { PrismaModule } from './infra/prisma/prisma.module';

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

// Shared kernel
import { SkillModule } from './shared-kernel/skills/skill.module';
import { IndustryModule } from './shared-kernel/industries/industry.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CompanyModule } from './modules/company/company.module';
import { JobModule } from './modules/job/job.module';
import { ResumeModule } from './modules/resume/resume.module';
import { ApplicationModule } from './modules/application/application.module';
import { MatchingModule } from './modules/matching/matching.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminModule } from './modules/admin/admin.module';
import { EmployerModule } from './modules/employer/employer.module';
import { LearningModule } from './modules/learning/learning.module';

@Module({
  imports: [
    // ── Config (global) ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, supabaseConfig, redisConfig],
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
    EventBusModule,
    SharedModule,

    // ── Shared Kernel ────────────────────────────────────────────────────────
    SkillModule,
    IndustryModule,

    // ── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    UserModule,
    CompanyModule,
    JobModule,
    ResumeModule,
    ApplicationModule,
    MatchingModule,
    NotificationModule,
    PaymentModule,
    AdminModule,
    EmployerModule,
    LearningModule,
  ],
  providers: [
    // Apply JwtAuthGuard globally — secure by default; use @Public() to open a route.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Apply RolesGuard globally — use @Roles() to restrict by role.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Catch-all exception filter (structured logging + redaction, Phase 1).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
