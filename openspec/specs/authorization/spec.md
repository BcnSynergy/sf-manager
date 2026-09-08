# Authorization

## Purpose

Role-based access control over authenticated requests. Introduces the
full 5-role `Role` enum (ADR-011). `SYSTEM_ADMIN` is operational across
every administrative surface. `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE` are additionally operational, but **only** on
the review-session surface, subject to a second, composable dimension —
a **resource-scope** rule requiring an active community assignment in
addition to the role/permission check. `MANAGER` and
`MAINTENANCE_COMPANY_MANAGER` remain fully inert — declared but rejected
wherever role-based checks apply. Composes with, and runs after, the
existing `authentication` guard.

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
`community:*` permissions are granted only on the `SYSTEM_ADMIN` row of
`ROLE_PERMISSIONS`; no other role MUST hold any of them — holding an
active community assignment grants no `community:*` permission, and
confers access only within the review-session surface (see *Resource
Scope — an Active Assignment Is Required Beyond the Permission*).

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

#### Scenario: No role but SYSTEM_ADMIN holds a community permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN every non-`SYSTEM_ADMIN` entry is read
- THEN none MUST contain any `community:*` permission

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

Holding a `maintenanceCompanyId` MUST NOT grant
`MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` any API
permission. `MAINTENANCE_COMPANY_MANAGER` MUST still map to `[]`.
`MAINTENANCE_TECHNICIAN` now maps to the `reviewSession:*` permissions
(see *Technician and Representative Become Operational*), but that grant
MUST derive **solely** from the role's review-session activation and
active community assignments — never from the company association. A
technician's `maintenanceCompanyId` MUST have no effect on any
authorization decision.

#### Scenario: The company manager role remains permission-less
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` user has a valid `maintenanceCompanyId` set
- WHEN their `ROLE_PERMISSIONS` entry is inspected
- THEN it MUST equal `[]`, identical to a user of that role with no `maintenanceCompanyId`

#### Scenario: A technician's permissions do not depend on their company
- GIVEN two `MAINTENANCE_TECHNICIAN` users, one with a `maintenanceCompanyId` and one without
- WHEN their `ROLE_PERMISSIONS` entries are compared
- THEN they MUST be identical

#### Scenario: A maintenance-role user cannot access company or user endpoints via their association
- GIVEN an authenticated caller with role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN they call `/maintenance-companies` or `/users`
- THEN the response MUST be 403 for all of them, the same as before this slice

#### Scenario: The company association grants no review-session scope
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, but who holds no active technician assignment to C
- WHEN they call a review-session endpoint for C
- THEN the request MUST be refused

### Requirement: Permission Check on Inspectable Element Endpoints

The system MUST check the caller's role before allowing access to any
`/communities/:communityId/inspectable-elements` endpoint. Only
`SYSTEM_ADMIN` MUST be permitted; the other 4 roles MUST be rejected.
Authentication MUST be evaluated before this check: a request without
a valid session MUST receive 401 even if the requested action would
otherwise require role rejection (403). The `Permission` union declares
`inspectableElement:create`, `inspectableElement:read`,
`inspectableElement:update`, and `inspectableElement:delete`, granted
only on the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`. Decommissioning and
reactivating an element MUST reuse `inspectableElement:update` — no new
permission MUST be introduced for it. Resolving an element by `code`
during a review session is **not** governed by this family: it is part of
the review-session surface and requires a `reviewSession:*` permission
plus community scope.

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

#### Scenario: No non-admin role holds an inspectableElement permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the entries for `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, and `COMMUNITY_REPRESENTATIVE` are read
- THEN none MUST contain any `inspectableElement:*` permission

#### Scenario: Decommission reuses the update permission
- GIVEN the decommission and reactivate endpoints' permission requirements
- WHEN they are inspected
- THEN each MUST require `inspectableElement:update`, and no new element permission MUST have been declared

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

