# Authorization

## Purpose

Role-based access control over authenticated requests. Introduces the
full 5-role `Role` enum (ADR-011) but only `SYSTEM_ADMIN` is
operational in this slice — the other 4 roles are declared and MUST
be rejected wherever role-based checks apply. Composes with, and runs
after, the existing `authentication` guard.

## Requirements

### Requirement: Role Enum Declaration

The system MUST define a `Role` enum with exactly 5 values:
`SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`. Every `User`
MUST have exactly one `role`.

#### Scenario: All 5 roles are assignable at creation
- GIVEN an admin creates a user
- WHEN they submit any of the 5 declared roles
- THEN the user MUST be created with that role, regardless of whether the role is operational

### Requirement: Permission Check on Protected Endpoints

The system MUST check the caller's role before allowing access to any
`/users` endpoint. Only `SYSTEM_ADMIN` MUST be permitted; the other 4
roles MUST be rejected even though they are valid enum values.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/users` endpoint
- THEN the request MUST proceed to the endpoint's own logic (not blocked by the permission check)

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/users` endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/users` endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute (authentication is evaluated first)

### Requirement: Permission Check Order

The system MUST evaluate authentication before authorization: a
request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403).

#### Scenario: Missing session takes precedence over role
- GIVEN a request to a `/users` endpoint with no valid access-token cookie
- WHEN the request is processed
- THEN the response MUST be 401, not 403

### Requirement: Permission Check on Community and Assignment Endpoints

The system MUST check the caller's role before allowing access to any
`/communities` endpoint and any of its representative/technician
assignment sub-resource endpoints. Only `SYSTEM_ADMIN` MUST be
permitted; the other 4 roles MUST be rejected even though they are
valid enum values. Authentication MUST be evaluated before this
check: a request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403). The
new permissions are additive to the `Permission` union and are
granted only on the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`; the
other 4 roles (`MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`) remain `[]` —
holding an active community assignment grants no permission.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the response MUST be 403, regardless of any active community assignment the caller may hold

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: Permission Check on Maintenance Company Endpoints

The system MUST check the caller's role before allowing access to any
`/maintenance-companies` endpoint. Only `SYSTEM_ADMIN` MUST be
permitted; the other 4 roles MUST be rejected even though
`MAINTENANCE_COMPANY_MANAGER`/`MAINTENANCE_TECHNICIAN` users may hold
a `maintenanceCompanyId` referencing the very resource being
accessed. Authentication MUST be evaluated before this check: a
request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403). The
`Permission` union gains `maintenanceCompany:create`,
`maintenanceCompany:read`, `maintenanceCompany:update`, and
`maintenanceCompany:delete`, granted only on the `SYSTEM_ADMIN` row of
`ROLE_PERMISSIONS`.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/maintenance-companies` endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected, including a maintenance-role holder
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/maintenance-companies` endpoint
- THEN the response MUST be 403, regardless of whether that caller's own `maintenanceCompanyId` matches the resource being accessed

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/maintenance-companies` endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: Maintenance-Role Permissions Stay Inert

Holding a `maintenanceCompanyId` MUST NOT grant `MAINTENANCE_COMPANY_MANAGER`
or `MAINTENANCE_TECHNICIAN` any API permission. After this change,
`ROLE_PERMISSIONS` MUST still map both roles to `[]`, identical to
their mapping before `User.maintenanceCompanyId` existed — this
slice stores and edits the company id only; it activates none of
ADR-011's scoped-permission behavior for either role.

#### Scenario: Maintenance roles remain permission-less after gaining a company
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` user has a valid `maintenanceCompanyId` set
- WHEN their `ROLE_PERMISSIONS` entry is inspected
- THEN it MUST equal `[]`, identical to a user of that role with no `maintenanceCompanyId`

#### Scenario: A maintenance-role user cannot access any endpoint via their company association
- GIVEN an authenticated caller with role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN they call any permission-gated endpoint, including `/maintenance-companies` and `/users`
- THEN the response MUST be 403 for all of them, the same as before this slice

