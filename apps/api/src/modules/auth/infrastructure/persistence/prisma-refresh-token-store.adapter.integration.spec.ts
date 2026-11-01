import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { NewRefreshToken } from '../../application/ports/refresh-token-store.port';
import { PrismaRefreshTokenStore } from './prisma-refresh-token-store.adapter';

// TD-5: against the real (per-run) Postgres, to prove what the in-memory fake
// only mirrors: the unique hash, the FK to User, and above all that the
// conditional markRotated lets exactly one of two concurrent calls win.
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
      revokedAt: null,
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

  it('lets exactly one of two concurrent markRotated calls win', async () => {
    const token = newToken();
    await store.create(token);
    const first = at('2026-11-01T09:00:00.000Z');
    const second = at('2026-11-01T09:00:01.000Z');

    const results = await Promise.all([
      store.markRotated(token.id, first),
      store.markRotated(token.id, second),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await store.findByHash(token.tokenHash);
    expect([first.getTime(), second.getTime()]).toContain(
      stored?.rotatedAt?.getTime(),
    );
    await expect(store.markRotated(token.id, second)).resolves.toBe(false);
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

  it('deletes only the tokens whose expiry is before now', async () => {
    const expired = newToken({ expiresAt: at('2026-11-01T09:59:59.999Z') });
    const atNow = newToken({ expiresAt: at('2026-11-01T10:00:00.000Z') });
    const live = newToken({ expiresAt: at('2026-11-01T18:00:00.000Z') });
    await Promise.all([
      store.create(expired),
      store.create(atNow),
      store.create(live),
    ]);

    await store.deleteExpired(at('2026-11-01T10:00:00.000Z'));

    await expect(store.findByHash(expired.tokenHash)).resolves.toBeNull();
    await expect(store.findByHash(atNow.tokenHash)).resolves.not.toBeNull();
    await expect(store.findByHash(live.tokenHash)).resolves.not.toBeNull();
  });
});
