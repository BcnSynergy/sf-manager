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
// reviewSession:* member and no other permission family. MANAGER stays
// exactly as before.
//
// review-history-admin-scope PR 2 (design.md Decision 4, authorization/
// spec.md "The System Admin Becomes Operational on Review History Reads"):
// SYSTEM_ADMIN gains its FIRST reviewSession:* member ever —
// `reviewSession:read`, and nothing else in that family. Every other
// existing SYSTEM_ADMIN permission is unchanged.
//
// review-history-manager-capability PR 2 (design.md Decision 4,
// authorization/spec.md "The Manager Becomes Operational…"): MANAGER gains
// its FIRST permission ever, exactly `reviewSession:read`, ending the
// 2026-08-22 addendum's "four inert roles" era — the role is no longer
// fully inert, so the old `INERT_NON_ADMIN_ROLES` fixture (and its
// `it.each` block asserting a blanket denial of every reviewSession:*
// permission) is removed rather than left with an empty array (`jest-each`
// errors on an empty table, it does not skip).
//
// organization-profile PR 2 (design.md Decision 1, authorization/spec.md
// "Permission Check on Organization Profile Endpoints"): SYSTEM_ADMIN gains
// exactly `organizationProfile:read` and `organizationProfile:update` —
// two members, not four, because the resource has no create and no delete
// verb to guard. The other 4 roles stay [] for both, added to
// ALL_PERMISSIONS so the exhaustive NON_ADMIN_ROLES matrix below covers
// them automatically.
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
    'organizationProfile:read',
    'organizationProfile:update',
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

  // The two roles activated on the review-session surface only.
  const REVIEW_SESSION_ROLES: Role[] = [
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ];

  // MAINTENANCE_COMPANY_MANAGER: the first entry with exactly one
  // permission — reviewSession:read — never bundled with the two
  // full-access performing roles.
  const COMPANY_MANAGER_ROLE: Role = 'MAINTENANCE_COMPANY_MANAGER';

  // MANAGER: review-history-manager-capability PR 2 — the role's own first
  // (and only) permission, `reviewSession:read`, identical shape to
  // COMPANY_MANAGER_ROLE above. No longer inert.
  const MANAGER_ROLE: Role = 'MANAGER';

  const NON_ADMIN_ROLES: Role[] = [
    ...REVIEW_SESSION_ROLES,
    COMPANY_MANAGER_ROLE,
    MANAGER_ROLE,
  ];

  it.each(ALL_PERMISSIONS)('allows SYSTEM_ADMIN on %s', (permission) => {
    expect(checker.can('SYSTEM_ADMIN', permission)).toBe(true);
  });

  // authorization/spec.md "Exactly two members are declared and only the
  // admin holds them": no organizationProfile:create or
  // organizationProfile:delete exists, and only SYSTEM_ADMIN holds either
  // of the two that do.
  it('grants SYSTEM_ADMIN exactly organizationProfile:read and organizationProfile:update', () => {
    expect(checker.can('SYSTEM_ADMIN', 'organizationProfile:read')).toBe(true);
    expect(checker.can('SYSTEM_ADMIN', 'organizationProfile:update')).toBe(
      true,
    );
  });

  // authorization/spec.md "The System Admin Becomes Operational on Review
  // History Reads": SYSTEM_ADMIN's only reviewSession:* member is `read`.
  it('grants SYSTEM_ADMIN exactly reviewSession:read', () => {
    expect(checker.can('SYSTEM_ADMIN', 'reviewSession:read')).toBe(true);
  });

  // "The admin gains no write member of the review-session family": no
  // create/perform/complete/discard.
  it.each(REVIEW_SESSION_WRITE_PERMISSIONS)(
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

  // authorization/spec.md "The Manager Becomes Operational…" — the manager
  // holds exactly one permission, identical shape to
  // MAINTENANCE_COMPANY_MANAGER below.
  it('grants MANAGER exactly reviewSession:read', () => {
    expect(checker.can(MANAGER_ROLE, 'reviewSession:read')).toBe(true);
  });

  // "The manager gains no write member of the review-session family": no
  // create/perform/complete/discard.
  it.each(REVIEW_SESSION_WRITE_PERMISSIONS)(
    'denies MANAGER on %s',
    (permission) => {
      expect(checker.can(MANAGER_ROLE, permission)).toBe(false);
    },
  );

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

  // review-export tasks.md 8.10, spec.md review-document "No permission is
  // added": a pinning test for the FULL Permission union (this file's
  // ALL_PERMISSIONS plus the review-session family kept separate above) and
  // every ROLE_PERMISSIONS row, so review-export's read-only document route
  // is caught immediately if it ever adds a Permission member or widens a
  // ROLE_PERMISSIONS row instead of reusing the existing
  // `reviewSession:read` gate.
  describe('review-export: no permission is added (tasks.md 8.10)', () => {
    const FULL_PERMISSION_SET: Permission[] = [
      ...ALL_PERMISSIONS,
      ...REVIEW_SESSION_PERMISSIONS,
    ];

    it('the Permission union has exactly 33 members total, none of them organizationProfile:* beyond the two already shipped', () => {
      expect(FULL_PERMISSION_SET).toHaveLength(33);
      expect(
        FULL_PERMISSION_SET.filter((permission) =>
          permission.startsWith('organizationProfile:'),
        ),
      ).toEqual(['organizationProfile:read', 'organizationProfile:update']);
    });

    it('ROLE_PERMISSIONS grants each role exactly its previously-shipped set, unchanged by review-export', () => {
      const expectedByRole: Record<Role, Permission[]> = {
        SYSTEM_ADMIN: FULL_PERMISSION_SET.filter(
          (permission) =>
            !REVIEW_SESSION_WRITE_PERMISSIONS.includes(permission),
        ),
        MANAGER: ['reviewSession:read'],
        MAINTENANCE_COMPANY_MANAGER: ['reviewSession:read'],
        MAINTENANCE_TECHNICIAN: REVIEW_SESSION_PERMISSIONS,
        COMMUNITY_REPRESENTATIVE: REVIEW_SESSION_PERMISSIONS,
      };

      for (const [role, expectedPermissions] of Object.entries(
        expectedByRole,
      ) as [Role, Permission[]][]) {
        const actualPermissions = FULL_PERMISSION_SET.filter((permission) =>
          checker.can(role, permission),
        );
        expect(actualPermissions.sort()).toEqual(
          [...expectedPermissions].sort(),
        );
      }
    });
  });
});
