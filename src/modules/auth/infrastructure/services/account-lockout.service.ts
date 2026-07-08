// src/modules/auth/infrastructure/services/account-lockout.service.ts
//
// Brute-force protection via Redis counters. Two independent dimensions:
//   - account (by email): 5 failures / 15-min window  -> 30-min lockout
//   - ip:                  20 failures / 15-min window -> 30-min lockout
//
// Keys:
//   lockout:account:attempts:{email}   (rolling counter, 15-min TTL)
//   lockout:account:blocked:{email}    (existence = locked, 30-min TTL)
//   lockout:ip:attempts:{ip}           (rolling counter, 15-min TTL)
//   lockout:ip:blocked:{ip}            (existence = locked, 30-min TTL)
//
// Fails OPEN: any Redis error is swallowed — recording is skipped and isLocked()
// returns false — so a Redis outage never blocks logins.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../shared/services/redis.service';
import { IAccountLockoutService } from '../../domain/services/iaccount-lockout.service.interface';

// Thresholds — exact values per the auth spec.
const ACCOUNT_MAX_ATTEMPTS = 5;
const IP_MAX_ATTEMPTS = 20;
const ATTEMPT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const LOCKOUT_SECONDS = 30 * 60; // 30 minutes

@Injectable()
export class AccountLockoutService implements IAccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private accountAttemptsKey = (email: string) =>
    `lockout:account:attempts:${email}`;
  private accountBlockedKey = (email: string) =>
    `lockout:account:blocked:${email}`;
  private ipAttemptsKey = (ip: string) => `lockout:ip:attempts:${ip}`;
  private ipBlockedKey = (ip: string) => `lockout:ip:blocked:${ip}`;

  async recordFailedAttempt(email: string, ip: string): Promise<void> {
    try {
      await this.bumpAndMaybeBlock(
        this.accountAttemptsKey(email),
        this.accountBlockedKey(email),
        ACCOUNT_MAX_ATTEMPTS,
      );
      await this.bumpAndMaybeBlock(
        this.ipAttemptsKey(ip),
        this.ipBlockedKey(ip),
        IP_MAX_ATTEMPTS,
      );
    } catch (err) {
      this.logger.warn(
        `recordFailedAttempt failing open (Redis error): ${(err as Error).message}`,
      );
    }
  }

  private async bumpAndMaybeBlock(
    attemptsKey: string,
    blockedKey: string,
    threshold: number,
  ): Promise<void> {
    const count = await this.redis.incr(attemptsKey);
    if (count === 1) {
      // First failure in a new window — start the window TTL.
      await this.redis.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
    }
    if (count >= threshold) {
      await this.redis.set(blockedKey, '1', LOCKOUT_SECONDS);
    }
  }

  async isLocked(email: string, ip: string): Promise<boolean> {
    try {
      const [accountLocked, ipLocked] = await Promise.all([
        this.redis.exists(this.accountBlockedKey(email)),
        this.redis.exists(this.ipBlockedKey(ip)),
      ]);
      return accountLocked || ipLocked;
    } catch (err) {
      this.logger.warn(
        `isLocked failing open (Redis error): ${(err as Error).message}`,
      );
      return false;
    }
  }

  async clearAttempts(email: string): Promise<void> {
    try {
      await this.redis.del(this.accountAttemptsKey(email));
      await this.redis.del(this.accountBlockedKey(email));
    } catch (err) {
      this.logger.warn(
        `clearAttempts failing open (Redis error): ${(err as Error).message}`,
      );
    }
  }
}
