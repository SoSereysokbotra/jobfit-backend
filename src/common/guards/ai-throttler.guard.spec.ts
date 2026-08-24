// The tracker IS the fix. MENTOR_REVIEW_2026-08-18 §11 asks what one ACCOUNT can cost;
// the stock guard keys on IP, which answers a different question. These pin the key.

import { AiThrottlerGuard } from './ai-throttler.guard';

/** getTracker is `protected`; tests drive it as the guard's own contract. */
function tracker(guard: AiThrottlerGuard, req: Record<string, unknown>): Promise<string> {
  return (
    guard as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }
  ).getTracker(req);
}

describe('AiThrottlerGuard.getTracker', () => {
  const guard = new AiThrottlerGuard(
    {} as never,
    {} as never,
    {} as never,
  );

  it('keys on the authenticated user, not the IP', async () => {
    await expect(
      tracker(guard, { user: { id: 'user-a' }, ip: '10.0.0.1' }),
    ).resolves.toBe('user:user-a');
  });

  it('gives the SAME user one budget across different IPs', async () => {
    const home = await tracker(guard, { user: { id: 'u1' }, ip: '10.0.0.1' });
    const cafe = await tracker(guard, { user: { id: 'u1' }, ip: '203.0.113.9' });
    expect(home).toBe(cafe);
  });

  it('gives DIFFERENT users separate budgets behind one shared IP', async () => {
    // The office-NAT case: without this, fifty colleagues throttle each other.
    const a = await tracker(guard, { user: { id: 'u1' }, ip: '10.0.0.1' });
    const b = await tracker(guard, { user: { id: 'u2' }, ip: '10.0.0.1' });
    expect(a).not.toBe(b);
  });

  it('falls back to the IP when there is no authenticated user', async () => {
    await expect(tracker(guard, { ip: '10.0.0.1' })).resolves.toBe('ip:10.0.0.1');
  });

  it('prefers the forwarded client IP behind a proxy', async () => {
    // Cloud Run terminates TLS upstream, so req.ip is the proxy, not the caller.
    await expect(
      tracker(guard, { ips: ['203.0.113.7', '10.0.0.1'], ip: '10.0.0.1' }),
    ).resolves.toBe('ip:203.0.113.7');
  });

  it('namespaces user and IP keys so they can never share a bucket', async () => {
    const asUser = await tracker(guard, { user: { id: '10.0.0.1' } });
    const asIp = await tracker(guard, { ip: '10.0.0.1' });
    expect(asUser).toBe('user:10.0.0.1');
    expect(asIp).toBe('ip:10.0.0.1');
    expect(asUser).not.toBe(asIp);
  });

  it('does not treat a non-string user id as a user', async () => {
    // A malformed token must degrade to IP limiting, never to "no key at all".
    await expect(
      tracker(guard, { user: { id: 12345 }, ip: '10.0.0.1' }),
    ).resolves.toBe('ip:10.0.0.1');
  });

  it('still returns a key when nothing identifies the caller', async () => {
    // Never undefined: an undefined tracker key would collapse every anonymous caller
    // into one bucket by accident rather than by decision.
    await expect(tracker(guard, {})).resolves.toBe('ip:unknown');
  });
});
