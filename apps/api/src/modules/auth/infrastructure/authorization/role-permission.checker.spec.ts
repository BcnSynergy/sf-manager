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
//
// inspectableElement:* permissions (PR 4, inspectable-elements/authorization
// spec.md "Permission Check on Inspectable Element Endpoints"): SYSTEM_ADMIN
// is the only role permitted on any
// /communities/:communityId/inspectable-elements route; the other 4 roles
// stay [].
//
// checklistQuestion:* permissions (checklist-management PR 4,
// authorization/spec.md "Permission Check on Checklist Question Endpoints"
// + "Non-Admin Roles Remain Inert After the Checklist Permissions Are
// Added"): SYSTEM_ADMIN is the only role permitted on any
// /checklist-questions route; the other 4 roles stay [].
//
// reviewTemplate:* permissions (checklist-management PR 9, tasks.md 8.9,
// authorization/spec.md "Permission Check on Review Template Endpoints" +
// "No Standalone Retire Permission"): SYSTEM_ADMIN is the only role
// permitted on any /review-templates route, including activate; the other
// 4 roles stay []. No `reviewTemplate:retire` permission is declared here
// or anywhere — retirement is only ever a side effect of activation.
//
// reviewSession:* permissions (review-session PR 2, authorization/spec.md
// "Technician and Representative Become Operational"): the first time
// either MAINTENANCE_TECHNICIAN or COMMUNITY_REPRESENTATIVE maps to
// anything other than []. Both roles get the IDENTICAL set — they perform
// sessions through the same flow — and gain nothing else (no user:*,
// community:*, etc). SYSTEM_ADMIN and MANAGER are unchanged by this slice.
//
// review-history-company-scope PR 4 (authorization/spec.md "The Maintenance
// Company Manager Becomes Operational", "The Company Association Itself
// Confers No Permission"): MAINTENANCE_COMPANY_MANAGER gains its first
// non-empty entry, exactly `['reviewSession:read']` — read-only, no other
// reviewSession:* member and no other permission family. MANAGER and
// SYSTEM_ADMIN stay exactly as before.
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
  ];

  const REVIEW_SESSION_PERMISSIONS: Permission[] = [
    'reviewSession:create',
    'reviewSession:read',
    'reviewSession:perform',
    'reviewSession:complete',
    'reviewSession:discard',
  ];

  const REVIEW_SESSION_WRITE_PERMISSIONS: Permission[] =
    REVIEW_SESSION_PERMISSIONS.filter(
      (permission) => permission !== 'reviewSession:read',
    );

  // Non-admin roles that remain fully inert — no permission of any kind,
  // including reviewSession:*.
  const INERT_NON_ADMIN_ROLES: Role[] = ['MANAGER'];

  // The two roles activated on the review-session surface only.
  const REVIEW_SESSION_ROLES: Role[] = [
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ];

  // MAINTENANCE_COMPANY_MANAGER: the first entry with exactly one
  // permission — reviewSession:read — never bundled with the fully inert
  // roles nor with the two full-access performing roles.
  const COMPANY_MANAGER_ROLE: Role = 'MAINTENANCE_COMPANY_MANAGER';

  const NON_ADMIN_ROLES: Role[] = [
    ...INERT_NON_ADMIN_ROLES,
    ...REVIEW_SESSION_ROLES,
    COMPANY_MANAGER_ROLE,
  ];

  it.each(ALL_PERMISSIONS)('allows SYSTEM_ADMIN on %s', (permission) => {
    expect(checker.can('SYSTEM_ADMIN', permission)).toBe(true);
  });

  // SYSTEM_ADMIN's row is unchanged by this slice — it gains no
  // reviewSession:* permission (authorization/spec.md "SYSTEM_ADMIN's
  // permissions are unchanged").
  it.each(REVIEW_SESSION_PERMISSIONS)(
    'denies SYSTEM_ADMIN on %s',
    (permission) => {
      expect(checker.can('SYSTEM_ADMIN', permission)).toBe(false);
    },
  );

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

  // authorization/spec.md "MANAGER stays mapped to no permissions": MANAGER
  // gets nothing, including reviewSession:*.
  it.each(
    INERT_NON_ADMIN_ROLES.flatMap((role) =>
      REVIEW_SESSION_PERMISSIONS.map((permission): [Role, Permission] => [
        role,
        permission,
      ]),
    ),
  )('denies %s on %s', (role, permission) => {
    expect(checker.can(role, permission)).toBe(false);
  });

  // authorization/spec.md "The Maintenance Company Manager Becomes
  // Operational" — the manager holds exactly one permission.
  it('grants MAINTENANCE_COMPANY_MANAGER exactly reviewSession:read', () => {
    expect(checker.can(COMPANY_MANAGER_ROLE, 'reviewSession:read')).toBe(true);
  });

  // "The manager gains no write member of the review-session family": no
  // create/perform/complete/discard.
  it.each(REVIEW_SESSION_WRITE_PERMISSIONS)(
    'denies MAINTENANCE_COMPANY_MANAGER on %s',
    (permission) => {
      expect(checker.can(COMPANY_MANAGER_ROLE, permission)).toBe(false);
    },
  );

  // authorization/spec.md "Both performing roles hold the same
  // review-session permissions": MAINTENANCE_TECHNICIAN and
  // COMMUNITY_REPRESENTATIVE are granted the identical reviewSession:*
  // family, and nothing else.
  it.each(
    REVIEW_SESSION_ROLES.flatMap((role) =>
      REVIEW_SESSION_PERMISSIONS.map((permission): [Role, Permission] => [
        role,
        permission,
      ]),
    ),
  )('allows %s on %s', (role, permission) => {
    expect(checker.can(role, permission)).toBe(true);
  });

  // authorization/spec.md "The performing roles gain nothing else": no
  // review-session-role entry contains any permission outside the
  // reviewSession:* family.
  it.each(REVIEW_SESSION_ROLES)(
    '%s gains no permission outside reviewSession:*',
    (role) => {
      for (const permission of ALL_PERMISSIONS) {
        expect(checker.can(role, permission)).toBe(false);
      }
    },
  );

  // authorization/spec.md "No Standalone Retire Permission": no
  // `reviewTemplate:retire` permission MUST exist anywhere in the
  // `Permission` union.
  it('does not grant SYSTEM_ADMIN a reviewTemplate:retire permission (no such permission exists)', () => {
    expect(
      checker.can(
        'SYSTEM_ADMIN',
        'reviewTemplate:retire' as unknown as Permission,
      ),
    ).toBe(false);
  });
});
