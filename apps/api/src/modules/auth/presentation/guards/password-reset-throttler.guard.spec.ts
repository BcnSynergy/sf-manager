import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { PasswordResetRateLimitConfig } from '../../infrastructure/config/password-reset-rate-limit.config';
import { PasswordResetEmailThrottlerGuard } from './password-reset-email-throttler.guard';
import { PasswordResetThrottlerGuard } from './password-reset-throttler.guard';

const LIMITS: PasswordResetRateLimitConfig = {
  maxAttempts: 7,
  windowMs: 45_000,
  emailMaxRequests: 2,
  emailWindowMs: 90_000,
};

type Internals = {
  handleRequest(props: ThrottlerRequest): Promise<boolean>;
  getTracker(req: Record<string, unknown>): Promise<string>;
  shouldSkip(context: ExecutionContext): Promise<boolean>;
};

function contextWithBody(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
      getResponse: () => ({}),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('password reset throttler guards', () => {
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

  it('limits per normalized email with its own request count and window', async () => {
    const guard = new PasswordResetEmailThrottlerGuard(
      { throttlers: [] },
      {} as ThrottlerStorage,
      new Reflector(),
      LIMITS,
    ) as unknown as Internals;

    await guard.handleRequest(props);

    expect(parent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, ttl: 90_000, blockDuration: 90_000 }),
    );
    await expect(
      guard.getTracker({ body: { email: '  Some@Example.COM ' } }),
    ).resolves.toBe('password-reset-email:some@example.com');
  });

  it('skips the email limit when the body has no valid email (validation answers 400)', async () => {
    const guard = new PasswordResetEmailThrottlerGuard(
      { throttlers: [] },
      {} as ThrottlerStorage,
      new Reflector(),
      LIMITS,
    ) as unknown as Internals;

    await expect(guard.shouldSkip(contextWithBody({ email: 5 }))).resolves.toBe(
      true,
    );
    await expect(guard.shouldSkip(contextWithBody(undefined))).resolves.toBe(
      true,
    );
    await expect(
      guard.shouldSkip(contextWithBody({ email: 'a@example.com' })),
    ).resolves.toBe(false);
  });
});
