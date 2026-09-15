import { InvalidManagerCapabilityAssignmentError } from './errors/invalid-manager-capability-assignment.error';
import { ManagerCapability } from './manager-capability';
import type { Role } from './role';

// review-history-manager-capability/design.md Decision 5: pure domain
// function, no ports, no I/O — mirrors assertCompanyMatchesRole. The
// NOT_ALLOWED direction — a REJECTION. Capabilities are never REQUIRED for
// any role (unlike maintenanceCompanyId), so there is no companion
// "required" assertion. Called at the write path (UpdateUserUseCase)
// against the RESULTING state — never in the User constructor (design.md
// Decision 1's explicit no-constructor-validation callout).
export function assertCapabilitiesAllowedForRole(
  role: Role,
  managerCapabilities: readonly ManagerCapability[],
): void {
  if (role !== 'MANAGER' && managerCapabilities.length > 0) {
    throw new InvalidManagerCapabilityAssignmentError(role);
  }
}

// review-history-manager-capability/design.md Decision 5: the
// clear-on-role-change/reset-on-promotion direction — a RESOLUTION, not an
// assertion (settled decision: capabilities are CLEARED on a demotion, not
// rejected). Returns what UpdateUserUseCase should pass to
// UserRepository.updateById's `changes.managerCapabilities`:
//   resulting MANAGER, prior MANAGER, requested supplied    -> requested
//   resulting MANAGER, prior MANAGER, requested absent      -> undefined (unchanged)
//   resulting MANAGER, prior NOT MANAGER (a promotion), requested supplied -> requested
//   resulting MANAGER, prior NOT MANAGER (a promotion), requested absent   -> [] (reset —
//     a stale array MUST NOT silently re-grant on promotion; only an
//     explicit, same-payload value carries a capability across a promotion)
//   resulting NOT MANAGER, existing empty -> undefined (nothing to do)
//   resulting NOT MANAGER, existing set   -> [] (the clear)
// `undefined` preserves updateById's shipped "absent means not part of this
// PATCH" contract, so an unrelated edit never writes this column.
// `priorRole` and `existing` MUST both be read from the SAME
// transactionally-fresh snapshot `resultingRole` was computed against
// (design.md Decision 5's transactional requirement) — never from a value
// read outside the transaction.
export function resolveManagerCapabilities(
  resultingRole: Role,
  priorRole: Role,
  requested: readonly ManagerCapability[] | undefined,
  existing: readonly ManagerCapability[],
): ManagerCapability[] | undefined {
  if (resultingRole === 'MANAGER') {
    if (requested !== undefined) {
      return [...requested];
    }
    if (priorRole !== 'MANAGER') {
      // A promotion INTO MANAGER with no explicit grant in this same
      // request — reset, never inherit a stale array.
      return [];
    }
    return undefined;
  }

  // resultingRole is not MANAGER: an explicit [] is still a genuine,
  // always-legal revoke (design.md Decision 6); anything else collapses to
  // the demotion clear when there is something to clear.
  if (requested !== undefined) {
    return [...requested];
  }
  if (existing.length === 0) {
    return undefined;
  }
  return [];
}
