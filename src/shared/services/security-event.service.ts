// src/shared/services/security-event.service.ts
//
// Records authentication and account-security facts: who signed in, who failed, whose
// account an admin turned off.
//
// SEPARATE FROM AuditLogService, which records admin actions for accountability. These two
// answer different questions at very different volumes — see the SecurityEvent model
// comment for why the tables are siblings rather than one widened table.

import { Injectable, Logger } from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface NewSecurityEvent {
  eventType: SecurityEventType;
  /** Always recorded, even when no account matched — that is the interesting case. */
  email: string;
  /** Absent for an attempt against an address with no account. */
  userId?: string | null;
  ipAddress?: string | null;
  /** For the human reading this later. Never parsed, never shown to the subject. */
  detail?: string | null;
}

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write one event.
   *
   * FAILS OPEN, and this is deliberate: every call site is on a path the user is trying to
   * complete — signing in, changing a password, being suspended. A logging problem must
   * never be the reason a login fails or an admin action half-applies. The failure is
   * logged loudly instead, because a silently empty security table is worse than a noisy
   * one.
   */
  async record(event: NewSecurityEvent): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          eventType: event.eventType,
          email: event.email.trim().toLowerCase(),
          userId: event.userId ?? null,
          ipAddress: event.ipAddress || null,
          detail: event.detail ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record ${event.eventType} for ${event.email}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * The recent history for one account — for an admin investigating "was this taken over".
   *
   * Reads by email rather than userId so it also surfaces the attempts that never matched
   * an account, which is exactly the pattern worth seeing before a successful login.
   */
  recentForEmail(email: string, take = 50) {
    return this.prisma.securityEvent.findMany({
      where: { email: email.trim().toLowerCase() },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
