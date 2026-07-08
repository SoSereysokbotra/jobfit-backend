// src/common/guards/jwt-auth.guard.ts
//
// Self-contained JWT auth guard (no Passport strategy). It:
//   1. extracts the Bearer token (falls back to an `accessToken` cookie),
//   2. verifies the signature/expiry via @nestjs/jwt,
//   3. checks the token's `jti` against the blacklist — FAILING OPEN if Redis is down,
//   4. attaches { id, email, role } to request.user.
//
// It depends on JwtService (provided by SharedModule's JwtModule) and
// TokenBlacklistService (provided/exported by AuthModule), so those must be available
// in whatever module applies this guard.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../../modules/auth/infrastructure/services/token-blacklist.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Routes marked @Public() bypass authentication entirely.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is missing');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Revocation check — fail OPEN so a Redis outage never blocks valid tokens.
    if (payload.jti) {
      try {
        const revoked = await this.tokenBlacklistService.isBlacklisted(
          payload.jti,
        );
        if (revoked) {
          throw new UnauthorizedException('Token has been revoked');
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        this.logger.warn(
          `Blacklist check failed — allowing request (fail-open): ${(err as Error).message}`,
        );
      }
    }

    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    (request as Request & { user?: AuthenticatedUser }).user = user;
    return true;
  }
}

// Shared JWT payload contract (the Auth module signs tokens with these claims).
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  jti?: string;
  [key: string]: unknown;
}

export function extractBearerToken(request: Request): string | undefined {
  const authHeader = request.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Fallback: httpOnly cookie set by the auth flow.
  const cookies = (request as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.accessToken;
}
