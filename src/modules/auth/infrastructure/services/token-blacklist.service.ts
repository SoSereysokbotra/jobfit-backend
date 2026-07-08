// src/modules/auth/infrastructure/services/token-blacklist.service.ts
//
// Tracks revoked JWTs by their `jti` claim in Redis under `blacklist:{jti}`.
// Fails OPEN: if Redis is unreachable, isBlacklisted() returns false and blacklist()
// silently no-ops, so a Redis outage never blocks a request.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../shared/services/redis.service';
import { ITokenBlacklistService } from '../../domain/services/itoken-blacklist.service.interface';

@Injectable()
export class TokenBlacklistService implements ITokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly keyFor = (jti: string) => `blacklist:${jti}`;

  constructor(private readonly redis: RedisService) {}

  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    try {
      const value = await this.redis.get(this.keyFor(jti));
      return value !== null;
    } catch (err) {
      this.logger.warn(
        `isBlacklisted failing open (Redis error): ${(err as Error).message}`,
      );
      return false;
    }
  }

  async blacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti) return;
    try {
      await this.redis.set(this.keyFor(jti), '1', ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `blacklist failing open (Redis error): ${(err as Error).message}`,
      );
    }
  }
}
