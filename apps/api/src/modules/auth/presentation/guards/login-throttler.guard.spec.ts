import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { LoginThrottlerGuard } from './login-throttler.guard';

// Reaches the protected override the same way the library does: through the
// instance, after construction with a fake storage and the array options.
class TestableGuard extends LoginThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('LoginThrottlerGuard', () => {
  const increment = jest.fn();
  const storage = { increment } as unknown as ThrottlerStorage;
  let guard: TestableGuard;

  beforeEach(async () => {
    increment.mockReset();
    increment.mockResolvedValue({
      totalHits: 1,
      timeToExpire: 900,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    guard = new TestableGuard(
      [{ name: 'default', ttl: 900_000, limit: 10 }],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
  });

  it('keys an unresolved client IP on the shared fallback key', async () => {
    await expect(guard.tracker({})).resolves.toBe('unresolved');
  });

  it('keys an IPv6 client on its /64 prefix', async () => {
    await expect(guard.tracker({ ip: '2001:db8::5' })).resolves.toBe(
      '2001:db8:0:0::/64',
    );
  });

  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => function login() {},
      getClass: () => class AuthController {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
  }

  it('counts a request without req.ip instead of exempting or failing it', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
    );
  });

  it('counts every request without req.ip against one shared key', async () => {
    await guard.canActivate(contextFor({ headers: {} }));
    await guard.canActivate(contextFor({ headers: {} }));
    await guard.canActivate(contextFor({ headers: {}, ip: '198.51.100.7' }));

    const [first, second, withIp] = increment.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(second).toBe(first);
    expect(withIp).not.toBe(first);
  });
});
