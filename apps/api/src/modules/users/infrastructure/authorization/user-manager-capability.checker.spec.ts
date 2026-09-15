import type { Role } from '../../domain/role';
import type { ManagerCapability } from '../../domain/manager-capability';
import { User } from '../../domain/user.entity';
import { InMemoryUserRepository } from '../../application/use-cases/testing/in-memory-user.repository';
import { UserManagerCapabilityChecker } from './user-manager-capability.checker';

// design.md Decision 2, tasks.md 2.4: table-driven over all 5 roles x
// {no capability, VIEW_ALL_REVIEWS, soft-deleted user} — only MANAGER +
// granted + live is true; findById is asserted called on EVERY invocation
// (no cache), mirroring UserCompanyScopeChecker's own spec shape.
describe('UserManagerCapabilityChecker', () => {
  const userId = 'user-1';

  function buildUser(overrides: {
    role: Role;
    managerCapabilities?: ManagerCapability[];
    deletedAt?: Date | null;
  }): User {
    const now = new Date('2026-01-01T00:00:00.000Z');
    return new User({
      id: userId,
      email: 'user@example.com',
      passwordHash: 'hash',
      role: overrides.role,
      createdAt: now,
      updatedAt: now,
      deletedAt: overrides.deletedAt ?? null,
      managerCapabilities: overrides.managerCapabilities ?? [],
    });
  }

  describe.each<Role>([
    'SYSTEM_ADMIN',
    'MANAGER',
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ])('role %s', (role) => {
    it('resolves false when the user holds no capability', async () => {
      const repository = new InMemoryUserRepository();
      repository.seed(buildUser({ role }));
      const checker = new UserManagerCapabilityChecker(repository);

      await expect(
        checker.hasManagerCapability(userId, role, 'VIEW_ALL_REVIEWS'),
      ).resolves.toBe(false);
    });

    const expectGranted = role === 'MANAGER';
    it(`resolves ${expectGranted ? 'true' : 'false'} when the user holds VIEW_ALL_REVIEWS`, async () => {
      const repository = new InMemoryUserRepository();
      repository.seed(
        buildUser({ role, managerCapabilities: ['VIEW_ALL_REVIEWS'] }),
      );
      const checker = new UserManagerCapabilityChecker(repository);

      await expect(
        checker.hasManagerCapability(userId, role, 'VIEW_ALL_REVIEWS'),
      ).resolves.toBe(expectGranted);
    });

    it('resolves false for a soft-deleted user even when granted', async () => {
      const repository = new InMemoryUserRepository();
      repository.seed(
        buildUser({
          role,
          managerCapabilities: ['VIEW_ALL_REVIEWS'],
          deletedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      const checker = new UserManagerCapabilityChecker(repository);

      await expect(
        checker.hasManagerCapability(userId, role, 'VIEW_ALL_REVIEWS'),
      ).resolves.toBe(false);
    });
  });

  it('resolves false (no row) when the user does not exist', async () => {
    const repository = new InMemoryUserRepository();
    const checker = new UserManagerCapabilityChecker(repository);

    await expect(
      checker.hasManagerCapability(userId, 'MANAGER', 'VIEW_ALL_REVIEWS'),
    ).resolves.toBe(false);
  });

  // The structural stale-JWT-role guard: the `role` parameter says MANAGER
  // (a stale JWT claim), but the PERSISTED row has since been demoted away
  // from MANAGER. The adapter must not trust the parameter — it re-checks
  // the freshly-read row's own role before consulting the capability array.
  it('resolves false when the role argument claims MANAGER but the persisted row is no longer MANAGER', async () => {
    const repository = new InMemoryUserRepository();
    repository.seed(
      buildUser({
        role: 'SYSTEM_ADMIN',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      }),
    );
    const checker = new UserManagerCapabilityChecker(repository);

    await expect(
      checker.hasManagerCapability(userId, 'MANAGER', 'VIEW_ALL_REVIEWS'),
    ).resolves.toBe(false);
  });

  it('calls findById on every invocation (no cache)', async () => {
    const repository = new InMemoryUserRepository();
    repository.seed(
      buildUser({ role: 'MANAGER', managerCapabilities: ['VIEW_ALL_REVIEWS'] }),
    );
    const checker = new UserManagerCapabilityChecker(repository);
    const spy = jest.spyOn(repository, 'findById');

    await checker.hasManagerCapability(userId, 'MANAGER', 'VIEW_ALL_REVIEWS');
    await checker.hasManagerCapability(userId, 'MANAGER', 'VIEW_ALL_REVIEWS');

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('refuses (does not resolve to undefined) for a role value outside the Role union', async () => {
    const repository = new InMemoryUserRepository();
    repository.seed(
      buildUser({ role: 'MANAGER', managerCapabilities: ['VIEW_ALL_REVIEWS'] }),
    );
    const checker = new UserManagerCapabilityChecker(repository);

    await expect(
      checker.hasManagerCapability(
        userId,
        'NOT_A_REAL_ROLE' as unknown as Role,
        'VIEW_ALL_REVIEWS',
      ),
    ).resolves.toBe(false);
  });
});
