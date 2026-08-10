// src/common/idempotency/idempotency.interceptor.ts
//
// Replay protection for mutating routes marked @Idempotent(). A client that queues an
// action while offline replays it on reconnect; without this, a retried "submit
// application" creates a second application.
//
// An INTERCEPTOR, not a guard, for one reason: a guard can only answer yes/no before the
// handler runs. Idempotency needs both halves — short-circuit with the stored response
// BEFORE the handler, and capture the response AFTER it. Only an interceptor wraps both
// sides of next.handle(). (Precedent: TransformInterceptor already shapes responses this way.)
//
// Ordering note: this interceptor stores whatever value it observes and replays it at the
// same point in the chain, so it stays self-consistent whether it sits inside or outside
// TransformInterceptor's envelope — a replay short-circuits before the inner interceptors
// run, so the value is never double-wrapped.
//
// KNOWN LIMITATION — concurrent duplicates. The receipt is written after the handler
// completes, per the Phase 1 spec. Two requests carrying the same key that arrive close
// enough to overlap will therefore both execute; the second write loses the unique-key
// race and is dropped (fail-open in IdempotencyService.store). This covers sequential
// retries — the offline-queue case — but not simultaneous ones. Closing that needs a
// reserve-then-fill row (insert an in-flight receipt before the handler), which changes
// the schema and is deliberately left to a follow-up.

import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { concatMap } from 'rxjs/operators';

import { AuthenticatedUser } from '../guards/jwt-auth.guard';
import { IDEMPOTENT_KEY } from './idempotent.decorator';
import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isIdempotent) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();

    if (!MUTATING_METHODS.has(request.method)) return next.handle();

    const key = headerValue(request, IDEMPOTENCY_HEADER);
    // Opt-in per request: no header means the caller is not asking for replay
    // protection, so behave exactly as before.
    if (!key) return next.handle();

    // Keys are scoped to a user. An unauthenticated request has nothing to scope to.
    const user = request.user;
    if (!user) return next.handle();

    const endpoint = endpointOf(request);
    const requestHash = this.idempotency.hashBody(request.body);

    const existing = await this.idempotency.find(key);
    if (existing) {
      // Same key, different anything = the client reused a key it should not have.
      // Refuse rather than serve a response that belongs to a different action.
      if (
        existing.userId !== user.id ||
        existing.endpoint !== endpoint ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(
          'Idempotency-Key has already been used with a different request',
        );
      }

      // Genuine replay: return the original response without running the handler.
      const response = http.getResponse<Response>();
      response.status(existing.responseStatus);
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      concatMap(async (body) => {
        // Await the receipt before releasing the response: if we answered first and the
        // write then failed, a replay would re-execute the handler. store() is fail-open,
        // so this can delay the response but never fail it.
        await this.idempotency.store(key, {
          userId: user.id,
          endpoint,
          requestHash,
          responseStatus: http.getResponse<Response>().statusCode,
          responseBody: (body ?? null) as never,
        });
        return body;
      }),
    );
  }
}

/** "POST /api/v1/saved-jobs" — method + path, query string excluded. */
function endpointOf(request: Request): string {
  const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
  return `${request.method} ${path}`;
}

function headerValue(request: Request, name: string): string | undefined {
  const raw = request.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
