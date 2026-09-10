import type { Role } from '../../../../users/domain/role';
import type { CompanyScopeChecker } from '../../../../../shared/application/authorization/company-scope.checker.port';

// Test double for CompanyScopeChecker (design.md Decision 3/4, Layer 2).
// Configured with a static `userId -> companyId | null` map — an id with no
// seeded entry resolves to `null`, mirroring the real adapter's fail-closed
// behaviour for an unknown, company-less or soft-deleted user. Ignores
// `role`, mirroring FakeCommunityScopeChecker: test authors control which
// (userId, companyId) pairs resolve, so there is no separate role-kind
// table to fake here either.
export class FakeCompanyScopeChecker implements CompanyScopeChecker {
  private readonly companyIdByUserId = new Map<string, string | null>();

  assign(userId: string, companyId: string | null): void {
    this.companyIdByUserId.set(userId, companyId);
  }

  resolveCompanyScope(userId: string, role: Role): Promise<string | null> {
    void role; // ignored — see comment above
    return Promise.resolve(this.companyIdByUserId.get(userId) ?? null);
  }
}
