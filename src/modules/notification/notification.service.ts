// src/modules/notification/notification.service.ts
//
// In-app notifications: write one, read your feed, mark them seen.
//
// This service had two methods with empty bodies and no table behind them, so the three
// listener stubs that called it had nothing to call. Everything here is now real except
// email, which is called out below.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export type NotificationType = $Enums.NotificationType;

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to whatever this is about. Omit when there is nowhere useful to go. */
  link?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a notification.
   *
   * PASS `tx` WHENEVER THE CAUSE IS TRANSACTIONAL — every caller in this codebase does.
   * A notification written outside the transaction that caused it can survive a rollback,
   * which tells the user that something happened when it did not. That is the specific
   * failure an @OnEvent listener could not avoid here: `emitAsync` fires while the
   * transaction is still open.
   *
   * Notifying is never the point of the operation, so a failure to write one must not take
   * the operation down with it — EXCEPT when it shares the caller's transaction, where
   * swallowing the error would poison the transaction. Hence the `tx` branch rethrows.
   */
  async create(
    notification: NewNotification,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    if (tx) {
      await client.notification.create({ data: notification });
      return;
    }
    try {
      await client.notification.create({ data: notification });
    } catch (err) {
      this.logger.error(
        `Could not write notification for ${notification.userId}: ${(err as Error).message}`,
      );
    }
  }

  /** This user's feed, newest first. */
  async list(userId: string, take = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /**
   * Mark one read. Scoped to the owner in the WHERE clause rather than fetched and then
   * checked, so another user's id cannot be marked read even for an instant.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      // Either it is not theirs, it does not exist, or it was already read. Already-read
      // is not an error — only tell them nothing matched when nothing could have.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }

  /**
   * TODO: no email transport is configured. Left as a stub DELIBERATELY and loudly — an
   * in-app notification that silently pretends to have emailed is worse than one that
   * says it did not. See the alerting module for the Slack transport that does exist.
   */
  async sendEmail(to: string, subject: string, _body: string): Promise<void> {
    this.logger.warn(`Email not sent (no transport configured): "${subject}" -> ${to}`);
  }
}
