import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

// Config
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import supabaseConfig from './config/supabase.config';
import redisConfig from './config/redis.config';
import { validateEnv } from './config/env.validation';

// Infra
import { PrismaModule } from './infra/prisma/prisma.module';

// Events
import { EventBusModule } from './events/event-bus.module';

// Common guards (applied globally)
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Infra services
import { SupabaseAuthService } from './infra/supabase/supabase-auth.service';
import { SupabaseClientService } from './infra/supabase/supabase.client';
import { StorageService } from './infra/storage/storage.service';
import { MailerService } from './infra/mailer/mailer.service';
import { SearchService } from './infra/search/search.service';

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

@Module({
  imports: [
    // ── Config (global) ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, supabaseConfig, redisConfig],
      validate: validateEnv,
    }),

    // ── Infrastructure ───────────────────────────────────────────────────────
    PrismaModule,
    EventBusModule,

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
  ],
  providers: [
    // Infra services available app-wide
    SupabaseClientService,
    SupabaseAuthService,
    StorageService,
    MailerService,
    SearchService,

    // Apply SupabaseAuthGuard globally — use @Public() to bypass on specific routes
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    // Apply RolesGuard globally — use @Roles() to restrict
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
