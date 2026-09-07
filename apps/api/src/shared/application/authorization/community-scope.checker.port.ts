import type { Role } from '../../../modules/users/domain/role';

// Port (application layer, ADR-002/013) — design.md Decision 4, Layer 2 of
// the 3-layer scope check ("L1 role→permission" is PermissionChecker; "L3
// user→this session" is SessionAccess, PR 4). This layer answers ONLY
// "does this user currently hold an ACTIVE assignment of their own kind to
// this community" — nothing more. It never substitutes for the permission
// check (PermissionChecker.can), it composes beside it.
//
// Concrete adapter: AssignmentCommunityScopeChecker
// (community/infrastructure/authorization/assignment-community-scope.checker.ts),
// fail-closed and exhaustive on Role — a MAINTENANCE_TECHNICIAN's scope
// comes from CommunityTechnicianRepository, a COMMUNITY_REPRESENTATIVE's
// from CommunityRepresentativeRepository, and every other role has no
// assignment kind at all (authorization spec "Resource Scope — an Active
// Assignment Is Required Beyond the Permission").
//
// Deliberately re-reads the assignment on every call — no cache — so
// deactivating an assignment revokes access on the caller's very next
// request (authorization spec "Deactivating an assignment removes access
// on the next request").
export interface CommunityScopeChecker {
  isAssignedTo(
    userId: string,
    role: Role,
    communityId: string,
  ): Promise<boolean>;
}

export const COMMUNITY_SCOPE_CHECKER = Symbol('COMMUNITY_SCOPE_CHECKER');
