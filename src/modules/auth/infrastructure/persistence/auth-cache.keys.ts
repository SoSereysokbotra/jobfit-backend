// src/modules/auth/infrastructure/persistence/auth-cache.keys.ts
//
// EXACT Redis key patterns + TTLs from AUTH-SPEC.md "Redis Cache Keys". Centralised so
// both repositories (and later the app layer) build identical keys.

export const CACHE_TTL = {
  /** cache:auth:user:entity:{userId} — full auth user entity */
  USER_ENTITY_SECONDS: 300,
  /** cache:auth:user:lookup:email:{email} — email -> userId */
  USER_EMAIL_LOOKUP_SECONDS: 300,
  /** cache:user:entity:{userId} — safe (public) user entity */
  SAFE_USER_ENTITY_SECONDS: 300,
  // Refresh-token caches use the token's own expiry as their TTL (computed per token).
} as const;

export const authCacheKeys = {
  authUserEntity: (userId: string) => `cache:auth:user:entity:${userId}`,
  authUserEmailLookup: (email: string) =>
    `cache:auth:user:lookup:email:${email}`,
  safeUserEntity: (userId: string) => `cache:user:entity:${userId}`,
  refreshEntity: (userId: string, tokenId: string) =>
    `cache:auth:refresh:user:${userId}:entity:${tokenId}`,
  refreshLookup: (userId: string, tokenHash: string) =>
    `cache:auth:refresh:user:${userId}:lookup:${tokenHash}`,
  /** Prefix covering every refresh cache key for a user (for prefix-scan invalidation). */
  refreshUserPrefix: (userId: string) => `cache:auth:refresh:user:${userId}:`,
} as const;
