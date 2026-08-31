// src/modules/admin/application/services/email-tracking.service.spec.ts
//
// The admin side of the suppression list after it moved to Postgres (Redis audit R3).
// Two things worth holding still here:
//   - the bounce page asks ONE question for the whole page, not one per row;
//   - suppressing writes the list BEFORE the audit row, and a failed write is not
//     reported as a success.

import { EmailEvent, EmailEventType } from '@prisma/client';
import { EmailSuppressionService } from '@shared/services/email-suppression.service';
import { EmailTrackingService } from './email-tracking.service';
import { EmailEventRepository } from '../../infrastructure/repositories/email-event.repository';
import { AuditLogService } from './audit-log.service';

function bounceRow(over: Partial<EmailEvent> & { id: string }): EmailEvent {
  return {
    notificationId: null,
    externalEventId: null,
    recipientEmail: 'someone@example.com',
    eventType: EmailEventType.BOUNCED_HARD,
    reason: 'mailbox unavailable',
    createdAt: new Date('2026-08-28T10:00:00Z'),
    ...over,
  } as EmailEvent;
}

describe('EmailTrackingService', () => {
  let findBounces: jest.Mock;
  let filterSuppressed: jest.Mock;
  let suppressOnList: jest.Mock;
  let record: jest.Mock;
  let service: EmailTrackingService;

  beforeEach(() => {
    findBounces = jest.fn().mockResolvedValue([]);
    filterSuppressed = jest.fn().mockResolvedValue(new Set<string>());
    suppressOnList = jest.fn().mockResolvedValue(undefined);
    record = jest.fn().mockResolvedValue(undefined);

    service = new EmailTrackingService(
      { findBounces } as unknown as EmailEventRepository,
      {
        filterSuppressed,
        suppress: suppressOnList,
      } as unknown as EmailSuppressionService,
      { record } as unknown as AuditLogService,
    );
  });

  describe('getBounces', () => {
    it('flags the suppressed rows and leaves the rest alone', async () => {
      findBounces.mockResolvedValue([
        bounceRow({ id: '1', recipientEmail: 'Bad@Example.com' }),
        bounceRow({ id: '2', recipientEmail: 'ok@example.com' }),
      ]);
      filterSuppressed.mockResolvedValue(new Set(['bad@example.com']));

      const page = await service.getBounces(0, 50);

      expect(page.map((b) => [b.id, b.suppressed])).toEqual([
        ['1', true],
        ['2', false],
      ]);
    });

    it('asks the suppression list once for the whole page, not once per row', async () => {
      findBounces.mockResolvedValue([
        bounceRow({ id: '1', recipientEmail: 'a@example.com' }),
        bounceRow({ id: '2', recipientEmail: 'b@example.com' }),
        bounceRow({ id: '3', recipientEmail: 'c@example.com' }),
      ]);

      await service.getBounces(0, 50);

      expect(filterSuppressed).toHaveBeenCalledTimes(1);
      expect(filterSuppressed).toHaveBeenCalledWith([
        'a@example.com',
        'b@example.com',
        'c@example.com',
      ]);
    });
  });

  describe('suppress', () => {
    it('writes the list first, then the audit row', async () => {
      const order: string[] = [];
      suppressOnList.mockImplementation(() => {
        order.push('list');
        return Promise.resolve();
      });
      record.mockImplementation(() => {
        order.push('audit');
        return Promise.resolve();
      });

      await service.suppress('admin-1', 'Bad@Example.com', 'hard bounce');

      expect(order).toEqual(['list', 'audit']);
      expect(suppressOnList).toHaveBeenCalledWith(
        'Bad@Example.com',
        'hard bounce',
        'admin-1',
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'bad@example.com' }),
      );
    });

    it('throws when the list write fails, and does not log an audit row for it (R11)', async () => {
      suppressOnList.mockRejectedValue(new Error('connection terminated'));

      await expect(
        service.suppress('admin-1', 'bad@example.com'),
      ).rejects.toThrow('connection terminated');
      // An audit row saying we suppressed an address we did not suppress is worse than
      // no audit row at all.
      expect(record).not.toHaveBeenCalled();
    });
  });
});
