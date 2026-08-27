import type { Role } from '../role';

// Thrown by assertCompanyMatchesRole() (design.md Decision 5) at the write
// path — CreateUserUseCase and (payload-scoped) UpdateUserUseCase — when the
// request's role/maintenanceCompanyId pair violates the conditional
// requirement: a maintenance role (MAINTENANCE_COMPANY_MANAGER,
// MAINTENANCE_TECHNICIAN) with no company, or a non-maintenance role with a
// company supplied (spec.md "Create User" / "Update User"). This is a
// backstop: the shared Zod `.superRefine` already rejects both shapes on the
// HTTP path, so this error is unreachable through the pipe and is caught
// only by writers that bypass it (e.g. `prisma/seed.ts` via `save()`). The
// application layer maps this to a plain 400 with no `code` (design.md
// Decision 5) — distinct from the shared 400 `MAINTENANCE_COMPANY_NOT_FOUND`
// cause below, which DOES carry a code.
export class InvalidMaintenanceCompanyAssignmentError extends Error {
  constructor(role: Role, maintenanceCompanyId: string | null) {
    super(
      maintenanceCompanyId === null
        ? `Role "${role}" requires a maintenanceCompanyId, but none was supplied`
        : `Role "${role}" does not accept a maintenanceCompanyId, but one was supplied`,
    );
    this.name = 'InvalidMaintenanceCompanyAssignmentError';
  }
}
