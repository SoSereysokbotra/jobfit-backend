// src/common/guards/refresh-token.guard.ts
//
// Generic presence guard for a refresh token. It only checks that a refresh token
// was supplied (body, cookie, or Bearer header) and stashes it on request.refreshToken
// for a downstream handler to verify. It performs NO signature/expiry validation —
// that belongs to the Auth module — so it stays reusable and secret-free.

import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        const token =
            request.body?.refreshToken ??
            request.cookies?.refreshToken ??
            this.extractFromHeader(request);

        if (!token) {
            throw new UnauthorizedException('Refresh token is missing');
        }

        request.refreshToken = token;
        return true;
    }

    private extractFromHeader(request: any): string | undefined {
        const authHeader: string | undefined = request.headers?.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        return undefined;
    }
}
