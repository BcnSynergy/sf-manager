import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { PasswordResetRateLimitConfig } from '../../infrastructure/config/password-reset-rate-limit.config';
import { PasswordResetThrottlerGuard } from './password-reset-throttler.guard';

const LIMITS: PasswordResetRateLimitConfig = {
  maxAttempts: 7,
  windowMs: 45_000,
};

type Internals = {
  handleRequest(props: ThrottlerRequest): Promise<boolean>;
  getTracker(req: Record<string, unknown>): Promise<string>;
};

describe('password reset throttler guard', () => {
  let parent: jest.SpyInstance;
  const props = {
    limit: 1000,
    ttl: 900_000,
    blockDuration: 900_000,
  } as unknown as ThrottlerRequest;

  beforeEach(() => {
    parent = jest
      .spyOn(
        ThrottlerGuard.prototype as unknown as {
          handleRequest: () => Promise<boolean>;
        },
        'handleRequest',
      )
      .mockResolvedValue(true);
  });

  afterEach(() => parent.mockRestore());

  it('limits per client key with the configured attempts and window, blocking for one window', async () => {
    const guard = new PasswordResetThrottlerGuard(
      { throttlers: [] },
      {} as ThrottlerStorage,
      new Reflector(),
      LIMITS,
    ) as unknown as Internals;

    await guard.handleRequest(props);

    expect(parent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 7, ttl: 45_000, blockDuration: 45_000 }),
    );
    await expect(guard.getTracker({ ip: '203.0.113.9' })).resolves.toBe(
      '203.0.113.9',
    );
  });
});
