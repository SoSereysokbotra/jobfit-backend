// src/shared/services/email-suppression.service.spec.ts
//
// The suppression list after it moved out of Redis (Redis audit R3/R8/R11).
//
// The store is faked with an in-memory map standing in for the `suppressed_emails`
// TABLE — not for a Redis key. That distinction is the finding: the old store could
// lose the list on a restart or an eviction and nothing would notice, and there is a
// test below that pins the difference.

import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  EmailSuppressedError,
  EmailSuppressionService,
  SuppressionCheckUnavailableError,
} from './email-suppression.service';

interface Row {
  email: string;
  reason: string | null;
  suppressedByAdminId: string | null;
  suppressedAt: Date;
}

/**
 * A stand-in for the `suppressed_emails` table. `rows` is exposed so a test can assert
 * on what was actually persisted, and swapped so a test can simulate the store dying.
 */
function fakePrisma() {
  const rows = new Map<string, Row>();
  let failWith: Error | undefined;

  const guard = () => {
    if (failWith) throw failWith;
  };

  return {
    rows,
    breakStore(err: Error) {
      failWith = err;
    },
    prisma: {
      suppressedEmail: {
        upsert: jest.fn(
          ({
            where,
            create,
          }: {
            where: { email: string };
            create: {
              email: string;
              reason?: string;
              suppressedByAdminId?: string;
            };
          }) => {
            guard();
            // update: {} — an existing row wins, so the first suppression's reason and
            // timestamp survive a second click.
            if (!rows.has(where.email)) {
              rows.set(where.email, {
                email: create.email,
                reason: create.reason ?? null,
                suppressedByAdminId: create.suppressedByAdminId ?? null,
                suppressedAt: new Date(),
              });
            }
            return Promise.resolve(rows.get(where.email));
          },
        ),
        findUnique: jest.fn(({ where }: { where: { email: string } }) => {
          guard();
          return Promise.resolve(rows.get(where.email) ?? null);
        }),
        findMany: jest.fn(
          ({ where }: { where: { email: { in: string[] } } }) => {
            guard();
            return Promise.resolve(
              where.email.in
                .filter((e) => rows.has(e))
                .map((e) => ({ email: e })),
            );
          },
        ),
        deleteMany: jest.fn(({ where }: { where: { email: string } }) => {
          guard();
          const existed = rows.delete(where.email);
          return Promise.resolve({ count: existed ? 1 : 0 });
        }),
      },
    } as unknown as PrismaService,
  };
}

describe('EmailSuppressionService', () => {
  let store: ReturnType<typeof fakePrisma>;
  let service: EmailSuppressionService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    store = fakePrisma();
    service = new EmailSuppressionService(store.prisma);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('normalisation', () => {
    it('treats case and surrounding whitespace as the same address', async () => {
      await service.suppress('  Bounced@Example.COM ');

      await expect(service.isSuppressed('bounced@example.com')).resolves.toBe(
        true,
      );
      await expect(service.isSuppressed('BOUNCED@EXAMPLE.COM')).resolves.toBe(
        true,
      );
      expect([...store.rows.keys()]).toEqual(['bounced@example.com']);
    });
  });

  describe('suppress', () => {
    it('records the reason and the admin who did it', async () => {
      await service.suppress('bad@example.com', 'hard bounce', 'admin-1');

      expect(store.rows.get('bad@example.com')).toMatchObject({
        email: 'bad@example.com',
        reason: 'hard bounce',
        suppressedByAdminId: 'admin-1',
      });
    });

    it('is idempotent and keeps the ORIGINAL reason on a repeat suppression', async () => {
      await service.suppress('bad@example.com', 'spam complaint', 'admin-1');
      await service.suppress('bad@example.com', 'hard bounce', 'admin-2');

      expect(store.rows.size).toBe(1);
      // The first reason is the compliance-relevant one — a complaint does not become a
      // bounce because someone clicked the button again.
      expect(store.rows.get('bad@example.com')).toMatchObject({
        reason: 'spam complaint',
        suppressedByAdminId: 'admin-1',
      });
    });

    it('throws when the write fails, so an admin is never told it worked when it did not', async () => {
      store.breakStore(new Error('connection terminated'));

      await expect(service.suppress('bad@example.com')).rejects.toThrow(
        'connection terminated',
      );
    });
  });

  describe('assertSendable — the gate the sender calls', () => {
    it('resolves for an address that is not on the list', async () => {
      await expect(
        service.assertSendable('fine@example.com'),
      ).resolves.toBeUndefined();
    });

    it('throws EmailSuppressedError for a suppressed address', async () => {
      await service.suppress('bad@example.com', 'hard bounce');

      await expect(service.assertSendable('BAD@example.com')).rejects.toThrow(
        EmailSuppressedError,
      );
    });

    it('fails CLOSED when the lookup itself fails', async () => {
      store.breakStore(new Error('connection terminated'));

      // The old Redis version answered `false` here, which is "safe to send" — the exact
      // confusion between "not suppressed" and "could not check" that R3/R6 were.
      await expect(service.assertSendable('who@example.com')).rejects.toThrow(
        SuppressionCheckUnavailableError,
      );
    });
  });

  describe('filterSuppressed', () => {
    it('answers a whole page in one query', async () => {
      await service.suppress('a@example.com');
      await service.suppress('c@example.com');

      const found = await service.filterSuppressed([
        'A@example.com',
        'b@example.com',
        'c@example.com',
      ]);

      expect(found).toEqual(new Set(['a@example.com', 'c@example.com']));
      expect(store.prisma.suppressedEmail.findMany).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates and does not query at all for an empty page', async () => {
      await service.filterSuppressed([]);
      expect(store.prisma.suppressedEmail.findMany).not.toHaveBeenCalled();

      await service.filterSuppressed(['x@example.com', 'X@EXAMPLE.COM']);
      expect(
        (store.prisma.suppressedEmail.findMany as jest.Mock).mock.calls[0][0],
      ).toEqual({
        where: { email: { in: ['x@example.com'] } },
        select: { email: true },
      });
    });
  });

  describe('durability (R8)', () => {
    it('survives a restart of the process that wrote it', async () => {
      await service.suppress('bad@example.com', 'hard bounce', 'admin-1');

      // Everything in the process is thrown away and rebuilt — a new service instance on
      // the same durable store, which is what a deploy or a crash-loop looks like. The
      // Redis version could not pass this: its store went away with the cache.
      const restarted = new EmailSuppressionService(store.prisma);

      await expect(restarted.isSuppressed('bad@example.com')).resolves.toBe(
        true,
      );
      await expect(
        restarted.assertSendable('bad@example.com'),
      ).rejects.toThrow(EmailSuppressedError);
    });

    it('has no expiry — a suppression made long ago is still a suppression', async () => {
      await service.suppress('bad@example.com', 'spam complaint');
      const row = store.rows.get('bad@example.com')!;
      // Backdate a year. There is no TTL column and no expiry filter in any query, so
      // age cannot change the answer.
      row.suppressedAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      await expect(service.isSuppressed('bad@example.com')).resolves.toBe(true);
    });
  });

  describe('unsuppress', () => {
    it('removes an address suppressed in error, and is safe on an absent one', async () => {
      await service.suppress('oops@example.com');
      await service.unsuppress('OOPS@example.com');

      await expect(service.isSuppressed('oops@example.com')).resolves.toBe(
        false,
      );
      await expect(
        service.unsuppress('never-there@example.com'),
      ).resolves.toBeUndefined();
    });
  });
});
