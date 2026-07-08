// src/modules/auth/infrastructure/services/auth-token.service.ts
//
// Signs/verifies the dual JWTs from AUTH-SPEC.md:
//   • Access token  — short-lived, carries { sub, email, role, jti } (jti enables
//     blacklisting on logout). Signed with JWT_SECRET.
//   • Refresh token — long-lived, carries { sub, jti }. Signed with JWT_REFRESH_SECRET.
//     Its raw value is hashed (SHA-256) by RefreshTokenEntity before storage.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../../application/auth.constants';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
  exp?: number;
  iat?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  exp?: number;
  iat?: number;
}

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(user: { id: string; email: string; role: string }): {
    accessToken: string;
    jti: string;
  } {
    const jti = uuidv4();
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role, jti },
      { secret: this.accessSecret(), expiresIn: ACCESS_TOKEN_TTL },
    );
    return { accessToken, jti };
  }

  signRefreshToken(userId: string): {
    refreshToken: string;
    jti: string;
    expiresAt: Date;
  } {
    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(
      { sub: userId, jti },
      { secret: this.refreshSecret(), expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
    );
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    return { refreshToken, jti, expiresAt };
  }

  /** Verify a refresh token's signature/expiry; throws if invalid. */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.refreshSecret(),
    });
  }

  /** Decode (without verifying) an access token — used at logout to read jti + exp. */
  decodeAccessToken(token: string): AccessTokenPayload | null {
    return this.jwtService.decode<AccessTokenPayload | null>(token);
  }

  private accessSecret(): string {
    return this.configService.get<string>('JWT_SECRET') ?? '';
  }

  private refreshSecret(): string {
    // Fall back to JWT_SECRET if a dedicated refresh secret isn't configured.
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      ''
    );
  }
}
