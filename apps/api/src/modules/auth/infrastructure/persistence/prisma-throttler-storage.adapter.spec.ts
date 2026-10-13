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
  let transaction: jest.Mock;
  let storage: PrismaThrottlerStorage;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    queryRaw = jest.fn();
    executeRaw = jest.fn();
    // The cleanup runs inside an interactive transaction; the callback gets a
    // client whose $executeRaw is the same mock, so call order is observable.
    transaction = jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $executeRaw: executeRaw }),
    );
    storage = new PrismaThrottlerStorage({
      $queryRaw: queryRaw,
      $transaction: transaction,
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

  it('resolves a blocked attempt from one statement, with no follow-up read', async () => {
    const blockedRow = { ...row, isBlocked: true, timeToBlockExpire: 42 };
    queryRaw.mockResolvedValueOnce([blockedRow]);

    await expect(
      storage.increment('k', 60_000, 10, 60_000, 'default'),
    ).resolves.toEqual(blockedRow);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('retries once when the statement snapshot cannot see the row', async () => {
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

    await expect(
      storage.increment('k', 60_000, 10, 60_000, 'default'),
    ).resolves.toEqual(row);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('fails closed when two statements in a row return no row', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      storage.increment('k', 60_000, 10, 60_000, 'default'),
    ).rejects.toThrow('returned no row');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('bounds the cleanup with a transaction-local statement timeout set before the delete', async () => {
    queryRaw.mockResolvedValue([row]);

    await storage.increment('k', 60_000, 10, 60_000, 'default');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const [timeoutStrings, ...timeoutValues] = executeRaw.mock
      .calls[0] as unknown as [string[], ...unknown[]];
    expect(timeoutStrings.join('?')).toMatch(/set_config\('statement_timeout'/);
    expect(timeoutStrings.join('?')).toMatch(/true\)/);
    expect(timeoutValues).toEqual(['500ms']);
    const [deleteStrings] = executeRaw.mock.calls[1] as unknown as [string[]];
    expect(deleteStrings.join('?')).toMatch(/DELETE FROM "ThrottleCounter"/);
  });

  it('does not open a transaction for a hit that is not a new window', async () => {
    queryRaw.mockResolvedValue([{ ...row, totalHits: 2 }]);

    await storage.increment('k', 60_000, 10, 60_000, 'default');

    expect(transaction).not.toHaveBeenCalled();
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
