import type { ManagerCapability } from '../../../modules/users/domain/manager-capability';
import type { Role } from '../../../modules/users/domain/role';

// Port (application layer, ADR-002/013) — design.md Decision 2 (the slice's
// biggest decision, OQ3). Layer 2 of the 3-layer scope check, but unlike its
// two siblings (CompanyScopeChecker, CommunityScopeChecker) this answers a
// BOOLEAN, not a scope value — this is the app's first CAPABILITY, not a
// data-shaped scope.
//
// Concrete adapter: UserManagerCapabilityChecker
// (modules/users/infrastructure/authorization/user-manager-capability.checker.ts),
// fail-closed and exhaustive on Role, sibling of UserCompanyScopeChecker.
//
// Deliberately re-reads on every call — no cache — so a SYSTEM_ADMIN
// unticking the toggle revokes access on the caller's very next request,
// with no re-login. The capability is NEVER in the JWT (ADR-011 2026-09-09
// addendum) and `Actor` stays `{userId, role}`.
export interface ManagerCapabilityChecker {
  // Does this actor CURRENTLY hold this manager capability? MANAGER is the
  // ONLY role that can ever answer true — the capability column is
  // meaningless for every other role by domain policy
  // (users/domain/manager-capability.policy.ts, PR 3), and a stale value
  // left on a non-MANAGER row therefore grants nothing here either.
  //
  // Returns a BOOLEAN, not the capability list, DELIBERATELY (design.md
  // Decision 2): an empty array is TRUTHY, so a caller who writes
  // `if (caps)` instead of `if (caps.includes(X))` would fail OPEN — and
  // "an ungranted MANAGER gains access anyway" is this slice's top risk.
  // `false` cannot be truthy-mistaken. ADR-011's array SHAPE is honoured by
  // the `capability` PARAMETER, not by the return type: each future
  // capability is a new enum member and a new argument, with NO signature
  // change and no second checker.
  hasManagerCapability(
    userId: string,
    role: Role,
    capability: ManagerCapability,
  ): Promise<boolean>;
}

export const MANAGER_CAPABILITY_CHECKER = Symbol('MANAGER_CAPABILITY_CHECKER');
