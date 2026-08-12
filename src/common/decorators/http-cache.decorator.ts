// src/common/decorators/http-cache.decorator.ts
//
// Marks a GET route as cacheable and states how long for. Read by HttpCacheInterceptor.
// Follows the @Public() / @Idempotent() pattern: a metadata marker plus an interceptor,
// rather than caching logic copied into each handler.

import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const HTTP_CACHE_KEY = 'http-cache';

export interface HttpCacheOptions {
  /** Seconds a client may reuse the response without asking. */
  maxAge: number;
  /**
   * Seconds past maxAge a client may serve the stale copy while revalidating in the
   * background. This is the knob a service worker's stale-while-revalidate strategy reads.
   */
  staleWhileRevalidate?: number;
  /**
   * `public` = shared caches (CDN, proxy) may store it. `private` = browser only.
   * Default `public`; use `private` for anything scoped to one user.
   */
  scope?: 'public' | 'private';
}

export const HttpCache = (options: HttpCacheOptions): CustomDecorator =>
  SetMetadata(HTTP_CACHE_KEY, options);

/** Build the Cache-Control header value for a set of options. */
export function cacheControlHeader(options: HttpCacheOptions): string {
  const parts = [options.scope ?? 'public', `max-age=${options.maxAge}`];
  if (options.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }
  return parts.join(', ');
}
