import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';

// TD-5 S7: the refresh limit comes from REFRESH_RATE_LIMIT_CONFIG (read once
// at boot, so an invalid value stops startup), not from the module-wide
// throttler that carries login's limit.
describe('RefreshThrottlerGuard', () => {
  it('applies the configured refresh limit and window, blocking for one window', async () => {
    const guard = new RefreshThrottlerGuard(
      { throttlers: [] },
      {} as ThrottlerStorage,
      new Reflector(),
      { maxAttempts: 7, windowMs: 45_000 },
    );
    const parent = jest
      .spyOn(
        ThrottlerGuard.prototype as unknown as {
          handleRequest: () => Promise<boolean>;
        },
        'handleRequest',
      )
      .mockResolvedValue(true);
    const props = {
      limit: 1000,
      ttl: 900_000,
      blockDuration: 900_000,
    } as unknown as ThrottlerRequest;

    await (
      guard as unknown as {
        handleRequest(p: ThrottlerRequest): Promise<boolean>;
      }
    ).handleRequest(props);

    expect(parent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 7, ttl: 45_000, blockDuration: 45_000 }),
    );
    parent.mockRestore();
  });
});