The system MUST keep `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` mapped
to `[]` in `ROLE_PERMISSIONS`. No `checklistQuestion:*` or
`reviewTemplate:*` permission MUST be granted to **any** non-admin role,
including `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE`, whose
entries hold `reviewSession:*` members only. A session reads a template's
frozen snapshot through the review-session surface, never through a
template permission. In particular, `MANAGER` MUST NOT receive
checklist-content permissions: the `MANAGE_CHECKLIST_CONTENT` capability
depends on `User.managerCapabilities`, which is deliberately not built.
`PermissionChecker.can`'s signature MUST be unchanged — this change is
additive and non-breaking.

#### Scenario: The two inert roles stay mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN each MUST equal `[]`

#### Scenario: No non-admin role holds a checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN all four non-admin entries are read
- THEN none MUST contain a `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: No manager capability mechanism is introduced
- GIVEN the shipped user model and authorization code are inspected
- WHEN they are searched for `managerCapabilities` or `MANAGE_CHECKLIST_CONTENT`
- THEN neither MUST exist

### Requirement: Permission Check on Review Session Endpoints

The system MUST check the caller's role before allowing access to any
review-session endpoint — opening, reading, resuming, resolving a code,
recording answers, marking an element unreviewed, discarding and
completing. The `Permission` union MUST gain a `reviewSession:*` family
covering those actions, and **every** review-session endpoint MUST require
one of them; none MUST be reachable on authentication alone. Which exact
members the family declares is a design call; that every endpoint is
gated by one is not. Authentication MUST be evaluated first: a request
without a valid session MUST receive 401 even when the action would
otherwise be rejected for role or scope.

#### Scenario: Every review-session endpoint declares a permission requirement
- GIVEN the review-session endpoints after this change
- WHEN each one's permission metadata is inspected
- THEN every endpoint MUST require a `reviewSession:*` permission, with no exception

#### Scenario: A permitted role proceeds to the endpoint's own logic
- GIVEN an authenticated `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a review-session endpoint
- THEN the role/permission check MUST pass and the request MUST proceed to the endpoint's own logic and scope check

#### Scenario: A role without the permission is rejected
- GIVEN an authenticated caller whose role holds no `reviewSession:*` permission
- WHEN they call any review-session endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any review-session endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: Technician and Representative Become Operational

