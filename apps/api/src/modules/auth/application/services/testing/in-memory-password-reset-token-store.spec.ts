import { InMemoryPasswordResetTokenStore } from './in-memory-password-reset-token-store';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const LATER = new Date('2026-11-15T10:30:00.000Z');

describe('InMemoryPasswordResetTokenStore (contract parity with the Prisma adapter)', () => {
  it('rejects a duplicate token hash without invalidating the earlier tokens', async () => {
    const store = new InMemoryPasswordResetTokenStore();
    await store.createReplacingUnused({
      id: 'a',
      userId: 'u1',
      tokenHash: 'same',
      createdAt: NOW,
      expiresAt: LATER,
    });

    await expect(
      store.createReplacingUnused({
        id: 'b',
        userId: 'u1',
        tokenHash: 'same',
        createdAt: NOW,
        expiresAt: LATER,
      }),
    ).rejects.toThrow();

    expect(store.tokens.size).toBe(1);
    await expect(store.consume('same', NOW)).resolves.toEqual({ userId: 'u1' });
  });
});
