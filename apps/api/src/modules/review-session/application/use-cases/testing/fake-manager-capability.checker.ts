import type { Role } from '../../../../users/domain/role';
import type { ManagerCapability } from '../../../../users/domain/manager-capability';
import type { ManagerCapabilityChecker } from '../../../../../shared/application/authorization/manager-capability.checker.port';

// Test double for ManagerCapabilityChecker (design.md Decision 2, Layer 2).
// Configured with a static `userId -> granted` boolean — an id with no
// seeded entry resolves to `false`, mirroring the real adapter's
// fail-closed default. Ignores `role` and `capability`, mirroring
// FakeCompanyScopeChecker: test authors control which userId resolves
// truthy, so there is no separate role/capability table to fake here.
export class FakeManagerCapabilityChecker implements ManagerCapabilityChecker {
  private readonly grantedByUserId = new Set<string>();

  grant(userId: string): void {
    this.grantedByUserId.add(userId);
  }

  hasManagerCapability(
    userId: string,
    role: Role,
    capability: ManagerCapability,
  ): Promise<boolean> {
    void role; // ignored — see comment above
    void capability; // ignored — see comment above
    return Promise.resolve(this.grantedByUserId.has(userId));
  }
}
