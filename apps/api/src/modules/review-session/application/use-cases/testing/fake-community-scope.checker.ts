import type { Role } from '../../../../users/domain/role';
import type { CommunityScopeChecker } from '../../../../../shared/application/authorization/community-scope.checker.port';

// Test double for CommunityScopeChecker (design.md Decision 4, Layer 2).
// Configured with a static set of `${userId}::${communityId}` pairs the
// actor is considered actively assigned to — every other combination
// resolves `false`, mirroring the real adapter's fail-closed behaviour.
export class FakeCommunityScopeChecker implements CommunityScopeChecker {
  private readonly assignedPairs = new Set<string>();

  assign(userId: string, communityId: string): void {
    this.assignedPairs.add(`${userId}::${communityId}`);
  }

  isAssignedTo(
    userId: string,
    _role: Role,
    communityId: string,
  ): Promise<boolean> {
    return Promise.resolve(this.assignedPairs.has(`${userId}::${communityId}`));
  }
}
