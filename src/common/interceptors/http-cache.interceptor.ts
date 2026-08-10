// src/common/interceptors/http-cache.interceptor.ts
//
// ETag + Cache-Control + conditional-GET support for routes marked @HttpCache()
// (PWA offline mode, Phase 5). Gives a service worker standard HTTP semantics to build
// stale-while-revalidate / cache-first on, instead of reinventing invalidation client-side.
//
// APPLIED PER-ROUTE, NOT GLOBALLY, and that is load-bearing. TransformInterceptor wraps
// every response in { success, statusCode, timestamp, data } — and `timestamp` is
// new Date().toISOString(), which changes on EVERY request. Hashing the enveloped body
// would therefore produce a fresh ETag every time and never once match. Route-level
// interceptors run innermost, so this sees the handler's raw return value, before the
// envelope is applied.
//
// ETag derivation, in order of preference:
//   1. A single object carrying `updatedAt` -> weak validator from id + updatedAt. Cheap,
//      and it changes exactly when the record does.
//   2. Anything else (arrays, composed views) -> strong hash of the canonical JSON.
// Weak vs strong is not cosmetic: an updatedAt-derived tag does not promise byte equality,
// which is precisely what W/ means. Conditional GET uses the weak comparison function, so
// both kinds match correctly.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  HTTP_CACHE_KEY,
  HttpCacheOptions,
  cacheControlHeader,
} from '../decorators/http-cache.decorator';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<HttpCacheOptions>(
      HTTP_CACHE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Only safe methods are cacheable. A POST that happened to carry the marker must not
    // be short-circuited into a 304.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return next.handle();
    }

    const response = http.getResponse<Response>();

    return next.handle().pipe(
      switchMap((body) => {
        // Nothing to validate against, and no point caching an empty result.
        if (body === undefined || body === null) return of(body);

        const etag = buildEtag(body);
        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', cacheControlHeader(options));
        // Tell shared caches the response varies by credentials, so an authenticated
        // user's copy is never handed to an anonymous caller.
        response.setHeader('Vary', 'Authorization');

        if (isNoneMatch(request.headers['if-none-match'], etag)) {
          // 304 MUST NOT carry a body (RFC 9110 §15.4.5).
          //
          // Setting the status and emitting `undefined` is deliberate. The obvious
          // alternative — returning EMPTY so nothing is emitted — makes Nest produce a
          // 500: with no value the response is never sent and the request falls through.
          // Emitting instead lets the response complete normally, and Express drops the
          // body itself for 204/304 (res.send strips the payload and the Content-* headers
          // at that status), so the envelope added by the outer TransformInterceptor never
          // reaches the wire. Verified over real HTTP in this interceptor's spec.
          response.status(304);
          return of(undefined);
        }

        return of(body);
      }),
    );
  }
}

/** Weak validator from a record's identity + version. */
function buildEtag(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'updatedAt' in body
  ) {
    const record = body as { id?: unknown; updatedAt?: unknown };
    const version = toMillis(record.updatedAt);
    if (version !== undefined) {
      const seed = `${String(record.id ?? '')}:${version}`;
      return `W/"${createHash('sha1').update(seed).digest('hex').slice(0, 27)}"`;
    }
  }

  // Fallback: strong validator over the content itself. Used for arrays and for composed
  // views that have no single updatedAt to speak for them.
  return `"${createHash('sha256').update(canonicalise(body)).digest('base64url').slice(0, 27)}"`;
}

function toMillis(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * RFC 9110 §13.1.2 — If-None-Match is a comma-separated list, may be `*`, and for GET is
 * compared with the WEAK function, so `W/"x"` and `"x"` match. Clients and proxies both
 * rewrite these tags, so comparing raw strings would produce silent cache misses.
 */
function isNoneMatch(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw.trim() === '*') return true;

  const target = normaliseEtag(etag);
  return raw
    .split(',')
    .map((candidate) => normaliseEtag(candidate))
    .some((candidate) => candidate.length > 0 && candidate === target);
}

/** Strip the weak marker and surrounding quotes so the comparison is on the opaque value. */
function normaliseEtag(value: string): string {
  return value.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
}

/** Deterministic JSON — object keys sorted at every depth; array order preserved. */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
