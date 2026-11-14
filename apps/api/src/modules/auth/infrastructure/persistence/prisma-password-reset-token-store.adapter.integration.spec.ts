import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { NewPasswordResetToken } from '../../application/ports/password-reset-token-store.port';
import { PrismaPasswordResetTokenStore } from './prisma-password-reset-token-store.adapter';

// password-reset S4: against the real (per-run) Postgres, to prove what the
// in-memory fake only mirrors: the unique hash, the FK to User, the
// replace-unused rule and above all that consume is atomic: exactly one of
// two concurrent calls wins.
describe('PrismaPasswordResetTokenStore (integration)', () => {
  let prisma: PrismaService;
  let store: PrismaPasswordResetTokenStore;
  let userId: string;
  let otherUserId: string;

  const at = (iso: string) => new Date(iso);
  const T0 = '2026-11-15T10:00:00.000Z';
  const T_MID = '2026-11-15T10:10:00.000Z';
  const T_EXPIRY = '2026-11-15T10:30:00.000Z';

  function newToken(
    overrides: Partial<NewPasswordResetToken> = {},
  ): NewPasswordResetToken {
    return {
      id: randomUUID(),
      userId,
      tokenHash: randomUUID(),
      createdAt: at(T0),
      expiresAt: at(T_EXPIRY),
      ...overrides,
    };
  }

  async function makeUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `reset-store-${randomUUID()}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'SYSTEM_ADMIN',
      },
    });
    return id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    store = new PrismaPasswordResetTokenStore(prisma);
    userId = await makeUser();
    otherUserId = await makeUser();
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.$disconnect();
  });

  it('stores a token and consumes it once, returning its user', async () => {
    const token = newToken();
    await store.createReplacingUnused(token);

    await expect(store.consume(token.tokenHash, at(T_MID))).resolves.toEqual({
      userId,
    });
    await expect(store.consume(token.tokenHash, at(T_MID))).resolves.toBeNull();
  });

  it('refuses an unknown hash and an expired token (the expiry instant itself is expired)', async () => {
    const token = newToken();
    await store.createReplacingUnused(token);

    await expect(store.consume(randomUUID(), at(T_MID))).resolves.toBeNull();
    await expect(
      store.consume(token.tokenHash, at(T_EXPIRY)),
    ).resolves.toBeNull();
    // An expired attempt does not burn the row's state for later reads.
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: token.tokenHash },
    });
    expect(row?.usedAt).toBeNull();
  });

  it('lets exactly one of two concurrent consumes win', async () => {
    const token = newToken();
    await store.createReplacingUnused(token);

    const results = await Promise.all([
      store.consume(token.tokenHash, at(T_MID)),
      store.consume(token.tokenHash, at(T_MID)),
    ]);

    expect(results.filter((r) => r !== null)).toEqual([{ userId }]);
  });

  it("invalidates the same user's earlier unused tokens, and only theirs", async () => {
    const first = newToken();
    const otherUsers = newToken({ userId: otherUserId });
    await store.createReplacingUnused(first);
    await store.createReplacingUnused(otherUsers);

    const second = newToken({ createdAt: at(T_MID) });
    await store.createReplacingUnused(second);

    await expect(store.consume(first.tokenHash, at(T_MID))).resolves.toBeNull();
    await expect(
      store.consume(otherUsers.tokenHash, at(T_MID)),
    ).resolves.toEqual({
      userId: otherUserId,
    });
    await expect(store.consume(second.tokenHash, at(T_MID))).resolves.toEqual({
      userId,
    });
  });

  it('rolls the invalidation back when the new token cannot be stored', async () => {
    const earlier = newToken();
    await store.createReplacingUnused(earlier);

    await expect(
      store.createReplacingUnused(newToken({ tokenHash: earlier.tokenHash })),
    ).rejects.toThrow();

    await expect(store.consume(earlier.tokenHash, at(T_MID))).resolves.toEqual({
      userId,
    });
  });

  it('refuses a token for a user that does not exist (FK)', async () => {
    await expect(
      store.createReplacingUnused(newToken({ userId: randomUUID() })),
    ).rejects.toThrow();
  });

  it('deletes only the tokens past their expiry', async () => {
    const live = newToken();
    const dead = newToken({ expiresAt: at('2026-11-15T09:00:00.000Z') });
    await store.createReplacingUnused(dead);
    await store.createReplacingUnused(live);

    await store.deleteExpired(at(T_MID));

    await expect(
      prisma.passwordResetToken.findUnique({
        where: { tokenHash: dead.tokenHash },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.passwordResetToken.findUnique({
        where: { tokenHash: live.tokenHash },
      }),
    ).resolves.not.toBeNull();
  });
});