The system MUST grant the `reviewSession:*` permissions to
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` in
`ROLE_PERMISSIONS` — the first time either role maps to anything other
than `[]`. Both roles MUST receive the **same** review-session permission
set, because both perform sessions through the identical flow. Neither
MUST receive any other permission family. `MANAGER` and
`MAINTENANCE_COMPANY_MANAGER` MUST remain `[]`. `SYSTEM_ADMIN`'s row MUST
be unchanged by this slice — it MUST NOT gain any `reviewSession:*`
permission. The table MUST remain an exhaustive `Record<Role,
Permission[]>`, and `PermissionChecker.can(role, permission)`'s signature
MUST be unchanged: the scope dimension is added beside it, not inside it.

#### Scenario: Both performing roles hold the same review-session permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are read
- THEN each MUST be non-empty and MUST contain exactly the same `reviewSession:*` members

#### Scenario: The performing roles gain nothing else
- GIVEN the two performing roles' entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: The two remaining non-admin roles stay inert
- GIVEN `ROLE_PERMISSIONS` after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN each MUST equal `[]`

#### Scenario: SYSTEM_ADMIN's permissions are unchanged
- GIVEN the `SYSTEM_ADMIN` entry before and after this change
- WHEN they are compared
- THEN they MUST be identical, with no `reviewSession:*` member added

#### Scenario: The permission table stays exhaustive
- GIVEN a new `Role` value were added to the enum without a `ROLE_PERMISSIONS` entry
- WHEN the project is type-checked
- THEN the build MUST fail

#### Scenario: The permission checker's signature is unchanged
- GIVEN `PermissionChecker.can` before and after this change
- WHEN its signature is compared
- THEN it MUST still take a role and a permission and MUST NOT take a resource

### Requirement: Resource Scope — an Active Assignment Is Required Beyond the Permission

Holding a `reviewSession:*` permission MUST grant **nothing** on a
community the caller is not **actively assigned** to. Scope MUST be
evaluated in addition to, never instead of, the role/permission check, and
MUST apply to **every** review-session endpoint without exception —
including reads and resumes, not only writes.

Scope resolution MUST use the caller's own assignment kind: a
`MAINTENANCE_TECHNICIAN` through their active community-technician
assignment, a `COMMUNITY_REPRESENTATIVE` through their active
community-representative assignment. An assignment that has been
deactivated (`deactivatedAt` set) MUST NOT confer scope, and the loss MUST
take effect on the caller's next request — no grace period, no cached
grant.

The rejection for an out-of-scope target MUST NOT disclose whether that
**session or element** exists. It MUST use the same status and the same
error code and message as a request naming a session or element that does
not exist at all, uniformly across every endpoint that identifies a
session or an element.

**Exception, confirmed with the product owner (2026-09-06):** the
`communityId` supplied when opening a new session is not subject to this
indistinguishability rule. The caller already asserts that community by
naming it, so a distinguishing rejection leaks nothing the caller did not
already supply — this endpoint MAY use a single, distinctive rejection for
"this community does not exist or you are not assigned to it" (the two
cases MAY also be indistinguishable from each other, but need not be
indistinguishable from "assigned"). This exception is scoped to the
community identifier on session creation only; it does not extend to
`sessionId` or element `code`, which remain fully covered by the rule
above.

#### Scenario: An unassigned holder of the permission is refused
- GIVEN an authenticated `MAINTENANCE_TECHNICIAN` who holds `reviewSession:*` but has no active assignment to community C
- WHEN they attempt to open, read, resume, record against, discard or complete a session for C
- THEN every one of those requests MUST be refused and MUST perform no write

#### Scenario: Refusal is proven on every endpoint, not a sample
- GIVEN the full list of review-session endpoints after this change
- WHEN a correctly authenticated but unassigned caller exercises them
- THEN each endpoint individually MUST refuse — one assertion per endpoint

#### Scenario: A representative's scope comes from their own assignment kind
- GIVEN a `COMMUNITY_REPRESENTATIVE` with an active representative assignment to community C and none to community D
- WHEN they act on C and then on D
- THEN the C request MUST be permitted and the D request MUST be refused

#### Scenario: Deactivating an assignment removes access on the next request
- GIVEN a technician actively assigned to community C successfully reads a session for C
- WHEN their assignment is deactivated and they repeat the same request
- THEN the request MUST now be refused

#### Scenario: An out-of-scope session or element is indistinguishable from a non-existent one
- GIVEN an authorized caller not assigned to community C
- WHEN they name a real session or element belonging to C, and separately name a session or element id/code that does not exist anywhere
- THEN both responses MUST have the identical status, error code and message

#### Scenario: An unassigned or nonexistent community, on open, need not be indistinguishable from "assigned"
- GIVEN an authorized caller opening a new session
- WHEN they name a community that does not exist, and separately a community that exists but they are not assigned to
- THEN both MAY return the same distinctive rejection for "not in scope" — this endpoint is exempt from the indistinguishability rule (see above), unlike every session/element-identifying endpoint

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN a caller who is actively assigned to community C but whose role holds no `reviewSession:*` permission
- WHEN they call a review-session endpoint for C
- THEN the response MUST be 403 — the assignment MUST NOT substitute for the permission

#### Scenario: The scope check cannot be silently omitted
- GIVEN the review-session endpoints and their use cases
- WHEN the scope check's application is inspected
- THEN it MUST be applied through a single shared mechanism rather than an independently repeated per-endpoint call that an author can forget

### Requirement: Assignments Confer No Permission Outside the Review-Session Surface

An active community assignment MUST remain permission-less everywhere
except the review-session surface. It MUST NOT grant a technician or
representative any access to `/users`, `/communities`, its assignment
sub-resources, `/maintenance-companies`, `/checklist-questions`,
`/review-templates`, or the inspectable-element admin endpoints.

#### Scenario: An assigned technician still cannot reach admin endpoints
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C
- WHEN they call any `/users`, `/communities`, `/maintenance-companies`, `/checklist-questions`, `/review-templates` or inspectable-element endpoint, including ones concerning C
- THEN every response MUST be 403

#### Scenario: An assigned representative still cannot reach admin endpoints
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C
- WHEN they call the same set of endpoints
- THEN every response MUST be 403
