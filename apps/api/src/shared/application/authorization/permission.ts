// design.md Decision 5 / Interfaces: the exhaustive set of permissions a
// role can be granted. Consumed by RolePermissionChecker's
// Record<Role, Permission[]> table (PR 3) and by @RequirePermission
// (shared/presentation/decorators/require-permission.decorator.ts).
//
// community:* — community/authorization spec "Permission Check on Community
// and Assignment Endpoints" (PR 3): governs every /communities route and its
// representative/technician assignment sub-resources. `community:assign` is
// kept separate from `community:update` so a future slice can grant
// assignment without granting attribute edits or deletion (design.md File
// Changes note).
//
// maintenanceCompany:* — maintenance-company/authorization spec "Permission
// Check on Maintenance Company Endpoints" (PR 4): governs every
// /maintenance-companies route. Four separate permissions rather than one,
// mirroring community:*'s granularity, so a future slice (e.g. a MANAGER
// with managerCapabilities) can grant read without granting delete
// (design.md Routes). All four are granted only on the SYSTEM_ADMIN row of
// ROLE_PERMISSIONS — see "Maintenance-Role Permissions Stay Inert".
export type Permission =
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'community:create'
  | 'community:read'
  | 'community:update'
  | 'community:delete'
  | 'community:assign'
  | 'maintenanceCompany:create'
  | 'maintenanceCompany:read'
  | 'maintenanceCompany:update'
  | 'maintenanceCompany:delete';
