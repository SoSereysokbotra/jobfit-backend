// src/modules/admin/admin.module.ts
//
// Admin backend module (Admin MVP — 3 core features + auth + audit logging):
//   1. System Health Monitoring & Alerting
//   2. User Management
//   3. Email Delivery Tracking
//
// Reuse:
//   - CqrsModule  -> CommandBus, to dispatch auth's Login/Logout/RequestPasswordReset.
//   - AuthModule  -> ACCOUNT_LOCKOUT_SERVICE (unlock), TokenBlacklistService (JwtAuthGuard).
//   - SharedModule -> RedisService (email suppression) + JwtService (JwtAuthGuard).
// PrismaService is available globally (PrismaModule is @Global).

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SharedModule } from '@shared/shared.module';
import { AuthModule } from '@modules/auth/auth.module';

// Controllers
import { AdminAuthController } from './presentation/controllers/admin-auth.controller';
import { AdminSystemController } from './presentation/controllers/admin-system.controller';
import { AdminUserController } from './presentation/controllers/admin-user.controller';
import { AdminEmailController } from './presentation/controllers/admin-email.controller';
import { AdminAuditController } from './presentation/controllers/admin-audit.controller';

// Application services
import { AdminAuthService } from './application/services/admin-auth.service';
import { AdminUserService } from './application/services/admin-user.service';
import { SystemHealthService } from './application/services/system-health.service';
import { EmailTrackingService } from './application/services/email-tracking.service';
import { AuditLogService } from './application/services/audit-log.service';

// Infrastructure repositories
import { AdminUserRepository } from './infrastructure/repositories/admin-user.repository';
import { SystemEventRepository } from './infrastructure/repositories/system-event.repository';
import { EmailEventRepository } from './infrastructure/repositories/email-event.repository';
import { AuditLogRepository } from './infrastructure/repositories/audit-log.repository';

@Module({
  imports: [CqrsModule, SharedModule, AuthModule],
  controllers: [
    AdminAuthController,
    AdminSystemController,
    AdminUserController,
    AdminEmailController,
    AdminAuditController,
  ],
  providers: [
    // services
    AdminAuthService,
    AdminUserService,
    SystemHealthService,
    EmailTrackingService,
    AuditLogService,
    // repositories
    AdminUserRepository,
    SystemEventRepository,
    EmailEventRepository,
    AuditLogRepository,
  ],
})
export class AdminModule {}