### Requirement: Permission Check on Inspectable Element Endpoints

The system MUST check the caller's role before allowing access to any
`/communities/:communityId/inspectable-elements` endpoint. Only
`SYSTEM_ADMIN` MUST be permitted; the other 4 roles MUST be rejected.
Authentication MUST be evaluated before this check: a request without
a valid session MUST receive 401 even if the requested action would
otherwise require role rejection (403). The `Permission` union gains
`inspectableElement:create`, `inspectableElement:read`,
`inspectableElement:update`, and `inspectableElement:delete`, granted
only on the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call an inspectable-elements endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call an inspectable-elements endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls an inspectable-elements endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

#### Scenario: Non-admin roles stay mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the entries for `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, and `COMMUNITY_REPRESENTATIVE` are read
- THEN each MUST equal `[]`, with no `inspectableElement:*` permission granted to any of them

### Requirement: Permission Check on Checklist Question Endpoints

The system MUST check the caller's role before allowing access to any
`/checklist-questions` endpoint. Only `SYSTEM_ADMIN` MUST be permitted;
the other 4 roles MUST be rejected. Authentication MUST be evaluated
before this check: a request without a valid session MUST receive 401
even if the requested action would otherwise require role rejection
(403). The `Permission` union gains `checklistQuestion:create`,
`checklistQuestion:read`, `checklistQuestion:update`, and
`checklistQuestion:delete`, granted only on the `SYSTEM_ADMIN` row of
`ROLE_PERMISSIONS`.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a checklist-questions endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a checklist-questions endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a checklist-questions endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: Permission Check on Review Template Endpoints

The system MUST check the caller's role before allowing access to any
`/review-templates` endpoint, including the question-selection and
activation actions. Only `SYSTEM_ADMIN` MUST be permitted; the other 4
roles MUST be rejected, and unauthenticated callers MUST receive 401
before the role check runs. The `Permission` union gains
`reviewTemplate:create`, `reviewTemplate:read`, `reviewTemplate:update`,
`reviewTemplate:delete`, and `reviewTemplate:activate`, granted only on
the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`. `reviewTemplate:activate`
MUST be a distinct permission from `reviewTemplate:update`, mirroring
`community:assign`, because activation is an irreversible state
transition with a side effect on a sibling version — not an ordinary
edit.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a review-templates endpoint, including the activate action
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a review-templates endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a review-templates endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

#### Scenario: Activate requires its own permission
- GIVEN the activate endpoint's permission requirement is inspected
- WHEN it is compared to the update endpoint's
- THEN activate MUST require `reviewTemplate:activate`, not `reviewTemplate:update`

### Requirement: No Standalone Retire Permission

The system MUST NOT introduce any permission that authorizes retiring a
review template. Retirement MUST occur only as a side effect of
`reviewTemplate:activate`.

#### Scenario: No retire permission exists
- GIVEN the `Permission` union is inspected after this change
- WHEN it is searched for a retire permission
- THEN none MUST exist

### Requirement: Non-Admin Roles Remain Inert After the Checklist Permissions Are Added

The system MUST keep `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` mapped to `[]`
in `ROLE_PERMISSIONS`. No `checklistQuestion:*` or `reviewTemplate:*`
permission MUST be granted to any of them, and
`PermissionChecker.can`'s signature MUST be unchanged — this change is
additive and non-breaking. In particular, `MANAGER` MUST NOT receive
checklist-content permissions in this slice: the
`MANAGE_CHECKLIST_CONTENT` capability depends on
`User.managerCapabilities`, which is deliberately not built here.

#### Scenario: Non-admin roles stay mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the entries for the four non-admin roles are read
- THEN each MUST equal `[]`

#### Scenario: No manager capability mechanism is introduced
- GIVEN the shipped user model and authorization code are inspected
- WHEN they are searched for `managerCapabilities` or `MANAGE_CHECKLIST_CONTENT`
- THEN neither MUST exist
