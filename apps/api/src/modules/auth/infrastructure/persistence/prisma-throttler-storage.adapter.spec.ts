import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaThrottlerStorage } from './prisma-throttler-storage.adapter';

// Failure-path unit tests (login-rate-limit-hardening/design.md Decisions 4-6).
// The SQL itself is proven in the integration spec; here only the error
// policy is pinned: the upsert fails closed, the cleanup never fails a login.
describe('PrismaThrottlerStorage (failure paths)', () => {
  const row = {
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  };

  let queryRaw: jest.Mock;
  let executeRaw: jest.Mock;
  let storage: PrismaThrottlerStorage;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    queryRaw = jest.fn();
    executeRaw = jest.fn();
    storage = new PrismaThrottlerStorage({
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as PrismaService);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('fails closed: rejects when the upsert query rejects', async () => {
    queryRaw.mockRejectedValue(new Error('db down'));

    await expect(
      storage.increment('k', 60_000, 10, 60_000, 'default'),
    ).rejects.toThrow('db down');
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('still resolves with the record and logs a warning when cleanup rejects', async () => {
    queryRaw.mockResolvedValue([row]);
    executeRaw.mockRejectedValue(new Error('cleanup boom'));

    await expect(
      storage.increment('k', 60_000, 10, 60_000, 'default'),
    ).resolves.toEqual(row);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cleanup boom'),
    );
  });
});
