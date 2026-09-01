// src/shared/services/email-suppression.service.ts
//
// The list of addresses we must never send to again — hard bounces and spam complaints.
//
// WHY THIS SERVICE EXISTS. The list used to be a Redis key (`email:suppressed:{email}`)
// owned privately by EmailTrackingService, and the Redis audit found three faults in it
// that were all the same fault:
//
//   R3  It was WRITTEN BUT NEVER READ on the send path. `isSuppressed()` was private to
//       the admin service and used only to draw a flag beside a bounce. EmailService,
//       the actual sender, had never heard of it. Suppressing an address changed the
//       admin screen and nothing else.
//   R8  No TTL, and worse, no durability. Redis here is a cache: a restart or an
//       eviction dropped the entire list silently and we resumed mailing addresses that
//       had complained.
//   R11 `suppress()` was the one Redis write with no try/catch, so it 500'd when Redis
//       was down while every neighbouring path failed open.
//
// So the store is Postgres (`suppressed_emails`) and there is exactly ONE service that
// answers "is this address suppressed?" — the sender and the admin view being two
// separate answers to that question is how they got out of step in the first place.
//
// FAILURE MODE ON THE SEND PATH: FAIL CLOSED. `assertSendable()` throws when the lookup
// itself fails, rather than assuming the address is fine. Repeatedly mailing an address
// that filed a spam complaint is what gets a sending domain blocked, and that takes
// weeks to undo with a mailbox provider — whereas an unsent verification code is one
// retry. This is cheap to hold because the store is the app's own primary database: if
// it is unreachable, the caller that produced this mail (writing a verification code to
// a user row) has already failed. It is not the Redis situation, where the dependency
// could be down while everything else worked.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Thrown when the suppression list cannot be consulted, so the send must not proceed. */
export class SuppressionCheckUnavailableError extends Error {
  constructor(cause: string) {
    super(`Suppression list unavailable, refusing to send: ${cause}`);
    this.name = 'SuppressionCheckUnavailableError';
  }
}

/** The address is on the suppression list. Not an error — the send is deliberately skipped. */
export class EmailSuppressedError extends Error {
  constructor(public readonly email: string) {
    super(`${email} is on the email suppression list`);
    this.name = 'EmailSuppressedError';
  }
}

/** Lower-case + trim. The primary key is the normalised address, so this is the boundary. */
export function normaliseEmail(email: string): string {
  return email.toLowerCase().trim();
}

@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add an address to the list. Idempotent — suppressing twice keeps the FIRST record,
   * because the original reason and timestamp are the compliance-relevant ones.
   *
   * Throws on failure: an admin who clicks "suppress" and sees success must be able to
   * believe it.
   */
  async suppress(
    email: string,
    reason?: string,
    suppressedByAdminId?: string,
  ): Promise<void> {
    const address = normaliseEmail(email);
    await this.prisma.suppressedEmail.upsert({
      where: { email: address },
      create: { email: address, reason, suppressedByAdminId },
      update: {},
    });
    this.logger.log(`Suppressed ${address}${reason ? ` (${reason})` : ''}`);
  }

  /** Remove an address — for the case where a suppression was made in error. */
  async unsuppress(email: string): Promise<void> {
    const address = normaliseEmail(email);
    await this.prisma.suppressedEmail.deleteMany({ where: { email: address } });
    this.logger.log(`Un-suppressed ${address}`);
  }

  /**
   * Is this address suppressed? Propagates the underlying error rather than answering
   * `false` — callers on the send path must not read "I could not check" as "safe to
   * send". That confusion is exactly what R3/R6 were.
   */
  async isSuppressed(email: string): Promise<boolean> {
    const row = await this.prisma.suppressedEmail.findUnique({
      where: { email: normaliseEmail(email) },
      select: { email: true },
    });
    return row !== null;
  }

  /**
   * Gate for the send path. Returns normally when the mail may go out; throws
   * `EmailSuppressedError` when it must not, and `SuppressionCheckUnavailableError` when
   * we could not find out (fail closed — see the header).
   */
  async assertSendable(email: string): Promise<void> {
    let suppressed: boolean;
    try {
      suppressed = await this.isSuppressed(email);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Suppression lookup failed for ${normaliseEmail(email)} (failing closed): ${message}`,
      );
      throw new SuppressionCheckUnavailableError(message);
    }
    if (suppressed) {
      throw new EmailSuppressedError(normaliseEmail(email));
    }
  }

  /**
   * Which of these addresses are suppressed, as a set of NORMALISED addresses.
   *
   * One query for the whole batch: the admin bounce list asked per row, which was a
   * query per row on every page load.
   */
  async filterSuppressed(emails: string[]): Promise<Set<string>> {
    const addresses = [...new Set(emails.map(normaliseEmail))];
    if (addresses.length === 0) return new Set();
    const rows = await this.prisma.suppressedEmail.findMany({
      where: { email: { in: addresses } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  }
}
