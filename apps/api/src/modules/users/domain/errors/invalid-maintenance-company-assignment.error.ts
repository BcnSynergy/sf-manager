import type { Role } from '../role';

// Thrown by assertCompanyMatchesRole() (design.md Decision 5) and by
// UpdateUserUseCase's unconditional resulting-state check (spec.md
// "Grandfathered Maintenance-Role Users", OQ2) at the write path —
// CreateUserUseCase and UpdateUserUseCase — when the role/maintenanceCompanyId
// pair violates the conditional requirement: a maintenance role
// (MAINTENANCE_COMPANY_MANAGER, MAINTENANCE_TECHNICIAN) with no company, or a
// non-maintenance role with a company supplied (spec.md "Create User" /
// "Update User"). The shared Zod `.superRefine`
// (packages/validation/src/users/{create,update}-user.schema.ts) rejects
// both shapes on the HTTP path first when the payload itself is internally
// inconsistent, so this is the backstop for: writers that bypass the pipe
// entirely (e.g. `prisma/seed.ts` via `save()`), AND — for UpdateUserUseCase
// specifically — the cases a partial PATCH's schema cannot see (a
// company-only reassignment, or a companyless-role RESULTING state that a
// PATCH never mentions by name).
//
// `reason` distinguishes the two violation shapes for the presentation
// layer's `code` mapping (user-management spec.md "409/400 responses carry
// a machine-readable cause"): `REQUIRED` -> 400 `MAINTENANCE_COMPANY_REQUIRED`,
// `NOT_ALLOWED` -> 400 `MAINTENANCE_COMPANY_NOT_ALLOWED`. Both are plain 400s
// distinct from the shared `MAINTENANCE_COMPANY_NOT_FOUND` cause below.
export type InvalidMaintenanceCompanyAssignmentReason =
  'REQUIRED' | 'NOT_ALLOWED';

export class InvalidMaintenanceCompanyAssignmentError extends Error {
  readonly reason: InvalidMaintenanceCompanyAssignmentReason;

  constructor(role: Role, maintenanceCompanyId: string | null) {
    const reason: InvalidMaintenanceCompanyAssignmentReason =
      maintenanceCompanyId === null ? 'REQUIRED' : 'NOT_ALLOWED';
    super(
      reason === 'REQUIRED'
        ? `Role "${role}" requires a maintenanceCompanyId, but none was supplied`
        : `Role "${role}" does not accept a maintenanceCompanyId, but one was supplied`,
    );
    this.name = 'InvalidMaintenanceCompanyAssignmentError';
    this.reason = reason;
  }
}
