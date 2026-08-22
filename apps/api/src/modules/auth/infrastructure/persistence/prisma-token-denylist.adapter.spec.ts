import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaTokenDenylistAdapter } from './prisma-token-denylist.adapter';

// Unit test with a MOCKED Prisma client only — the real-DB variant proving
// Postgres's actual upsert/ON CONFLICT semantics is a separate Integration
// test (prisma-token-denylist.adapter.integration.spec.ts), per design.md's
// Testing Strategy (a mock cannot validate that Postgres honors the upsert).
describe('PrismaTokenDenylistAdapter', () => {
  const prismaMock = {
    revokedToken: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const adapter = new PrismaTokenDenylistAdapter(
    prismaMock as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a jti as revoked when a row exists', async () => {
    prismaMock.revokedToken.findUnique.mockResolvedValue({
      jti: 'jti-1',
      expiresAt: new Date(),
    });

    await expect(adapter.isRevoked('jti-1')).resolves.toBe(true);
    expect(prismaMock.revokedToken.findUnique).toHaveBeenCalledWith({
      where: { jti: 'jti-1' },
    });
  });

  it('reports a jti as not revoked when no row exists', async () => {
    prismaMock.revokedToken.findUnique.mockResolvedValue(null);

    await expect(adapter.isRevoked('jti-1')).resolves.toBe(false);
  });

  it('revokes via an upsert keyed on jti — idempotent by construction (design.md Decision 9)', async () => {
    const expiresAt = new Date();

    await adapter.revoke('jti-1', expiresAt);

    expect(prismaMock.revokedToken.upsert).toHaveBeenCalledWith({
      where: { jti: 'jti-1' },
      create: { jti: 'jti-1', expiresAt },
      update: { expiresAt },
    });
  });

  it('calling revoke() twice with the same jti calls upsert twice, never insert (mock-level proof that no unique-constraint code path exists)', async () => {
    const expiresAt = new Date();

    await adapter.revoke('jti-1', expiresAt);
    await adapter.revoke('jti-1', expiresAt);

    expect(prismaMock.revokedToken.upsert).toHaveBeenCalledTimes(2);
  });

  it('deletes only rows past an approximately-current reference time (not an arbitrary/stale Date)', async () => {
    const before = Date.now();

    await adapter.deleteExpired();

    const after = Date.now();
    expect(prismaMock.revokedToken.deleteMany).toHaveBeenCalledTimes(1);

    const [callArg] = prismaMock.revokedToken.deleteMany.mock.calls[0] as [
      { where: { expiresAt: { lt: Date } } },
    ];
    const passedDate = callArg.where.expiresAt.lt;

    expect(passedDate).toBeInstanceOf(Date);
    // A stale/fixed/epoch-0 reference time (or the wrong comparator) would
    // fail this bound — the argument must be within a small tolerance of
    // "now", not merely "some Date instance".
    expect(passedDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(passedDate.getTime()).toBeLessThanOrEqual(after);
  });
});
