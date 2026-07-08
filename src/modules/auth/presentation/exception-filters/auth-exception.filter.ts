// src/modules/auth/presentation/exception-filters/auth-exception.filter.ts
//
// Maps domain AuthErrors -> HTTP responses. Applied to AuthController via @UseFilters.
//
// Security note: RefreshTokenReuseDetectedError is returned to the client as an ordinary
// 401 INVALID_REFRESH_TOKEN (an attacker learns nothing extra), but logged server-side
// at error/"security alert" level so it surfaces in ops/monitoring instead of being
// buried in routine 401 noise.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AuthError,
  CodeExpiredError,
  EmailAlreadyRegisteredError,
  EmailAlreadyVerifiedError,
  EmailNotVerifiedError,
  InvalidCodeError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  LoginBlockedError,
  RefreshTokenReuseDetectedError,
  UserNotFoundError,
  WeakPasswordError,
} from '../../application/errors/auth.errors';

@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AuthSecurity');

  catch(exception: AuthError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.statusFor(exception);

    // Client-facing shape. Reuse is masked as a plain invalid-token response.
    let clientCode = exception.code;
    let clientMessage = exception.message;
    const extra: Record<string, unknown> = {};

    if (exception instanceof RefreshTokenReuseDetectedError) {
      // Indistinguishable from a normal invalid refresh token to the caller.
      clientCode = new InvalidRefreshTokenError().code;
      clientMessage = new InvalidRefreshTokenError().message;
      // Distinct, high-visibility server-side log (NOT routine 401 noise).
      this.logger.error(
        `SECURITY ALERT — refresh token reuse detected (possible token theft) ` +
          `[${request.method} ${request.originalUrl}] ip=${request.ip}. All sessions revoked.`,
      );
    } else {
      // Routine auth failure — low-noise log.
      this.logger.warn(
        `${exception.code} (${status}) [${request.method} ${request.originalUrl}]`,
      );
    }

    if (exception instanceof WeakPasswordError) {
      extra.violations = exception.violations;
    }

    response.status(status).json({
      statusCode: status,
      code: clientCode,
      message: clientMessage,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }

  private statusFor(exception: AuthError): number {
    // 401 — auth failures (never leak which factor was wrong; UserNotFound is 401 too).
    if (
      exception instanceof InvalidCredentialsError ||
      exception instanceof InvalidCodeError ||
      exception instanceof InvalidRefreshTokenError ||
      exception instanceof RefreshTokenReuseDetectedError ||
      exception instanceof UserNotFoundError
    ) {
      return HttpStatus.UNAUTHORIZED; // 401
    }
    if (exception instanceof LoginBlockedError) {
      return HttpStatus.TOO_MANY_REQUESTS; // 429
    }
    if (exception instanceof EmailNotVerifiedError) {
      return HttpStatus.FORBIDDEN; // 403
    }
    if (
      exception instanceof EmailAlreadyRegisteredError ||
      exception instanceof EmailAlreadyVerifiedError
    ) {
      return HttpStatus.CONFLICT; // 409
    }
    if (
      exception instanceof CodeExpiredError ||
      exception instanceof WeakPasswordError
    ) {
      return HttpStatus.BAD_REQUEST; // 400
    }
    return HttpStatus.BAD_REQUEST; // safe default for any unmapped AuthError
  }
}
