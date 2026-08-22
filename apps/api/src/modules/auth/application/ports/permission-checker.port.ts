import type { Permission } from '../../../../shared/application/authorization/permission';
import type { Role } from '../../../users/domain/role';

// Port (application layer, ADR-002/013). Concrete adapter: RolePermissionChecker
// (infrastructure/authorization/role-permission.checker.ts), backed by a static
// Record<Role, Permission[]> table (design.md Decision 5) — no DB read, since
// `role` is signed into the JWT.
export interface PermissionChecker {
  can(role: Role, permission: Permission): boolean;
}

export const PERMISSION_CHECKER = Symbol('PERMISSION_CHECKER');
