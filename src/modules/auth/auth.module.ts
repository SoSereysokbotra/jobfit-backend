// src/modules/auth/auth.module.ts
//
// Wires the auth module: binds each domain port (DI token) to its implementation,
// registers the domain-event listener, the pure AuthDomainService, the AuthTokenService,
// and all CQRS command handlers. SharedModule supplies PrismaService/RedisService/JwtModule.
//
// NOTE: no controller yet — the presentation layer comes next. Handlers are dispatched
// via the CommandBus (CqrsModule) once the controller is added.

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SharedModule } from '../../shared/shared.module';
import { AuthController } from './presentation/controllers/auth.controller';

// Domain ports (injection tokens)
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository.interface';
import { TOKEN_BLACKLIST_SERVICE } from './domain/services/itoken-blacklist.service.interface';
import { ACCOUNT_LOCKOUT_SERVICE } from './domain/services/iaccount-lockout.service.interface';

// Domain service (pure)
import { AuthDomainService } from './domain/services/auth.domain.service';

// Infrastructure implementations
import { UserRepository } from './infrastructure/persistence/user.repository';
import { RefreshTokenRepository } from './infrastructure/persistence/refresh-token.repository';
import { TokenBlacklistService } from './infrastructure/services/token-blacklist.service';
import { AccountLockoutService } from './infrastructure/services/account-lockout.service';
import { AuthTokenService } from './infrastructure/services/auth-token.service';
import { AuthEventsListener } from './infrastructure/event-handlers/auth-events.listener';

// Command handlers (one per flow action)
import { RegisterHandler } from './application/commands/register.handler';
import { VerifyEmailHandler } from './application/commands/verify-email.handler';
import { ResendEmailVerificationHandler } from './application/commands/resend-email-verification.handler';
import { RequestPasswordResetHandler } from './application/commands/request-password-reset.handler';
import { VerifyPasswordResetHandler } from './application/commands/verify-password-reset.handler';
import { ResetPasswordHandler } from './application/commands/reset-password.handler';
import { ResendPasswordResetVerificationHandler } from './application/commands/resend-password-reset-verification.handler';
import { LoginHandler } from './application/commands/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout.handler';

const CommandHandlers = [
  RegisterHandler,
  VerifyEmailHandler,
  ResendEmailVerificationHandler,
  RequestPasswordResetHandler,
  VerifyPasswordResetHandler,
  ResetPasswordHandler,
  ResendPasswordResetVerificationHandler,
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
];

@Module({
  imports: [CqrsModule, SharedModule],
  controllers: [AuthController],
  providers: [
    // Concrete TokenBlacklistService is also provided directly (not just via its token)
    // because JwtAuthGuard injects the class; the token aliases the same instance.
    TokenBlacklistService,
    // domain port -> implementation bindings
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: RefreshTokenRepository },
    { provide: TOKEN_BLACKLIST_SERVICE, useExisting: TokenBlacklistService },
    { provide: ACCOUNT_LOCKOUT_SERVICE, useClass: AccountLockoutService },
    // services
    AuthDomainService,
    AuthTokenService,
    // @OnEvent handlers are picked up because this listener is a provider
    AuthEventsListener,
    // CQRS command handlers
    ...CommandHandlers,
  ],
  exports: [
    USER_REPOSITORY,
    REFRESH_TOKEN_REPOSITORY,
    TOKEN_BLACKLIST_SERVICE,
    ACCOUNT_LOCKOUT_SERVICE,
    AuthDomainService,
    AuthTokenService,
    // Exported so the global JwtAuthGuard (registered in AppModule) can inject it.
    TokenBlacklistService,
  ],
})
export class AuthModule {}
