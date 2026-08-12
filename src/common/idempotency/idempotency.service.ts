// src/common/idempotency/idempotency.service.ts
//
// Persistence + hashing behind idempotency-key replay protection. Kept separate from
// the interceptor so the storage rules are unit-testable without an ExecutionContext,
// and so the cleanup sweep can reuse deleteExpired() without pulling in HTTP plumbing.

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

/** Keys live for 24h — long enough to outlast an offline session, short enough to bound the table. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface StoredResponse {
  userId: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number;
  responseBody: Prisma.JsonValue | null;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * SHA-256 over a canonicalised body, so that two structurally identical payloads
   * hash the same regardless of key order. `{a:1,b:2}` and `{b:2,a:1}` are the same
   * request; a client that rebuilds its queue from IndexedDB has no ordering guarantee.
   */
  hashBody(body: unknown): string {
    return createHash('sha256').update(canonicalise(body)).digest('hex');
  }

  /** The stored record for a key, or null. Expired rows are treated as absent. */
  async find(key: string): Promise<StoredResponse | null> {
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!row) return null;

    // A row past its TTL is a replay of an action too old to still be in flight.
    // Treat it as absent and let the request proceed; the sweep will collect it.
    if (row.expiresAt.getTime() <= Date.now()) return null;

    return {
      userId: row.userId,
      endpoint: row.endpoint,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
    };
  }

  /**
   * Record a completed response.
   *
   * FAIL-OPEN: the handler has already run and its side effects are committed. If we
   * cannot write the receipt, the caller must still get their response — losing replay
   * protection is strictly better than failing a request that actually succeeded.
   */
  async store(key: string, response: StoredResponse): Promise<void> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          userId: response.userId,
          endpoint: response.endpoint,
          requestHash: response.requestHash,
          responseStatus: response.responseStatus,
          responseBody:
            response.responseBody === null || response.responseBody === undefined
              ? Prisma.JsonNull
              : (response.responseBody as Prisma.InputJsonValue),
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
    } catch (err) {
      // P2002 = another concurrent request with the same key won the race and already
      // wrote the receipt. See the concurrency note in idempotency.interceptor.ts.
      this.logger.warn(
        `Could not record idempotency key (fail-open): ${(err as Error).message}`,
      );
    }
  }

  /** Delete every expired key. Returns how many rows went. Driven by the cleanup sweep. */
  async deleteExpired(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (count > 0) this.logger.log(`Idempotency sweep removed ${count} expired key(s)`);
    return count;
  }
}

/**
 * Deterministic JSON: object keys sorted at every depth. Arrays keep their order —
 * element order is meaningful in a request body, key order is not.
 */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null';
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
