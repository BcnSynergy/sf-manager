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
//
// inspectableElement:* — inspectable-elements/authorization spec "Permission
// Check on Inspectable Element Endpoints" (PR 4): governs every
// /communities/:communityId/inspectable-elements route. Four separate
// permissions rather than one, mirroring community:*/maintenanceCompany:*'s
// granularity (design.md Decision 8), so a future MANAGER slice can grant
// read without granting delete. All four are granted only on the
// SYSTEM_ADMIN row of ROLE_PERMISSIONS.
//
// checklistQuestion:* — checklist-management/authorization spec "Permission
// Check on Checklist Question Endpoints" (PR 4): governs every
// /checklist-questions route. Four separate permissions, mirroring
// inspectableElement:*'s granularity (design.md Decision 8). All four are
// granted only on the SYSTEM_ADMIN row of ROLE_PERMISSIONS.
//
// reviewTemplate:* — checklist-management/authorization spec "Permission
// Check on Review Template Endpoints" (PR 9, tasks.md 8.9): governs every
// /review-templates route, including the question-selection and activation
// actions. Five permissions — `reviewTemplate:activate` is kept separate
// from `reviewTemplate:update`, mirroring `community:assign`, because
// activation is an irreversible state transition with a side effect on a
// sibling version, not an ordinary edit (design.md Decision 8). There is
// deliberately NO `reviewTemplate:retire` permission — retirement is never
// a standalone action, only an automatic side effect of activating a
// successor (authorization spec "No Standalone Retire Permission"). All
// five are granted only on the SYSTEM_ADMIN row of ROLE_PERMISSIONS.
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
  | 'maintenanceCompany:delete'
  | 'inspectableElement:create'
  | 'inspectableElement:read'
  | 'inspectableElement:update'
  | 'inspectableElement:delete'
  | 'checklistQuestion:create'
  | 'checklistQuestion:read'
  | 'checklistQuestion:update'
  | 'checklistQuestion:delete'
  | 'reviewTemplate:create'
  | 'reviewTemplate:read'
  | 'reviewTemplate:update'
  | 'reviewTemplate:delete'
  | 'reviewTemplate:activate';
