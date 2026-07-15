import { SystemEventSeverity, SystemEventType } from '@prisma/client';
import type { PrismaService } from '@infra/prisma/prisma.service';
import type { RedisService } from '@shared/services/redis.service';
import type { SlackNotifierService } from '@modules/notification/slack-notifier.service';
import { AlertingService } from './alerting.service';

function build() {
  const create = jest.fn().mockResolvedValue({});
  const prisma = { systemEvent: { create } } as unknown as PrismaService;

  const redis = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false), // first occurrence by default
    set: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;

  const send = jest.fn().mockResolvedValue(true);
  const slack = { send } as unknown as SlackNotifierService;

  const service = new AlertingService(prisma, redis, slack);
  return { service, create, redis, send };
}

/** Push the boot time past the startup grace window so Slack is allowed. */
function pastGrace(service: AlertingService) {
  (service as unknown as { bootTime: number }).bootTime = Date.now() - 61_000;
}

describe('AlertingService', () => {
  it('records a DB error as a CRITICAL DATABASE_ERROR system_event', async () => {
    const { service, create } = build();
    pastGrace(service);

    await service.onServerError({
      error: new Error('database is unreachable'),
      statusCode: 500,
      method: 'GET',
      path: '/api/v1/x',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      eventType: SystemEventType.DATABASE_ERROR,
      severity: SystemEventSeverity.CRITICAL,
    });
  });

  it('suppresses Slack during the startup grace window but still writes the ledger row', async () => {
    const { service, create, send } = build(); // fresh boot -> within grace

    await service.onServerError({
      error: new Error('database down'),
      statusCode: 500,
      method: 'GET',
      path: '/api/v1/x',
    });

    expect(create).toHaveBeenCalledTimes(1); // ledger written
    expect(send).not.toHaveBeenCalled(); // Slack muted
  });

  it('sends a Slack alert after the grace window', async () => {
    const { service, send } = build();
    pastGrace(service);

    await service.onServerError({
      error: new Error('database down'),
      statusCode: 500,
      method: 'GET',
      path: '/api/v1/x',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ severity: 'critical' });
  });

  it('dedups repeats within the window (no second ledger row / Slack)', async () => {
    const { service, create, redis, send } = build();
    pastGrace(service);
    (redis.exists as jest.Mock).mockResolvedValue(true); // already alerted this window

    await service.onServerError({
      error: new Error('database down'),
      statusCode: 500,
      method: 'GET',
      path: '/api/v1/x',
    });

    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not classify a generic 5xx as a DB error, but trips ERROR_RATE_HIGH at threshold', async () => {
    const { service, create, redis } = build();
    pastGrace(service);
    (redis.incr as jest.Mock).mockResolvedValue(10); // window count hits threshold

    await service.onServerError({
      error: new Error('null pointer somewhere'),
      statusCode: 500,
      method: 'GET',
      path: '/api/v1/y',
    });

    // No DATABASE_ERROR (not a DB error); one ERROR_RATE_HIGH from the rate tracker.
    const eventTypes = create.mock.calls.map((c) => c[0].data.eventType);
    expect(eventTypes).toContain(SystemEventType.ERROR_RATE_HIGH);
    expect(eventTypes).not.toContain(SystemEventType.DATABASE_ERROR);
  });
});
