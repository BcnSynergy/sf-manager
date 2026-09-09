import type { Role } from '../../../modules/users/domain/role';

// Port (application layer, ADR-002/013) — design.md Decision 4, sibling to
// CommunityScopeChecker (community-scope.checker.port.ts). Layer 2 of the
// 3-layer scope check: "does this actor have a company-wide review-history
// scope at all, and if so, which company". `MAINTENANCE_COMPANY_MANAGER` is
// the ONLY role that ever resolves to a non-null value — a
// MAINTENANCE_TECHNICIAN has a `maintenanceCompanyId` too, and it
// deliberately grants nothing here (that is a data fact, not a grant — see
// review-session's `UserDirectory` port for the non-authorizing read).
//
// Concrete adapter: UserCompanyScopeChecker
// (modules/users/infrastructure/authorization/user-company-scope.checker.ts),
// fail-closed and exhaustive on Role, mirroring
// AssignmentCommunityScopeChecker's shape exactly.
//
// Deliberately re-reads on every call — no cache — so detaching a manager
// from their company (or soft-deleting them, ADR-010) revokes their history
// scope on the caller's very next request, the same no-cache contract
// CommunityScopeChecker already established.
export interface CompanyScopeChecker {
  // The maintenance company whose review history this actor may read, or
  // `null` when they have no company-wide scope at all (wrong role, no
  // company set, or the user no longer resolves — e.g. soft-deleted).
  resolveCompanyScope(userId: string, role: Role): Promise<string | null>;
}

export const COMPANY_SCOPE_CHECKER = Symbol('COMPANY_SCOPE_CHECKER');
