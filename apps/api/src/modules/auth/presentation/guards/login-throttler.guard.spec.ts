import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import type { LoginFailureLimiter } from '../../application/ports/login-failure-limiter.port';
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
  const getBlock = jest.fn();
  const recordFailure = jest.fn();
  const reset = jest.fn();
  const limiter: LoginFailureLimiter = { getBlock, recordFailure, reset };
  let guard: TestableGuard;

  beforeEach(async () => {
    increment.mockReset();
    getBlock.mockReset();
    recordFailure.mockReset();
    reset.mockReset();
    getBlock.mockResolvedValue({ blocked: false });
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
      limiter,
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

  describe('when the client key is blocked', () => {
    const CLIENT_BLOCK_SECONDS = 100;

    beforeEach(() => {
      increment.mockResolvedValue({
        totalHits: 11,
        timeToExpire: 900,
        isBlocked: true,
        timeToBlockExpire: CLIENT_BLOCK_SECONDS,
      });
    });

    // Rejects with the library's 429 and returns every Retry-After value the
    // guard wrote, in order; the last one is what the client receives.
    async function rejectWith(
      body: unknown,
    ): Promise<{ retryAfter: unknown[]; error: unknown }> {
      const header = jest.fn();
      const context = {
        getHandler: () => function login() {},
        getClass: () => class AuthController {},
        switchToHttp: () => ({
          getRequest: () => ({ headers: {}, ip: '198.51.100.7', body }),
          getResponse: () => ({ header }),
        }),
      } as unknown as ExecutionContext;

      let error: unknown;
      try {
        await guard.canActivate(context);
      } catch (e) {
        error = e;
      }
      const retryAfter = header.mock.calls
        .filter(([name]: [string]) => name === 'Retry-After')
        .map(([, value]: [string, unknown]) => value);
      return { retryAfter, error };
    }

    it('raises Retry-After to the email block when it is larger', async () => {
      getBlock.mockResolvedValue({ blocked: true, retryAfterSeconds: 800 });

      const { retryAfter, error } = await rejectWith({
        email: '  Admin@Example.COM ',
        password: 'x',
      });

      expect(error).toBeInstanceOf(ThrottlerException);
      expect(getBlock).toHaveBeenCalledWith('admin@example.com');
      expect(retryAfter.at(-1)).toBe(800);
    });

    it('keeps the client key Retry-After when the email block is shorter', async () => {
      getBlock.mockResolvedValue({ blocked: true, retryAfterSeconds: 50 });

      const { retryAfter, error } = await rejectWith({
        email: 'admin@example.com',
        password: 'x',
      });

      expect(error).toBeInstanceOf(ThrottlerException);
      expect(getBlock).toHaveBeenCalledTimes(1);
      expect(retryAfter).toEqual([CLIENT_BLOCK_SECONDS]);
    });

    it('keeps the client key Retry-After when the email is not blocked', async () => {
      const { retryAfter, error } = await rejectWith({
        email: 'admin@example.com',
        password: 'x',
      });

      expect(error).toBeInstanceOf(ThrottlerException);
      expect(getBlock).toHaveBeenCalledTimes(1);
      expect(retryAfter).toEqual([CLIENT_BLOCK_SECONDS]);
    });

    it.each([
      ['missing', { password: 'x' }],
      ['non-string', { email: 42, password: 'x' }],
      ['invalid', { email: 'not-an-email', password: 'x' }],
      ['absent body', undefined],
    ])(
      'does not read the email block when the body email is %s',
      async (_label, body) => {
        getBlock.mockResolvedValue({ blocked: true, retryAfterSeconds: 800 });

        const { retryAfter, error } = await rejectWith(body);

        expect(error).toBeInstanceOf(ThrottlerException);
        expect(getBlock).not.toHaveBeenCalled();
        expect(retryAfter).toEqual([CLIENT_BLOCK_SECONDS]);
      },
    );

    it('fails closed when the email block cannot be read', async () => {
      getBlock.mockRejectedValue(new Error('db down'));

      const { error } = await rejectWith({
        email: 'admin@example.com',
        password: 'x',
      });

      expect(error).toEqual(new Error('db down'));
      expect(error).not.toBeInstanceOf(ThrottlerException);
    });

    it('writes no email failure on the rejected path', async () => {
      getBlock.mockResolvedValue({ blocked: true, retryAfterSeconds: 800 });

      await rejectWith({ email: 'admin@example.com', password: 'x' });

      expect(recordFailure).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
    });
  });

  it('does not read the email block when the client key is not blocked', async () => {
    await guard.canActivate(
      contextFor({
        headers: {},
        body: { email: 'admin@example.com', password: 'x' },
      }),
    );

    expect(getBlock).not.toHaveBeenCalled();
  });
});
