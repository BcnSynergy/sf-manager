import { InvalidMaintenanceCompanyAssignmentError } from './errors/invalid-maintenance-company-assignment.error';
import type { Role } from './role';

// design.md Interfaces/Contracts: the same predicate that drives the shared
// Zod `.superRefine` (packages/validation/src/users/create-user.schema.ts)
// and the web form's show/hide of the company selector — kept local here
// rather than imported, because `users/domain/password.ts` already
// establishes the reverse direction (a domain file importing FROM
// @sf-manager/validation, not the other way around); a domain policy has no
// reason to depend on the validation package.
const MAINTENANCE_ROLES: readonly Role[] = [
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
];

function isMaintenanceRole(role: Role): boolean {
  return MAINTENANCE_ROLES.includes(role);
}

// design.md Decision 3: pure domain function, no ports, no I/O — mirrors
// last-admin.policy.ts. The AUTHORITY for the conditional requirement
// ("maintenanceCompanyId required iff role is maintenance-side", spec.md
// "Create User" / "Update User") for writers that never pass through the
// shared Zod pipe (e.g. `prisma/seed.ts` via `save()`); on the HTTP path the
// `.superRefine` rejects both violation shapes first, so this is a
// backstop, not the primary gate. Called ONLY at the write path
// (CreateUserUseCase, and UpdateUserUseCase when maintenanceCompanyId is
// present in the request) — NEVER in the User constructor (design.md
// Decision 5's explicit landmine callout).
export function assertCompanyMatchesRole(
  role: Role,
  maintenanceCompanyId: string | null,
): void {
  if (isMaintenanceRole(role) && maintenanceCompanyId === null) {
    throw new InvalidMaintenanceCompanyAssignmentError(role, null);
  }
  if (!isMaintenanceRole(role) && maintenanceCompanyId !== null) {
    throw new InvalidMaintenanceCompanyAssignmentError(
      role,
      maintenanceCompanyId,
    );
  }
}
