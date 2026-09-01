import { CommunityHasActiveElementsError } from './errors/community-has-active-elements.error';

// design.md Decision 6: pure domain function — no ports, no I/O, no
// repository reference. Mirrors `assertNoActiveUsersAttached`
// (maintenance-company/domain/maintenance-company-deletion.policy.ts)
// exactly. The use case (SoftDeleteCommunityUseCase) owns the read via
// `countActiveByCommunity`, which already excludes soft-deleted elements
// through the `deletedAt: null` filter (ADR-010) — this function only
// enforces the invariant itself (community-management spec.md "Soft-Delete
// Community").
export function assertNoActiveElementsAttached(
  activeElementCount: number,
): void {
  if (activeElementCount > 0) {
    throw new CommunityHasActiveElementsError(activeElementCount);
  }
}
