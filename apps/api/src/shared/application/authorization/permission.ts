// design.md Decision 5 / Interfaces: the exhaustive set of permissions a
// role can be granted. Consumed by RolePermissionChecker's
// Record<Role, Permission[]> table (PR 3) and by @RequirePermission
// (shared/presentation/decorators/require-permission.decorator.ts).
export type Permission =
  'user:create' | 'user:read' | 'user:update' | 'user:delete';
