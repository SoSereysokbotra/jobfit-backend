// src/common/idempotency/idempotent.decorator.ts
//
// Marks a mutating route as participating in idempotency-key replay protection.
// Mirrors the @Public() / @Roles() pattern: a metadata marker read by a globally
// registered provider (here IdempotencyInterceptor) rather than per-route wiring.
//
// Opting a route IN does not make the header mandatory — a request without an
// `Idempotency-Key` header still runs normally. The marker only says "this route
// is safe and worth replaying", which is a decision about the handler, not the caller.

import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

export const Idempotent = (): CustomDecorator =>
  SetMetadata(IDEMPOTENT_KEY, true);
