import type { Permission } from '../../../../shared/application/authorization/permission';
import type { Role } from '../../../users/domain/role';
import { RolePermissionChecker } from './role-permission.checker';

// design.md Decision 5: ROLE_PERMISSIONS is an exhaustive Record<Role,
// Permission[]> — SYSTEM_ADMIN is the only operational role in this slice,
// the other 4 are declared but MUST be denied on every permission (not
// merely "not explicitly granted" — the table-driven matrix below proves it
// for every Role x Permission combination, not just a sample).
//
// community:* permissions (PR 3, community/authorization spec "Permission
// Check on Community and Assignment Endpoints"): SYSTEM_ADMIN is the only
// role permitted on any /communities or assignment sub-resource route; the
// other 4 roles stay [] even though COMMUNITY_REPRESENTATIVE and
// MAINTENANCE_TECHNICIAN are the domain concepts these routes manage —
// holding an assignment grants no permission.
//
// maintenanceCompany:* permissions (PR 4, authorization/spec.md "Permission
// Check on Maintenance Company Endpoints" + "Maintenance-Role Permissions
// Stay Inert"): SYSTEM_ADMIN is the only role permitted on any
// /maintenance-companies route. MAINTENANCE_COMPANY_MANAGER and
// MAINTENANCE_TECHNICIAN stay [] — holding a `maintenanceCompanyId` MUST NOT
// grant either role any API permission, including on the very resource the
// id references. The exhaustive matrix below (every NON_ADMIN_ROLES x
// ALL_PERMISSIONS pair) is the non-escalation regression test.
describe('RolePermissionChecker', () => {
  const checker = new RolePermissionChecker();

  const ALL_PERMISSIONS: Permission[] = [
    'user:create',
    'user:read',
    'user:update',
    'user:delete',
    'community:create',
    'community:read',
    'community:update',
    'community:delete',
    'community:assign',
    'maintenanceCompany:create',
    'maintenanceCompany:read',
    'maintenanceCompany:update',
    'maintenanceCompany:delete',
  ];

  const NON_ADMIN_ROLES: Role[] = [
    'MANAGER',
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ];

  it.each(ALL_PERMISSIONS)('allows SYSTEM_ADMIN on %s', (permission) => {
    expect(checker.can('SYSTEM_ADMIN', permission)).toBe(true);
  });

  it.each(
    NON_ADMIN_ROLES.flatMap((role) =>
      ALL_PERMISSIONS.map((permission): [Role, Permission] => [
        role,
        permission,
      ]),
    ),
  )('denies %s on %s', (role, permission) => {
    expect(checker.can(role, permission)).toBe(false);
  });
});
