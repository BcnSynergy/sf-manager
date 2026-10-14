import type { LoginEmailRateLimitConfig } from '../../../infrastructure/config/login-rate-limit.config';
import { InMemoryLoginFailureLimiter } from './in-memory-login-failure-limiter';

describe('InMemoryLoginFailureLimiter', () => {
  const config: LoginEmailRateLimitConfig = {
    maxFailures: 3,
    windowMs: 60_000,
  };
  const EMAIL = 'user@example.com';

  let limiter: InMemoryLoginFailureLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    limiter = new InMemoryLoginFailureLimiter(config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const failTimes = async (email: string, times: number) => {
    for (let i = 0; i < times; i++) {
      await limiter.recordFailure(email);
    }
  };

  it('does not block an email with no recorded failures', async () => {
    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
  });

  it('does not block below the limit', async () => {
    await failTimes(EMAIL, config.maxFailures - 1);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
  });

  it('blocks when the failure that reaches the limit is recorded', async () => {
    await failTimes(EMAIL, config.maxFailures);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({
      blocked: true,
      retryAfterSeconds: 60,
    });
  });

  it('reports the remaining block time rounded up to whole seconds', async () => {
    await failTimes(EMAIL, config.maxFailures);

    jest.advanceTimersByTime(10_500);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({
      blocked: true,
      retryAfterSeconds: 50,
    });
  });

  it('does not count failures recorded while blocked or extend the block', async () => {
    await failTimes(EMAIL, config.maxFailures);
    jest.advanceTimersByTime(30_000);

    await failTimes(EMAIL, 5);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({
      blocked: true,
      retryAfterSeconds: 30,
    });
  });

  it('unblocks when the block elapses and starts a fresh window', async () => {
    await failTimes(EMAIL, config.maxFailures);
    jest.advanceTimersByTime(60_000);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });

    await failTimes(EMAIL, config.maxFailures - 1);
    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
    await limiter.recordFailure(EMAIL);
    await expect(limiter.getBlock(EMAIL)).resolves.toMatchObject({
      blocked: true,
    });
  });

  it('restarts the count at 1 after the window elapses without a block', async () => {
    await failTimes(EMAIL, config.maxFailures - 1);
    jest.advanceTimersByTime(60_000);

    // The two old failures no longer count: a fresh window needs the full
    // limit again before it blocks.
    await failTimes(EMAIL, config.maxFailures - 1);
    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
    await limiter.recordFailure(EMAIL);
    await expect(limiter.getBlock(EMAIL)).resolves.toMatchObject({
      blocked: true,
    });
  });

  it('anchors the window on the first failure (fixed window)', async () => {
    await limiter.recordFailure(EMAIL);
    jest.advanceTimersByTime(40_000);
    await limiter.recordFailure(EMAIL);
    jest.advanceTimersByTime(40_000); // 80 s since the first failure: window over

    await limiter.recordFailure(EMAIL);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
  });

  it('reset clears a block', async () => {
    await failTimes(EMAIL, config.maxFailures);

    await limiter.reset(EMAIL);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
  });

  it('reset clears a partial count', async () => {
    await failTimes(EMAIL, config.maxFailures - 1);

    await limiter.reset(EMAIL);
    await failTimes(EMAIL, config.maxFailures - 1);

    await expect(limiter.getBlock(EMAIL)).resolves.toEqual({ blocked: false });
  });

  it('reset resolves for an email with no counter', async () => {
    await expect(limiter.reset('missing@example.com')).resolves.toBeUndefined();
  });

  it('isolates distinct emails', async () => {
    await failTimes(EMAIL, config.maxFailures);

    await expect(limiter.getBlock('other@example.com')).resolves.toEqual({
      blocked: false,
    });
    await limiter.reset('other@example.com');
    await expect(limiter.getBlock(EMAIL)).resolves.toMatchObject({
      blocked: true,
    });
  });

  it('blocks on the first failure when the limit is 1', async () => {
    const strict = new InMemoryLoginFailureLimiter({
      maxFailures: 1,
      windowMs: 30_000,
    });

    await strict.recordFailure(EMAIL);

    await expect(strict.getBlock(EMAIL)).resolves.toEqual({
      blocked: true,
      retryAfterSeconds: 30,
    });
  });
});
