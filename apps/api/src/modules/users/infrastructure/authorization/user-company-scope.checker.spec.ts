import type { Role } from '../../domain/role';
import { User } from '../../domain/user.entity';
import { InMemoryUserRepository } from '../../application/use-cases/testing/in-memory-user.repository';
import { UserCompanyScopeChecker } from './user-company-scope.checker';

// review-history-company-scope/design.md Decision 3/4, tasks.md 2.2/2.5:
// table-driven over all 5 roles x {no company, has company, soft-deleted
// user} — only MAINTENANCE_COMPANY_MANAGER ever resolves non-null, and a
// soft-deleted manager resolves to null via the SAME `deletedAt: null`
// default filter UserRepository.findById already enforces (ADR-010) — no
// extra check needed in the adapter itself.
describe('UserCompanyScopeChecker', () => {
  const userId = 'user-1';
  const companyId = 'company-1';

  function buildUser(overrides: {
    maintenanceCompanyId?: string | null;
    deletedAt?: Date | null;
  }): User {
    return new User({
      id: userId,
      email: 'manager@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MAINTENANCE_COMPANY_MANAGER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: overrides.deletedAt ?? null,
      maintenanceCompanyId: overrides.maintenanceCompanyId ?? null,
    });
  }

  function buildChecker(user?: User): UserCompanyScopeChecker {
    const repository = new InMemoryUserRepository();
    if (user) {
      repository.seed(user);
    }
    return new UserCompanyScopeChecker(repository);
  }

  describe.each<Role>([
    'SYSTEM_ADMIN',
    'MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ])('role %s', (role) => {
    it('resolves to null with no company set', async () => {
      const checker = buildChecker(buildUser({ maintenanceCompanyId: null }));

      await expect(
        checker.resolveCompanyScope(userId, role),
      ).resolves.toBeNull();
    });

    it('resolves to null even with a company set — the company association confers no scope', async () => {
      const checker = buildChecker(
        buildUser({ maintenanceCompanyId: companyId }),
      );

      await expect(
        checker.resolveCompanyScope(userId, role),
      ).resolves.toBeNull();
    });

    it('resolves to null for a soft-deleted user with a company set', async () => {
      const checker = buildChecker(
        buildUser({
          maintenanceCompanyId: companyId,
          deletedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        checker.resolveCompanyScope(userId, role),
      ).resolves.toBeNull();
    });
  });

  describe('role MAINTENANCE_COMPANY_MANAGER', () => {
    it('resolves to null with no company set', async () => {
      const checker = buildChecker(buildUser({ maintenanceCompanyId: null }));

      await expect(
        checker.resolveCompanyScope(userId, 'MAINTENANCE_COMPANY_MANAGER'),
      ).resolves.toBeNull();
    });

    it('resolves to the company id when one is set', async () => {
      const checker = buildChecker(
        buildUser({ maintenanceCompanyId: companyId }),
      );

      await expect(
        checker.resolveCompanyScope(userId, 'MAINTENANCE_COMPANY_MANAGER'),
      ).resolves.toBe(companyId);
    });

    it('resolves to null for a soft-deleted manager, even with a company set (ADR-010)', async () => {
      const checker = buildChecker(
        buildUser({
          maintenanceCompanyId: companyId,
          deletedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        checker.resolveCompanyScope(userId, 'MAINTENANCE_COMPANY_MANAGER'),
      ).resolves.toBeNull();
    });

    it('resolves to null when the user id does not exist at all', async () => {
      const checker = buildChecker();

      await expect(
        checker.resolveCompanyScope(
          'does-not-exist',
          'MAINTENANCE_COMPANY_MANAGER',
        ),
      ).resolves.toBeNull();
    });
  });

  // `role` comes from a JWT claim with no runtime enum validation — same
  // fail-closed backstop as AssignmentCommunityScopeChecker's own switch.
  it('refuses (resolves to null) for a role value outside the Role union', async () => {
    const checker = buildChecker(
      buildUser({ maintenanceCompanyId: companyId }),
    );

    await expect(
      checker.resolveCompanyScope(userId, 'NOT_A_REAL_ROLE' as unknown as Role),
    ).resolves.toBeNull();
  });
});
