import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface SupabaseJwtPayload {
  sub: string;          // Supabase user UUID
  email: string;
  role: string;         // Postgres/Supabase role, not our app role
  app_metadata: {
    role?: string;      // Our custom claim: 'job_seeker' | 'employer' | 'admin'
    companyId?: string; // Set for employer users
    [key: string]: unknown;
  };
  aud: string;
  iat: number;
  exp: number;
}

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly jwtSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.configService.getOrThrow<string>('supabase.jwtSecret');
  }

  /**
   * Verifies a Supabase-issued JWT token locally (no round-trip to Supabase).
   * Throws UnauthorizedException if the token is invalid or expired.
   */
  verifyToken(token: string): SupabaseJwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as SupabaseJwtPayload;
    } catch (err) {
      this.logger.warn(`Invalid JWT token: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
