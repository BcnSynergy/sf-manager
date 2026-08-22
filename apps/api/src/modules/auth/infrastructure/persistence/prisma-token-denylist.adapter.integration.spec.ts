import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaTokenDenylistAdapter } from './prisma-token-denylist.adapter';

// Integration test against the real (test) Postgres instance (design.md
// Testing Strategy) — validates that Postgres's actual upsert/ON CONFLICT
// behavior holds for a duplicate revoke() call, which the mocked-Prisma
// unit suite (prisma-token-denylist.adapter.spec.ts) only proves is
// *attempted*, not that the database honors it. Reuses the same
// DATABASE_URL/connection as the PrismaUserRepository integration suite
// (PR 2) — no dedicated test-database mechanism exists yet in this repo.
//
// jti here is uuid's v4() directly, matching design.md Decision 9 — jti is
// never generated via the entity IdGenerator/UUIDv7 port.
describe('PrismaTokenDenylistAdapter (integration)', () => {
  let prisma: PrismaService;
  let adapter: PrismaTokenDenylistAdapter;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    adapter = new PrismaTokenDenylistAdapter(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('revoke() called twice with the same jti succeeds both times with no unique-constraint violation, and the second call actually updates expiresAt', async () => {
    const jti = uuidv4();
    // Truncate to whole seconds — Postgres timestamp precision plus
    // round-tripping through the driver can otherwise introduce sub-ms
    // drift that would make an exact equality check flaky.
    const firstExpiresAt = new Date(
      Math.floor((Date.now() + 60 * 60 * 1000) / 1000) * 1000,
    );

    await expect(adapter.revoke(jti, firstExpiresAt)).resolves.toBeUndefined();
    await expect(adapter.isRevoked(jti)).resolves.toBe(true);

    const firstRow = await prisma.revokedToken.findUniqueOrThrow({
      where: { jti },
    });
    expect(firstRow.expiresAt.getTime()).toBe(firstExpiresAt.getTime());

    // A second, later expiry — as a retried/duplicate logout call would
    // pass — must update the existing row's expiresAt, not fail on a
    // duplicate insert and not silently no-op the update.
    const secondExpiresAt = new Date(
      Math.floor((Date.now() + 2 * 60 * 60 * 1000) / 1000) * 1000,
    );

    await expect(adapter.revoke(jti, secondExpiresAt)).resolves.toBeUndefined();
    await expect(adapter.isRevoked(jti)).resolves.toBe(true);

    const secondRow = await prisma.revokedToken.findUniqueOrThrow({
      where: { jti },
    });
    expect(secondRow.expiresAt.getTime()).toBe(secondExpiresAt.getTime());
    expect(secondRow.expiresAt.getTime()).not.toBe(
      firstRow.expiresAt.getTime(),
    );
  });
});
