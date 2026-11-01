import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { NewRefreshToken } from '../../application/ports/refresh-token-store.port';
import { PrismaRefreshTokenStore } from './prisma-refresh-token-store.adapter';

// Unit test with a mocked Prisma client, for what a real database cannot
// produce on demand: an interactive-transaction error such as P2028.
// Real-database behaviour is in the integration spec.
describe('PrismaRefreshTokenStore', () => {
  const successor = {} as NewRefreshToken;
  const at = new Date('2026-11-01T09:00:00.000Z');

  function storeWhoseTransactionRejects(error: Error): PrismaRefreshTokenStore {
    const prisma = { $transaction: jest.fn().mockRejectedValue(error) };
    return new PrismaRefreshTokenStore(prisma as unknown as PrismaService);
  }

  // Not mapped to a lost exchange: P2028 also means the pool had no
  // connection to start the transaction (load spike), and a 401 there would
  // clear the refresh cookie of users whose token was never consumed. The
  // transaction rolled back, so the 500 leaves the token usable for a retry.
  it('lets a transaction timeout (P2028) propagate, so nothing is consumed and the cookie survives', async () => {
    const timeout = new Prisma.PrismaClientKnownRequestError(
      'Transaction API error',
      { code: 'P2028', clientVersion: 'test' },
    );

    await expect(
      storeWhoseTransactionRejects(timeout).exchange(
        'id',
        'rotation',
        at,
        successor,
      ),
    ).rejects.toBe(timeout);
  });

  it('rethrows any other database error', async () => {
    const other = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );

    await expect(
      storeWhoseTransactionRejects(other).exchange(
        'id',
        'grace',
        at,
        successor,
      ),
    ).rejects.toBe(other);
  });
});
