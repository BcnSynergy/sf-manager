import type { Role } from './role';
import { InvalidMaintenanceCompanyAssignmentError } from './errors/invalid-maintenance-company-assignment.error';
import { assertCompanyMatchesRole } from './maintenance-company-assignment.policy';

// design.md Decision 5: pure domain function, no ports, no I/O — mirrors
// last-admin.policy.ts. Table-driven over every Role x
// company-present/absent pair (spec.md "Create User" / "Update User" — both
// conditional-requirement shapes, 1 and 2). This is the AUTHORITY for
// writers that never pass through the shared Zod `.superRefine` (e.g.
// `prisma/seed.ts` via `save()`) — the pipe rejects both shapes first on the
// HTTP path, so this is a backstop, not the primary gate.
describe('assertCompanyMatchesRole', () => {
  const COMPANY_ID = '01930000-0000-7000-8000-00000000abcd';

  const MAINTENANCE_ROLES: Role[] = [
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
  ];

  const NON_MAINTENANCE_ROLES: Role[] = [
    'SYSTEM_ADMIN',
    'MANAGER',
    'COMMUNITY_REPRESENTATIVE',
  ];

  it.each(MAINTENANCE_ROLES)(
    'passes for %s with a supplied maintenanceCompanyId',
    (role) => {
      expect(() => assertCompanyMatchesRole(role, COMPANY_ID)).not.toThrow();
    },
  );

  it.each(MAINTENANCE_ROLES)(
    'throws InvalidMaintenanceCompanyAssignmentError for %s with no maintenanceCompanyId',
    (role) => {
      expect(() => assertCompanyMatchesRole(role, null)).toThrow(
        InvalidMaintenanceCompanyAssignmentError,
      );
    },
  );

  it.each(NON_MAINTENANCE_ROLES)(
    'passes for %s with no maintenanceCompanyId',
    (role) => {
      expect(() => assertCompanyMatchesRole(role, null)).not.toThrow();
    },
  );

  it.each(NON_MAINTENANCE_ROLES)(
    'throws InvalidMaintenanceCompanyAssignmentError for %s with a supplied maintenanceCompanyId',
    (role) => {
      expect(() => assertCompanyMatchesRole(role, COMPANY_ID)).toThrow(
        InvalidMaintenanceCompanyAssignmentError,
      );
    },
  );
});
