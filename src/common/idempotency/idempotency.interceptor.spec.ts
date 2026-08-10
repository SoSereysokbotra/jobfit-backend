// Behavioural tests for idempotency-key replay protection.
//
// These wire the REAL IdempotencyService to an in-memory stand-in for the
// idempotency_keys table, so hashing, storage and replay are exercised end to end
// rather than mocked away. The CallHandler doubles as the spy for "did the underlying
// side effect run?" — it is the seam the real handler sits behind.

import { ConflictException, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';

import type { PrismaService } from '@infra/prisma/prisma.service';
import { IdempotencyService, IDEMPOTENCY_TTL_MS } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

interface Row {
  key: string;
  userId: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
}

/** In-memory stand-in for the idempotency_keys table, honouring the unique key. */
function fakePrisma() {
  const rows = new Map<string, Row>();

  const prisma = {
    idempotencyKey: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        rows.get(where.key) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Row }) => {
        if (rows.has(data.key)) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        rows.set(data.key, data);
        return data;
      }),
      deleteMany: jest.fn(
        async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
          let count = 0;
          for (const [k, v] of rows) {
            if (v.expiresAt.getTime() < where.expiresAt.lt.getTime()) {
              rows.delete(k);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  } as unknown as PrismaService;

  return { prisma, rows };
}

function build(opts: { idempotentRoute?: boolean } = {}) {
  const { prisma, rows } = fakePrisma();
  const service = new IdempotencyService(prisma);

  const reflector = {
    getAllAndOverride: jest.fn(() => opts.idempotentRoute ?? true),
  } as unknown as Reflector;

  const interceptor = new IdempotencyInterceptor(service, reflector);
  return { interceptor, service, rows };
}

/** One HTTP call: a context plus the handler spy standing in for the side effect. */
function call(params: {
  key?: string;
  body: unknown;
  userId?: string;
  method?: string;
  url?: string;
  status?: number;
  result: unknown;
}) {
  const response = {
    statusCode: params.status ?? 201,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };

  const request = {
    method: params.method ?? 'POST',
    originalUrl: params.url ?? '/api/v1/saved-jobs',
    headers: params.key ? { 'idempotency-key': params.key } : {},
    body: params.body,
    user: { id: params.userId ?? 'user-1', email: 'a@b.c', role: 'JOB_SEEKER' },
  };

  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  // The spy: if this runs twice, the side effect happened twice.
  const handle = jest.fn(() => of(params.result));
  const next = { handle } as unknown as CallHandler;

  return { context, next, handle, response };
}

describe('IdempotencyInterceptor', () => {
  it('replays the stored response on a retry without re-running the handler', async () => {
    const { interceptor } = build();
    const body = { jobId: 'job-1' };
    const result = { jobIds: ['job-1'] };

    const first = call({ key: 'key-1', body, result });
    const firstBody = await firstValueFrom(
      await interceptor.intercept(first.context, first.next),
    );

    const second = call({ key: 'key-1', body, result });
    const secondBody = await firstValueFrom(
      await interceptor.intercept(second.context, second.next),
    );

    // The side effect ran exactly once, across both requests.
    expect(first.handle).toHaveBeenCalledTimes(1);
    expect(second.handle).not.toHaveBeenCalled();

    // And the caller could not tell the difference.
    expect(secondBody).toEqual(firstBody);
    expect(secondBody).toEqual(result);
  });

  it('restores the original status code on a replay', async () => {
    const { interceptor } = build();
    const body = { jobId: 'job-1' };

    const first = call({ key: 'key-1', body, status: 201, result: { ok: true } });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    // A fresh request defaults to 200; the replay must put it back to the stored 201.
    const second = call({ key: 'key-1', body, status: 200, result: { ok: true } });
    await firstValueFrom(await interceptor.intercept(second.context, second.next));

    expect(second.response.statusCode).toBe(201);
  });

  it('rejects the same key used with a different body (409)', async () => {
    const { interceptor } = build();

    const first = call({ key: 'key-1', body: { jobId: 'job-1' }, result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    const second = call({ key: 'key-1', body: { jobId: 'job-2' }, result: {} });

    await expect(
      interceptor.intercept(second.context, second.next),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(second.handle).not.toHaveBeenCalled();
  });

  it('rejects the same key reused against a different endpoint (409)', async () => {
    const { interceptor } = build();
    const body = { jobId: 'job-1' };

    const first = call({ key: 'key-1', body, url: '/api/v1/saved-jobs', result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    const second = call({ key: 'key-1', body, url: '/api/v1/applications', result: {} });

    await expect(
      interceptor.intercept(second.context, second.next),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a key belonging to another user (409)', async () => {
    const { interceptor } = build();
    const body = { jobId: 'job-1' };

    const first = call({ key: 'key-1', body, userId: 'user-1', result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    const second = call({ key: 'key-1', body, userId: 'user-2', result: {} });

    await expect(
      interceptor.intercept(second.context, second.next),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats key order in the body as irrelevant — that is the same request', async () => {
    const { interceptor } = build();

    const first = call({ key: 'key-1', body: { a: 1, b: 2 }, result: { ok: true } });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    const second = call({ key: 'key-1', body: { b: 2, a: 1 }, result: { ok: true } });
    const replayed = await firstValueFrom(
      await interceptor.intercept(second.context, second.next),
    );

    expect(second.handle).not.toHaveBeenCalled();
    expect(replayed).toEqual({ ok: true });
  });

  it('runs normally when no Idempotency-Key header is sent', async () => {
    const { interceptor, rows } = build();

    const first = call({ body: { jobId: 'job-1' }, result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));
    const second = call({ body: { jobId: 'job-1' }, result: {} });
    await firstValueFrom(await interceptor.intercept(second.context, second.next));

    // Opt-in: without the header both requests execute and nothing is recorded.
    expect(first.handle).toHaveBeenCalledTimes(1);
    expect(second.handle).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(0);
  });

  it('ignores routes not marked @Idempotent even when a key is sent', async () => {
    const { interceptor, rows } = build({ idempotentRoute: false });

    const first = call({ key: 'key-1', body: {}, result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));
    const second = call({ key: 'key-1', body: {}, result: {} });
    await firstValueFrom(await interceptor.intercept(second.context, second.next));

    expect(first.handle).toHaveBeenCalledTimes(1);
    expect(second.handle).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(0);
  });

  it('re-executes once the stored key has expired rather than serving a stale reply', async () => {
    const { interceptor, rows } = build();
    const body = { jobId: 'job-1' };

    const first = call({ key: 'key-1', body, result: {} });
    await firstValueFrom(await interceptor.intercept(first.context, first.next));

    // Age the receipt past its TTL.
    const row = rows.get('key-1')!;
    row.expiresAt = new Date(Date.now() - 1);

    const second = call({ key: 'key-1', body, result: {} });
    await firstValueFrom(await interceptor.intercept(second.context, second.next));

    expect(second.handle).toHaveBeenCalledTimes(1);
  });

  it('does not record a receipt when the handler throws', async () => {
    const { interceptor, rows } = build();
    const { context } = call({ key: 'key-1', body: {}, result: {} });
    const next = {
      handle: () => ({
        pipe: () => ({
          subscribe: (o: { error: (e: Error) => void }) => o.error(new Error('boom')),
        }),
      }),
    } as unknown as CallHandler;

    await expect(
      firstValueFrom(await interceptor.intercept(context, next)),
    ).rejects.toThrow('boom');
    expect(rows.size).toBe(0);
  });
});

describe('IdempotencyService', () => {
  it('hashes structurally identical bodies the same and different ones differently', () => {
    const { service } = build();

    expect(service.hashBody({ a: 1, b: [1, 2] })).toBe(
      service.hashBody({ b: [1, 2], a: 1 }),
    );
    // Array order IS meaningful.
    expect(service.hashBody({ b: [1, 2] })).not.toBe(service.hashBody({ b: [2, 1] }));
    expect(service.hashBody({ a: 1 })).not.toBe(service.hashBody({ a: 2 }));
  });

  it('deletes only expired rows in the cleanup sweep', async () => {
    const { service, rows } = build();

    rows.set('fresh', {
      key: 'fresh',
      userId: 'u',
      endpoint: 'POST /x',
      requestHash: 'h',
      responseStatus: 200,
      responseBody: null,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    });
    rows.set('stale', {
      key: 'stale',
      userId: 'u',
      endpoint: 'POST /x',
      requestHash: 'h',
      responseStatus: 200,
      responseBody: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await service.deleteExpired()).toBe(1);
    expect(rows.has('fresh')).toBe(true);
    expect(rows.has('stale')).toBe(false);
  });

  it('fails open when the receipt cannot be written', async () => {
    const { service, rows } = build();
    const stored = {
      userId: 'u',
      endpoint: 'POST /x',
      requestHash: 'h',
      responseStatus: 200,
      responseBody: null,
    };

    await service.store('dup', stored);
    // A concurrent writer already claimed the key — this must not throw.
    await expect(service.store('dup', stored)).resolves.toBeUndefined();
    expect(rows.size).toBe(1);
  });
});
