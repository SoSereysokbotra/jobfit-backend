import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsGuard } from './metrics.guard';

const ctxWith = (headers: Record<string, string>, query: Record<string, string> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, query }) }),
  }) as unknown as ExecutionContext;

const guardWith = (token?: string) =>
  new MetricsGuard({ get: () => token } as unknown as ConfigService);

describe('MetricsGuard', () => {
  it('is open when no METRICS_TOKEN is configured (dev)', () => {
    expect(guardWith(undefined).canActivate(ctxWith({}))).toBe(true);
  });

  it('accepts a matching Bearer token', () => {
    const guard = guardWith('s3cret');
    expect(
      guard.canActivate(ctxWith({ authorization: 'Bearer s3cret' })),
    ).toBe(true);
  });

  it('accepts a matching ?token= query param', () => {
    const guard = guardWith('s3cret');
    expect(guard.canActivate(ctxWith({}, { token: 's3cret' }))).toBe(true);
  });

  it('rejects a wrong / missing token', () => {
    const guard = guardWith('s3cret');
    expect(() => guard.canActivate(ctxWith({ authorization: 'Bearer nope' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(ctxWith({}))).toThrow(UnauthorizedException);
  });
});
