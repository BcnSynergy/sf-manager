import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { NewRefreshToken } from '../../application/ports/refresh-token-store.port';
import { PrismaRefreshTokenStore } from './prisma-refresh-token-store.adapter';

// TD-5: against the real (per-run) Postgres, to prove what the in-memory fake
// only mirrors: the unique hash, the FK to User, and above all that the
// exchange is atomic: exactly one of two concurrent calls wins and stores its
// successor, and a failed successor rolls the consume back.
describe('PrismaRefreshTokenStore (integration)', () => {
  let prisma: PrismaService;
  let store: PrismaRefreshTokenStore;
  let userId: string;

  const at = (iso: string) => new Date(iso);

  function newToken(overrides: Partial<NewRefreshToken> = {}): NewRefreshToken {
    return {
      id: randomUUID(),
      tokenHash: randomUUID(),
      familyId: randomUUID(),
      userId,
      createdAt: at('2026-11-01T08:00:00.000Z'),
      expiresAt: at('2026-11-01T16:00:00.000Z'),
      familyExpiresAt: at('2026-11-08T08:00:00.000Z'),
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    store = new PrismaRefreshTokenStore(prisma);
    userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `refresh-store-${randomUUID()}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'SYSTEM_ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates a token and finds it by hash, with rotatedAt and revokedAt null', async () => {
    const token = newToken();

    await store.create(token);

    await expect(store.findByHash(token.tokenHash)).resolves.toEqual({
      ...token,
      rotatedAt: null,
      graceUsedAt: null,
      revokedAt: null,
      familyRevoked: false,
    });
    await expect(store.findByHash(randomUUID())).resolves.toBeNull();
  });

  it('refuses a token for a user that does not exist (FK)', async () => {
    await expect(
      store.create(newToken({ userId: randomUUID() })),
    ).rejects.toThrow();
  });

  it('refuses a second token with the same hash', async () => {
    const token = newToken();
    await store.create(token);

    await expect(
      store.create(newToken({ tokenHash: token.tokenHash })),
    ).rejects.toThrow();
  });

  it.each(['rotation', 'grace'] as const)(
    'lets exactly one of two concurrent %s exchanges win, storing only its successor',
    async (kind) => {
      const token = newToken();
      await store.create(token);
      const now = at('2026-11-01T09:00:00.000Z');
      const a = newToken({ familyId: token.familyId });
      const b = newToken({ familyId: token.familyId });

      const results = await Promise.all([
        store.exchange(token.id, kind, now, a),
        store.exchange(token.id, kind, now, b),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const stored = await store.findByHash(token.tokenHash);
      const field = kind === 'rotation' ? 'rotatedAt' : 'graceUsedAt';
      expect(stored?.[field]).toEqual(now);
      const successors = await prisma.refreshToken.count({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(successors).toBe(1);
      await expect(
        store.exchange(token.id, kind, now, newToken()),
      ).resolves.toBe(false);
    },
  );

  it('rolls the consume back when the successor cannot be stored', async () => {
    const token = newToken();
    const other = newToken();
    await Promise.all([store.create(token), store.create(other)]);

    await expect(
      store.exchange(
        token.id,
        'rotation',
        at('2026-11-01T09:00:00.000Z'),
        newToken({ tokenHash: other.tokenHash }),
      ),
    ).rejects.toThrow();

    expect((await store.findByHash(token.tokenHash))?.rotatedAt).toBeNull();
  });

  it('reports the family as revoked for a token added after the revoke', async () => {
    const familyId = randomUUID();
    const first = newToken({ familyId });
    await store.create(first);
    await store.revokeFamily(familyId, at('2026-11-01T10:00:00.000Z'));
    const late = newToken({ familyId });

    await store.create(late);

    const found = await store.findByHash(late.tokenHash);
    expect(found?.revokedAt).toBeNull();
    expect(found?.familyRevoked).toBe(true);
  });

  it('revokes every not-yet-revoked token of a family, and only that family', async () => {
    const familyId = randomUUID();
    const earlier = at('2026-11-01T07:00:00.000Z');
    const now = at('2026-11-01T10:00:00.000Z');
    const a = newToken({ familyId });
    const b = newToken({ familyId });
    const other = newToken();
    await Promise.all([store.create(a), store.create(b), store.create(other)]);
    await store.revokeFamily(familyId, earlier);
    const c = newToken({ familyId });
    await store.create(c);

    await store.revokeFamily(familyId, now);

    expect((await store.findByHash(a.tokenHash))?.revokedAt).toEqual(earlier);
    expect((await store.findByHash(b.tokenHash))?.revokedAt).toEqual(earlier);
    expect((await store.findByHash(c.tokenHash))?.revokedAt).toEqual(now);
    expect((await store.findByHash(other.tokenHash))?.revokedAt).toBeNull();
  });

  it('deletes only the tokens whose family expired before now, keeping consumed ones of live families', async () => {
    const now = at('2026-11-01T10:00:00.000Z');
    const deadFamily = newToken({
      expiresAt: at('2026-11-01T09:00:00.000Z'),
      familyExpiresAt: at('2026-11-01T09:59:59.999Z'),
    });
    const familyEndsNow = newToken({ familyExpiresAt: now });
    const pastOwnExpiry = newToken({
      expiresAt: at('2026-11-01T02:00:00.000Z'),
    });
    await Promise.all([
      store.create(deadFamily),
      store.create(familyEndsNow),
      store.create(pastOwnExpiry),
    ]);

    await store.deleteExpired(now);

    await expect(store.findByHash(deadFamily.tokenHash)).resolves.toBeNull();
    await expect(
      store.findByHash(familyEndsNow.tokenHash),
    ).resolves.not.toBeNull();
    await expect(
      store.findByHash(pastOwnExpiry.tokenHash),
    ).resolves.not.toBeNull();
  });
});
