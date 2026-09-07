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
  SYSTEM_ADMIN: [
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
    'inspectableElement:create',
    'inspectableElement:read',
    'inspectableElement:update',
    'inspectableElement:delete',
    'checklistQuestion:create',
    'checklistQuestion:read',
    'checklistQuestion:update',
    'checklistQuestion:delete',
    'reviewTemplate:create',
    'reviewTemplate:read',
    'reviewTemplate:update',
    'reviewTemplate:delete',
    'reviewTemplate:activate',
  ],
  // Declared per ADR-011, NOT operational in this slice — intentionally
  // empty, not forgotten. The exhaustive Record forces future slices to
  // fill these in when the role becomes operational.
  //
  // authorization/spec.md "Maintenance-Role Permissions Stay Inert": holding
  // a maintenanceCompanyId MUST NOT grant MAINTENANCE_COMPANY_MANAGER any
  // API permission. Stays [] here, unchanged by this slice.
  MANAGER: [],
  MAINTENANCE_COMPANY_MANAGER: [],
  // review-session/authorization spec "Technician and Representative Become
  // Operational" (design.md Decision 10): the first time either role maps
  // to anything other than []. Both get the IDENTICAL reviewSession:* set —
  // they perform sessions through the same flow — and nothing else. Holding
  // these grants nothing on a community without also passing the
  // resource-scope check (CommunityScopeChecker, application/authorization).
  MAINTENANCE_TECHNICIAN: [
    'reviewSession:create',
    'reviewSession:read',
    'reviewSession:perform',
    'reviewSession:complete',
    'reviewSession:discard',
  ],
  COMMUNITY_REPRESENTATIVE: [
    'reviewSession:create',
    'reviewSession:read',
    'reviewSession:perform',
    'reviewSession:complete',
    'reviewSession:discard',
  ],
};

@Injectable()
export class RolePermissionChecker implements PermissionChecker {
  can(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(permission);
  }
}
