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
export type Permission =
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'community:create'
  | 'community:read'
  | 'community:update'
  | 'community:delete'
  | 'community:assign';
