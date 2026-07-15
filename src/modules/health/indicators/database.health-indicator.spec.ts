import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '@infra/prisma/prisma.service';
import { DatabaseHealthIndicator } from './database.health-indicator';

// Minimal HealthIndicatorService stub mirroring the v11 up()/down() shape.
const makeHealthIndicatorService = () =>
  ({
    check: (key: string) => ({
      up: (data?: Record<string, unknown>) => ({
        [key]: { status: 'up', ...data },
      }),
      down: (data?: Record<string, unknown>) => ({
        [key]: { status: 'down', ...data },
      }),
    }),
  }) as unknown as HealthIndicatorService;

describe('DatabaseHealthIndicator', () => {
  it('reports up when the probe query succeeds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const indicator = new DatabaseHealthIndicator(
      prisma as unknown as PrismaService,
      makeHealthIndicatorService(),
    );

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('up');
    expect(result.database).toHaveProperty('latencyMs');
  });

  it('reports down (→ 503 readiness) when the probe query throws', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const indicator = new DatabaseHealthIndicator(
      prisma as unknown as PrismaService,
      makeHealthIndicatorService(),
    );

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('down');
    expect(result.database.message).toBe('connection refused');
  });
});
