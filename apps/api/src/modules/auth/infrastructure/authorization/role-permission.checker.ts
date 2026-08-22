import { Injectable } from '@nestjs/common';
import type { Permission } from '../../../../shared/application/authorization/permission';
import type { Role } from '../../../users/domain/role';
import type { PermissionChecker } from '../../application/ports/permission-checker.port';

// design.md Decision 5 / Interfaces: exhaustive by construction — every Role
// key is declared, so adding a 6th role or a new Permission fails the build
// until every role is explicitly considered. Only SYSTEM_ADMIN is
// operational in this slice; the other 4 map to [] with an explicit comment
// (not omitted) so the emptiness reads as intentional, not forgotten.
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SYSTEM_ADMIN: ['user:create', 'user:read', 'user:update', 'user:delete'],
  // Declared per ADR-011, NOT operational in this slice — intentionally
  // empty, not forgotten. The exhaustive Record forces future slices to
  // fill these in when the role becomes operational.
  MANAGER: [],
  MAINTENANCE_COMPANY_MANAGER: [],
  MAINTENANCE_TECHNICIAN: [],
  COMMUNITY_REPRESENTATIVE: [],
};

@Injectable()
export class RolePermissionChecker implements PermissionChecker {
  can(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(permission);
  }
}
