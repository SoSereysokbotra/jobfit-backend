// src/common/guards/optional-jwt-auth.guard.ts
//
// Same verification pipeline as JwtAuthGuard, but NON-fatal: it always allows the
// request through. If a valid, non-revoked token is present it attaches
// { id, email, role } to request.user; otherwise request.user is left undefined.
// Nothing here ever throws — use it for endpoints that behave differently for
// authenticated vs. anonymous callers.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TokenBlacklistService } from '../../modules/auth/infrastructure/services/token-blacklist.service';
import {
    AuthenticatedUser,
    JwtPayload,
    extractBearerToken,
} from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly tokenBlacklistService: TokenBlacklistService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<Request & { user?: AuthenticatedUser }>();
        request.user = undefined;

        const token = extractBearerToken(request);
        if (!token) {
            return true; // anonymous
        }

        try {
            const payload = this.jwtService.verify<JwtPayload>(token);

            if (payload.jti) {
                // isBlacklisted already fails open (returns false on Redis error).
                const revoked = await this.tokenBlacklistService.isBlacklisted(
                    payload.jti,
                );
                if (revoked) {
                    return true; // treat revoked token as anonymous, never throw
                }
            }

            request.user = {
                id: payload.sub,
                email: payload.email,
                role: payload.role,
            };
        } catch {
            // Invalid/expired token -> fall through as anonymous.
        }

        return true;
    }
}
