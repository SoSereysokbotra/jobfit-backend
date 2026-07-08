// src/modules/auth/domain/services/itoken-blacklist.service.interface.ts
//
// Domain port for JWT revocation. The infra TokenBlacklistService (Redis) implements
// it. Declared here so the application layer depends on the abstraction, never on Redis.
// NOTE: this is a *port* — AuthDomainService itself stays pure and does NOT use it.

export interface ITokenBlacklistService {
  isBlacklisted(jti: string): Promise<boolean>;
  blacklist(jti: string, ttlSeconds: number): Promise<void>;
}

export const TOKEN_BLACKLIST_SERVICE = Symbol('ITokenBlacklistService');
