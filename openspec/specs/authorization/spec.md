# Authorization

## Purpose

Role-based access control over authenticated requests. Introduces the
full 5-role `Role` enum (ADR-011). `SYSTEM_ADMIN` is operational across
every administrative surface. `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE` are additionally operational, but **only** on
the review-session surface, subject to a second, composable dimension —
a **resource-scope** rule requiring an active community assignment in
addition to the role/permission check. The review **history** reads
(FR-008) are part of that same surface and are governed by the same
permission family, but the scope dimension now differs by role: a
representative's scope is their actively assigned communities; a
`MAINTENANCE_COMPANY_MANAGER`'s scope is their own maintenance company,
matched against the performing company frozen onto each session — the
first role whose resource scope is not a set of communities.
`MAINTENANCE_COMPANY_MANAGER` is operational on the review history reads
only, holding `reviewSession:read` alone. `SYSTEM_ADMIN` is additionally
operational on the review history reads, holding `reviewSession:read` as
well — the role's first `reviewSession:*` member ever. Its scope
dimension is unlike every other role's: it is not a set of communities,
not a maintenance company, and not a performer relation, but the whole
installation, with no scope predicate at all. No role is fully inert any
longer: `MANAGER` holds `reviewSession:read` too — the **fifth** role
operational on the review-history read surface, and the first whose
scope is decided not by its role alone, nor by an assignment or a
company, but by a per-user **capability** (`VIEW_ALL_REVIEWS` in
`User.managerCapabilities`, ADR-011 Decision 2) that a `SYSTEM_ADMIN`
grants and that is resolved fresh from the database on every request.
Granted, the scope is the whole installation, identical to
`SYSTEM_ADMIN`'s; ungranted, it reaches nothing. Composes with, and runs
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

### Requirement: The Company Association Itself Confers No Permission

Holding a `maintenanceCompanyId` MUST NOT, by itself, grant any user any
API permission. Permissions MUST derive solely from the caller's `role`:
a `MAINTENANCE_COMPANY_MANAGER` holds `reviewSession:read` because of its
role, identically whether or not it has a company association, and a
`MAINTENANCE_TECHNICIAN`'s permissions MUST be identical with and without
one. A technician's `maintenanceCompanyId` MUST have no effect on any
authorization decision at all.

For a `MAINTENANCE_COMPANY_MANAGER` the company association determines
**which** sessions the role's read permission reaches — never **whether**
the role holds a permission, and never any access outside the review
history surface.
(Previously: this requirement was named *Maintenance-Role Permissions
Stay Inert* and asserted that `MAINTENANCE_COMPANY_MANAGER` still maps to
`[]` and that a company association has no effect on any authorization
decision for either maintenance role.)

#### Scenario: The manager's permission set does not depend on its company
- GIVEN two `MAINTENANCE_COMPANY_MANAGER` users, one with a `maintenanceCompanyId` and one without
- WHEN their `ROLE_PERMISSIONS` entries are compared
- THEN they MUST be identical — each exactly `['reviewSession:read']`; only the sessions they can see differ

#### Scenario: A technician's permissions do not depend on their company
- GIVEN two `MAINTENANCE_TECHNICIAN` users, one with a `maintenanceCompanyId` and one without
- WHEN their `ROLE_PERMISSIONS` entries are compared
- THEN they MUST be identical

#### Scenario: A maintenance-role user cannot access company or user endpoints via their association
- GIVEN an authenticated caller with role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN they call `/maintenance-companies` or `/users`
- THEN the response MUST be 403 for all of them, the same as before this slice

#### Scenario: The company association grants no review-session write scope
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, but who holds no active technician assignment to C
- WHEN they call a review-session write endpoint for C
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

The system MUST keep `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` limited
to `reviewSession:read` alone. No `checklistQuestion:*` or
`reviewTemplate:*` permission MUST be granted to **any** non-admin role,
including `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER` and `MANAGER`, whose entries hold
`reviewSession:*` members only. A session reads a template's frozen
snapshot through the review-session surface, never through a template
permission.

This requirement governs **checklist-content authority only**, and that
scope is now explicit: `MANAGER` MUST NOT receive checklist-content
permissions, and the `MANAGE_CHECKLIST_CONTENT` capability ADR-011
Decision 2 names MUST NOT be declared, implemented or referenced
anywhere. The `User.managerCapabilities` mechanism now exists — declared
by *The Manager Becomes Operational on Review History Reads, Gated by a
Granted Capability* — but it MUST declare exactly one member,
`VIEW_ALL_REVIEWS`, and it MUST gate review-history visibility only. No
capability MUST gate, imply or unlock checklist-question or
review-template authority. `PermissionChecker.can`'s signature MUST be
unchanged.
(Previously: asserted `MANAGER` MUST equal `[]` and that no
`managerCapabilities` mechanism or `MANAGE_CHECKLIST_CONTENT` capability
MUST exist at all — a blanket claim this change narrows to
checklist-content authority, because `MANAGER` now holds
`reviewSession:read` and the capability mechanism now exists for
`VIEW_ALL_REVIEWS`.)

#### Scenario: MANAGER holds no checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` entry is read
- THEN it MUST equal exactly `['reviewSession:read']`, containing no `checklistQuestion:*` and no `reviewTemplate:*` member

#### Scenario: No non-admin role holds a checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN all four non-admin entries are read
- THEN none MUST contain a `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: No checklist-content capability is introduced
- GIVEN the shipped user model, schema and authorization code after this change
- WHEN they are searched for `MANAGE_CHECKLIST_CONTENT`
- THEN it MUST NOT appear anywhere in `apps/**` or `packages/**`, and the `ManagerCapability` enum MUST declare exactly one member, `VIEW_ALL_REVIEWS`

#### Scenario: The capability mechanism reaches no checklist authority
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any checklist-question or review-template endpoint — create, update, activate or read
- THEN every response MUST be 403, and no capability MUST be consulted by those endpoints' authorization

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
`ROLE_PERMISSIONS`. Both roles MUST receive the **same** review-session
permission set, because both perform sessions through the identical flow.
Neither MUST receive any other permission family.
`MAINTENANCE_COMPANY_MANAGER` MUST hold exactly `['reviewSession:read']`
and nothing more (see *The Maintenance Company Manager Becomes
Operational*), and `MANAGER` MUST hold exactly `['reviewSession:read']`
and nothing more (see *The Manager Becomes Operational on Review History
Reads, Gated by a Granted Capability*). `SYSTEM_ADMIN`'s row MUST gain no
`reviewSession:*` member beyond `reviewSession:read` (see *The System
Admin Becomes Operational on Review History Reads*). The table MUST
remain an exhaustive `Record<Role, Permission[]>`, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged:
the scope dimension is added beside it, not inside it.
(Previously: additionally asserted `MANAGER` MUST remain `[]` — now
false, as `MANAGER` holds `reviewSession:read`; the performing roles'
own grants are unchanged by this change.)

#### Scenario: Both performing roles hold the same review-session permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are read
- THEN each MUST be non-empty and MUST contain exactly the same `reviewSession:*` members

#### Scenario: The performing roles gain nothing else
- GIVEN the two performing roles' entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: Both read-only roles hold read alone
- GIVEN `ROLE_PERMISSIONS` after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN each MUST equal exactly `['reviewSession:read']`

#### Scenario: SYSTEM_ADMIN holds read and no other review-session member
- GIVEN the `SYSTEM_ADMIN` entry after this change
- WHEN its `reviewSession:*` members are read
- THEN they MUST be exactly `['reviewSession:read']`, with no create, perform, complete or discard member

#### Scenario: The permission table stays exhaustive
- GIVEN a new `Role` value were added to the enum without a `ROLE_PERMISSIONS` entry
- WHEN the project is type-checked
- THEN the build MUST fail

#### Scenario: The permission checker's signature is unchanged
- GIVEN `PermissionChecker.can` before and after this change
- WHEN its signature is compared
- THEN it MUST still take a role and a permission and MUST NOT take a resource

### Requirement: The Maintenance Company Manager Becomes Operational

The system MUST grant `MAINTENANCE_COMPANY_MANAGER` exactly
`['reviewSession:read']` in `ROLE_PERMISSIONS` — the first time the role
maps to anything other than `[]`. It MUST receive **no** other
`reviewSession:*` member (no `create`, `perform`, `complete` or
`discard`) and **no** other permission family. `SYSTEM_ADMIN` MUST hold
`reviewSession:read` and no other member of the family, granted by *The
System Admin Becomes Operational on Review History Reads*, and `MANAGER`
MUST hold `reviewSession:read` and no other permission at all, granted by
*The Manager Becomes Operational on Review History Reads, Gated by a
Granted Capability*; the roles share the permission and differ only in
the scope it reaches. This role's own scope MUST stay its own maintenance
company, unaffected by either of the two installation-wide scopes, and it
MUST NOT be reachable by any capability. The table MUST remain an
exhaustive `Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged: the company scope is added
beside it, not inside it.
(Previously: additionally asserted `MANAGER` MUST remain `[]` — now
false, as `MANAGER` holds `reviewSession:read`; this role's own grant and
scope are unchanged by this change.)

#### Scenario: The manager holds exactly one permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_COMPANY_MANAGER` entry is read
- THEN it MUST equal exactly `['reviewSession:read']`

#### Scenario: The manager gains no write member of the review-session family
- GIVEN the `MAINTENANCE_COMPANY_MANAGER` entry after this change
- WHEN it is compared with the technician's and representative's entries
- THEN it MUST contain none of `reviewSession:create`, `reviewSession:perform`, `reviewSession:complete` or `reviewSession:discard`, and no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: The manager is refused on every review-session write endpoint
- GIVEN an authenticated `MAINTENANCE_COMPANY_MANAGER`
- WHEN they call any review-session write endpoint — opening, resuming, resolving a code, recording answers, marking unreviewed, discarding or completing
- THEN every response MUST be 403, with no write performed

#### Scenario: The manager's own scope is unchanged by the two installation-wide scopes
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X and completed sessions attributed to companies X and Y
- WHEN they request review history after this change
- THEN the result MUST be exactly what it was before this change — only X's sessions, with no widening

#### Scenario: No capability widens this role
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose user record were to carry `VIEW_ALL_REVIEWS`
- WHEN they request review history
- THEN the result MUST still be only their own company's sessions — the capability MUST be meaningless for any role other than `MANAGER`

### Requirement: The System Admin Becomes Operational on Review History Reads

The system MUST grant `SYSTEM_ADMIN` the `reviewSession:read` permission
in `ROLE_PERMISSIONS` — the role's **first** `reviewSession:*` member
ever. It MUST receive **no** other member of that family: no
`reviewSession:create`, `reviewSession:perform`, `reviewSession:complete`
or `reviewSession:discard`. Its existing administrative permissions MUST
be otherwise unchanged, with none removed and none added.

Holding this permission MUST NOT widen any review-session **write**
endpoint to `SYSTEM_ADMIN`: opening, resuming, resolving a code,
recording answers, marking an element unreviewed, discarding and
completing MUST all still refuse this role, and *Completed Sessions Are
Immutable* (owned by `review-session-management`) MUST stay in force
against it unchanged.

The admin's own grant MUST remain **unconditional**: it MUST NOT be
expressed through, gated by, or made to depend on the
`User.managerCapabilities` mechanism, which applies to `MANAGER` alone.
The table MUST remain an exhaustive `Record<Role, Permission[]>`, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged:
the installation-wide scope is added beside it, not inside it.
(Previously: additionally asserted `MANAGER` MUST remain mapped to `[]`
— now false, as `MANAGER` holds `reviewSession:read`; the admin's own
grant and scope are unchanged by this change.)

#### Scenario: The admin gains exactly one review-session permission
- GIVEN the `SYSTEM_ADMIN` entry of `ROLE_PERMISSIONS` before and after this change
- WHEN they are compared
- THEN the only difference MUST be the addition of `reviewSession:read`, with no other permission added or removed

#### Scenario: The admin gains no write member of the review-session family
- GIVEN the `SYSTEM_ADMIN` entry after this change
- WHEN its `reviewSession:*` members are enumerated
- THEN it MUST contain `reviewSession:read` and none of `reviewSession:create`, `reviewSession:perform`, `reviewSession:complete` or `reviewSession:discard`

#### Scenario: The admin is refused on every review-session write endpoint
- GIVEN an authenticated `SYSTEM_ADMIN`
- WHEN they call any review-session write endpoint — opening, resuming, resolving a code, recording answers, marking unreviewed, discarding or completing
- THEN every response MUST be 403, with no write performed

#### Scenario: The admin's scope needs no capability
- GIVEN a `SYSTEM_ADMIN` whose user record carries no capability of any kind
- WHEN they request review history
- THEN every completed session MUST still be returned, and the capability resolution MUST NOT decide the admin's result

#### Scenario: The permission table stays exhaustive
- GIVEN a new `Role` value were added to the enum without a `ROLE_PERMISSIONS` entry
- WHEN the project is type-checked
- THEN the build MUST fail

### Requirement: The Manager Becomes Operational on Review History Reads, Gated by a Granted Capability

The system MUST grant `MANAGER` the `reviewSession:read` permission in
`ROLE_PERMISSIONS` — the role's **first permission of any family, ever**.
The grant MUST be unconditional on the user: it MUST NOT depend on any
capability, and every `MANAGER` MUST hold it. It MUST receive **no**
other permission: no other member of the `reviewSession:*` family (no
`create`, `perform`, `complete` or `discard`) and no member of any other
family (`user:*`, `community:*`, `maintenanceCompany:*`,
`inspectableElement:*`, `checklistQuestion:*`, `reviewTemplate:*`).

Holding this permission on its own MUST grant **no visibility**. History
visibility for this role MUST additionally require the
`VIEW_ALL_REVIEWS` capability on the calling user
(`User.managerCapabilities`). The permission decides whether the request
reaches the history surface at all; the capability decides what — if
anything — that surface returns. A `MANAGER` **without** the capability
MUST be observably indistinguishable from the role as it behaved before
this change.

Holding this permission MUST NOT widen any review-session **write**
endpoint to `MANAGER`, granted or not: opening, resuming, resolving a
code, recording answers, marking an element unreviewed, discarding and
completing MUST all still refuse this role.

Holding this permission MUST, as an accepted and named consequence of the
unconditional Layer-1 grant, widen exactly two `GET` routes owned by
`review-session-management` — `GET /review-sessions` (the draft-resume
list) and `GET /review-sessions/:sessionId` (the performer-scoped read) —
from `403` to `200 []`/`404` for every `MANAGER`, granted or ungranted
alike, since neither route consults the `VIEW_ALL_REVIEWS` capability.
This widening is scoped to those two routes only: it MUST NOT be read as
license to widen any other route, and it MUST NOT be confused with the
"observably indistinguishable" guarantee above, which governs the
review-history read surface only.

No new permission (for example `user:grantCapability`) MUST be
introduced, and no role other than `SYSTEM_ADMIN` MUST be able to grant
or revoke a capability. `ROLE_PERMISSIONS` MUST remain an exhaustive
`Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged — it MUST NOT take a user, a
capability or a resource, and MUST NOT perform a database read.

#### Scenario: The manager gains exactly one permission
- GIVEN the `MANAGER` entry of `ROLE_PERMISSIONS` before and after this change
- WHEN they are compared
- THEN the only difference MUST be the addition of `reviewSession:read`, leaving the entry exactly `['reviewSession:read']`

#### Scenario: The manager gains no other permission of any family
- GIVEN the `MANAGER` entry after this change
- WHEN its members are enumerated
- THEN it MUST contain none of `reviewSession:create`, `reviewSession:perform`, `reviewSession:complete`, `reviewSession:discard`, and no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: The permission is held whether or not the capability is granted
- GIVEN two `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability
- WHEN the permission check on a history endpoint is evaluated for each
- THEN both MUST pass the permission check and reach the history surface, and neither MUST be refused with 403

#### Scenario: The permission alone grants nothing
- GIVEN an authenticated `MANAGER` who holds no `VIEW_ALL_REVIEWS` capability, and completed sessions existing across several companies and communities
- WHEN they request the history list and then request any of those sessions by id
- THEN the list MUST be empty and every by-id request MUST be `404 REVIEW_SESSION_NOT_FOUND` — observably identical to this role's behaviour before this change

#### Scenario: The manager is refused on every review-session write endpoint
- GIVEN an authenticated `MANAGER`, once holding `VIEW_ALL_REVIEWS` and once holding no capability
- WHEN each calls any review-session write endpoint — opening, resuming, resolving a code, recording answers, marking unreviewed, discarding or completing
- THEN every response MUST be 403, with no write performed, in both capability states

#### Scenario: The manager gains the two review-sessions GET routes as an accepted, named consequence
- GIVEN an authenticated `MANAGER`, once holding `VIEW_ALL_REVIEWS` and once holding no capability
- WHEN each calls `GET /review-sessions` and `GET /review-sessions/:sessionId` for a real session id
- THEN both routes MUST respond `200`/`404` rather than `403` in both capability states — this widening is accepted and scoped to exactly these two routes, and MUST NOT extend to any write route or to any other permission family

#### Scenario: No new permission and no second grantor exist
- GIVEN the `Permission` union and `ROLE_PERMISSIONS` after this change
- WHEN they are searched for a capability-granting permission
- THEN none MUST exist, the capability MUST be writable only through the endpoint already gated by `user:update`, and `SYSTEM_ADMIN` MUST be the only role holding it

#### Scenario: The permission table stays exhaustive and the checker's signature is unchanged
- GIVEN a new `Role` value were added to the enum without a `ROLE_PERMISSIONS` entry, and `PermissionChecker.can` before and after this change
- WHEN the project is type-checked and the signature compared
- THEN the build MUST fail on the missing entry, and `can` MUST still take a role and a permission only — no user, capability or resource argument, and no asynchronous database read

### Requirement: Installation-Wide Review History Scope for a Manager Holding VIEW_ALL_REVIEWS

A `MANAGER` holding `reviewSession:read` **and** the `VIEW_ALL_REVIEWS`
capability MUST be granted history visibility over **every** `completed`
review session in the installation — the **same** scope
*Installation-Wide Review History Scope for a System Admin* grants, with
no difference of any kind. Every condition in that requirement's table
MUST hold identically for this actor: no community assignment and no
maintenance company is involved, and a session whose community, company
or performer has been deactivated or soft-deleted, or which carries no
performing-company attribution at all, MUST **still be visible**.
`VIEW_ALL_REVIEWS` means literally everything.

The capability MUST widen **nothing else**. It MUST confer no
administrative permission, no review-session write access, no
user-management access, and no per-company, per-community or date-bounded
variant of the read. It MUST affect the review-history read surface and
nothing else in the system.

Scope MUST still be evaluated in addition to, never instead of, the
role/permission check, and authentication MUST still be evaluated before
both. The `completed` status filter MUST still apply: a `draft` MUST NOT
be listed and MUST NOT be readable by id for this actor either. This
grant MUST apply to history **reads** only — the lists and the by-id read
alike.

#### Scenario: A granted manager sees every completed session in the installation
- GIVEN completed sessions attributed to two different maintenance companies, on two different communities, performed by different technicians, and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they request review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions

#### Scenario: The granted manager's result equals the admin's, session for session
- GIVEN the same installation, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request the history list
- THEN both results MUST contain exactly the same sessions in exactly the same order

#### Scenario: Deleted and deactivated context hides nothing from the granted manager
- GIVEN a `completed` session whose community has been deactivated or soft-deleted, one whose attributed company has been soft-deleted, and one carrying no attributed company at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests the list and each of those sessions by id
- THEN all three MUST be listed and each by-id request MUST return its full recorded record

#### Scenario: The granted manager reads any completed session by id unconditionally
- GIVEN any `completed` session in the installation, performed by anyone, on any community, for any company
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests it by id
- THEN the request MUST succeed and MUST return the same recorded record the performer would see, with no scope condition evaluated against the actor

#### Scenario: Drafts and unknown ids still 404 for the granted manager
- GIVEN a `draft` session and a well-formed session identifier matching no session at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests each in turn through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND` with identical status, error code and message

#### Scenario: The capability widens nothing outside the history read
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any administrative endpoint — users, communities, maintenance companies, inspectable elements, checklist questions, review templates — and any review-session write endpoint
- THEN every response MUST be 403, and the capability MUST NOT appear in any authorization decision outside the review-history read

#### Scenario: Unauthenticated caller is rejected before the role and capability checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the capability resolution MUST execute

### Requirement: The Capability Is Resolved Fresh Per Request and Fails Closed

The `VIEW_ALL_REVIEWS` capability MUST be resolved from the persisted
user record on **every** request that depends on it. It MUST NOT be
carried in the JWT, the session cookie or any token claim; it MUST NOT be
cached, memoized or precomputed; and the authenticated actor MUST NOT
gain a capability field. No client-side authorization decision MUST be
derived from it, and no endpoint MUST be added for the sole purpose of
exposing it to the client.

Resolution MUST fail **closed**: whenever the capability cannot be
affirmatively established — the user has been soft-deleted, the role is
not `MANAGER`, or the capability list does not contain `VIEW_ALL_REVIEWS`
— the outcome MUST be "no capability", and the request MUST NOT return
any review-session data, before any review-session data access is issued.
This is satisfied either by the empty/not-found result (the normal case)
or by an error response: a genuine infrastructure fault reading the user
record (a database connection error, for example) MUST surface as an
error response, not be swallowed into a silent empty/not-found result —
the checker MUST NOT catch and hide a real infrastructure failure to make
this guarantee hold.

Because resolution is per-request, a revoke MUST take effect on the
caller's **very next request**, with no grace period, no cached grant and
no re-authentication of any kind.

#### Scenario: A revoke takes effect on the next request with no re-login
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` who has just listed the installation's completed sessions
- WHEN a `SYSTEM_ADMIN` revokes the capability and the manager repeats the identical request on the **same** session cookie, without logging out or back in
- THEN the response MUST be an empty list, immediately and with no cached grant

#### Scenario: A grant takes effect on the next request with no re-login
- GIVEN an authenticated `MANAGER` holding no capability who has just received an empty history list
- WHEN a `SYSTEM_ADMIN` grants `VIEW_ALL_REVIEWS` and the manager repeats the identical request on the same session cookie
- THEN the response MUST contain every completed session in the installation

#### Scenario: The capability appears in no token or client authorization decision
- GIVEN the authentication token payload, the authenticated actor shape, the current-user endpoint's response and the client's route-gating code after this change
- WHEN each is inspected
- THEN none MUST carry or branch on `managerCapabilities` or `VIEW_ALL_REVIEWS`

#### Scenario: A soft-deleted manager holding the capability resolves to no capability
- GIVEN a `MANAGER` whose record holds `VIEW_ALL_REVIEWS` and who has since been soft-deleted
- WHEN the capability is resolved for a request made on their behalf
- THEN it MUST resolve to "no capability" and the request MUST return nothing

#### Scenario: A non-manager role never resolves to a capability
- GIVEN a `SYSTEM_ADMIN`, a `MAINTENANCE_COMPANY_MANAGER`, a `MAINTENANCE_TECHNICIAN` and a `COMMUNITY_REPRESENTATIVE`
- WHEN the capability is resolved for each
- THEN each MUST resolve to "no capability", and no role other than `MANAGER` MUST have its history scope influenced by the capability mechanism

#### Scenario: An absent capability short-circuits before any data access
- GIVEN an authenticated `MANAGER` holding no capability
- WHEN they call the history list and the history by-id read
- THEN the capability resolution MUST decide the outcome first, and **no** review-session repository read MUST be issued for either request

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

### Requirement: Resource Scope for Review History Reads

Holding a review-session read permission MUST grant history visibility
**only** through the scope its holder's role resolves, and that scope
MUST differ by role:

| Caller | History scope granted |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Sessions where `performedById` equals the caller — **and nothing else**. No community assignment is required, active or otherwise |
| `COMMUNITY_REPRESENTATIVE` | All `completed` sessions of every community the caller holds an **active** community-representative assignment to, **regardless of who performed them** |
| `MAINTENANCE_COMPANY_MANAGER` | All `completed` sessions whose frozen performing-company attribution equals the caller's own maintenance company, across every technician and community — see *Company-Wide Review History Scope for a Maintenance Company Manager*. No community assignment is involved |
| `SYSTEM_ADMIN` | **Every** `completed` session in the installation, with no scope predicate at all — see *Installation-Wide Review History Scope for a System Admin*. Neither a community assignment nor a maintenance company is involved, and deactivated or soft-deleted context hides nothing |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | **Every** `completed` session in the installation, identically to `SYSTEM_ADMIN` — see *Installation-Wide Review History Scope for a Manager Holding VIEW_ALL_REVIEWS*. The capability, resolved fresh from the caller's persisted record, is the whole scope predicate |
| `MANAGER` without the capability | Nothing |

This table is now **exhaustive over `Role`**: all five members have their
own explicit row, and the previous "any other role" trailing row is
removed as vacuous — there is no sixth role for it to catch. A future new
`Role` member MUST add its own explicit row to this table rather than
falling through an implicit default.

(Previously: `MANAGER` was in the "any other role" row, holding no
`reviewSession:*` permission and therefore no history scope; the table
was not yet exhaustive over `Role` and closed with that trailing
"any other role | Nothing" row.)

Scope MUST be evaluated in addition to, never instead of, the
role/permission check, and MUST apply to every history endpoint — the
lists and the by-id read alike.

A deactivated assignment (`deactivatedAt` set) MUST NOT confer history
scope, and the loss MUST take effect on the caller's next request, with
no grace period and no cached grant. **Reversed with the product owner on
2026-09-09:** that rule MUST NOT extend to the caller's own performed
sessions. A `MAINTENANCE_TECHNICIAN` MUST retain access to the sessions
they personally performed, permanently, regardless of whether they still
hold an active community-technician assignment to those sessions'
community — the performer relation alone confers scope over the
caller's own work. (Previously — confirmed 2026-09-08 and now reversed —
a deactivated assignment removed access to the technician's own performed
sessions too.)

That relaxation is strictly bounded to the caller's own performed
sessions. A `MAINTENANCE_TECHNICIAN` MUST still see **no** session
performed by anyone else, on any community, whether or not they hold an
active assignment there. The `COMMUNITY_REPRESENTATIVE` scope — the only
assignment-derived scope that reaches sessions the caller did not perform
— MUST still require an active assignment at request time, exactly as
shipped.

This requirement governs history **reads** only. *Resource Scope — an
Active Assignment Is Required Beyond the Permission* MUST remain in force
unchanged over the review-session **write** surface: a technician whose
assignment to a community has been deactivated MUST still be refused when
opening, resuming, resolving a code against, recording against,
discarding or completing a session for it.

Rejection for an out-of-scope session MUST NOT disclose that the session
exists: it MUST reuse the same status, error code and message as a
nonexistent session, per *Resource Scope — an Active Assignment Is
Required Beyond the Permission*.

#### Scenario: A representative's history is limited to actively assigned communities
- GIVEN a `COMMUNITY_REPRESENTATIVE` with an active representative assignment to community C and none to community D
- WHEN they request review history and then request a completed session of D by id
- THEN the history MUST contain C's completed sessions only, and the D request MUST be refused indistinguishably from a nonexistent session

#### Scenario: A technician is limited to sessions they performed
- GIVEN technicians U and W are both actively assigned to community C, and W completed session S
- WHEN U requests review history and then requests S by id
- THEN U's history MUST NOT contain S, and the by-id request MUST be refused indistinguishably from a nonexistent session

#### Scenario: A technician's own history survives assignment deactivation
- GIVEN a `MAINTENANCE_TECHNICIAN` who personally completed session S for community C and can read it
- WHEN their technician assignment to C is deactivated and they repeat both the list and the by-id request
- THEN S MUST still be listed and the by-id request MUST still succeed — the performer relation alone confers scope over their own work

#### Scenario: A deactivated technician still sees no one else's sessions
- GIVEN technician U, whose assignment to community C has been deactivated, and session S on C performed by technician W
- WHEN U requests review history and then requests S by id
- THEN S MUST NOT appear and the by-id request MUST be refused indistinguishably from a nonexistent session — identically to before the deactivation

#### Scenario: The write surface is unaffected by the own-history relaxation
- GIVEN a `MAINTENANCE_TECHNICIAN` whose assignment to community C has been deactivated but who can still read their own completed sessions for C
- WHEN they attempt to open, resume, record against, discard or complete a session for C
- THEN every one of those requests MUST be refused and MUST perform no write

#### Scenario: Deactivating a representative assignment removes history access on the next request
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who has just listed C's completed sessions
- WHEN their assignment is deactivated and the identical request is repeated
- THEN the request MUST be refused or return no C sessions, immediately and with no cached grant

#### Scenario: The manager's scope is resolved without the community-assignment check
- GIVEN an authenticated `MAINTENANCE_COMPANY_MANAGER` of company X holding no community assignment
- WHEN they call any history endpoint
- THEN the scope applied MUST be X's attributed completed sessions, and the community-assignment scope resolution MUST NOT be what decides the result

#### Scenario: The admin's scope is resolved without any narrowing at all
- GIVEN an authenticated `SYSTEM_ADMIN`
- WHEN they call any history endpoint
- THEN the scope applied MUST be every `completed` session in the installation, with neither the community-assignment nor the company scope resolution consulted

#### Scenario: A MANAGER's scope is resolved from the capability alone
- GIVEN two authenticated `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability, neither holding a community assignment or a maintenance company
- WHEN each calls any history endpoint
- THEN the granted one's scope MUST be every `completed` session in the installation and the ungranted one's MUST be nothing — and neither the community-assignment nor the company scope resolution MUST be what decides either result

#### Scenario: Revoking the capability removes history access on the next request
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` who has just listed the installation's completed sessions
- WHEN the capability is revoked and the identical request is repeated on the same session
- THEN the response MUST contain no session, immediately and with no cached grant

#### Scenario: The five scopes are proven side by side
- GIVEN one installation containing completed sessions across two companies, two communities and two technicians
- WHEN a technician, a representative, a company manager, a `SYSTEM_ADMIN`, a granted `MANAGER` and an ungranted `MANAGER` each request review history
- THEN each MUST receive exactly its own scope's sessions — the granted manager's result identical to the admin's, the ungranted manager's empty, and the technician's, representative's, company manager's and admin's results identical to what they were before this change

#### Scenario: Scope is checked in addition to the permission, not instead of it (now structural, not role-witnessed)
- GIVEN every real `Role` now holds at least `reviewSession:read` after this change, so no role can any longer witness "assigned but lacking every `reviewSession:*` permission" through an HTTP request
- WHEN the guarantee is verified
- THEN it MUST be proven structurally instead: a unit test on `PermissionsGuard`/`PermissionChecker.can` asserts the guard rejects with 403 whenever the checked permission is absent from the caller's `ROLE_PERMISSIONS` entry — using a `reviewSession:*` member no role holds together with a real community assignment where relevant (e.g. `reviewSession:create` for `COMMUNITY_REPRESENTATIVE`) — evaluated **before** any scope resolution runs; and `ROLE_PERMISSIONS`'s exhaustive `Record<Role, Permission[]>` shape makes an unmapped role a compile-time failure, so a role holding an assignment but lacking the checked permission cannot arise unproven

#### Scenario: The capability does not substitute for the permission (now structural, not role-witnessed)
- GIVEN no real `Role` can hold `VIEW_ALL_REVIEWS` while lacking `reviewSession:read`: `UserManagerCapabilityChecker`'s exhaustive `switch` resolves the capability only for `MANAGER`, who holds `reviewSession:read` unconditionally (Decision 4), and every other role resolves to `false` regardless of what its row carries — so "capability set, permission absent" has no witness among real roles after this change
- WHEN the guarantee is verified
- THEN it MUST be proven structurally instead of by an E2E witness: a unit test on `PermissionsGuard` asserts the permission check runs, and can reject with 403, strictly **before** `ReviewHistoryAccessService` ever reaches its capability resolution; and a unit test on `UserManagerCapabilityChecker` asserts it resolves `false` for every role other than `MANAGER` regardless of the row's stored `managerCapabilities` value — together showing the permission and the capability are evaluated in a fixed order, never as alternatives, so the capability cannot substitute for the permission even where no role-level witness can demonstrate it end-to-end

#### Scenario: Unauthenticated caller is rejected before the role and scope checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the scope check MUST execute

#### Scenario: Every history endpoint declares a permission requirement
- GIVEN the history endpoints after this change
- WHEN each one's permission metadata is inspected
- THEN every endpoint MUST require a `reviewSession:*` permission, with no exception, and none MUST be reachable on authentication alone

### Requirement: Company-Wide Review History Scope for a Maintenance Company Manager

A `MAINTENANCE_COMPANY_MANAGER` holding `reviewSession:read` MUST be
granted history visibility over exactly the `completed` review sessions
whose recorded performing company equals the caller's **own** maintenance
company — across every technician of that company and every community
they worked in — and over nothing else.

The grant MUST resolve from the session's **frozen performing-company
attribution** (recorded at performance time, owned by
`review-session-management`), never from the current
`maintenanceCompanyId` of the session's performer. A technician changing
employer MUST NOT move any past session between managers.

The scope's only conjuncts MUST be the caller's own company and the
session's `completed` status. No community assignment, no per-community
narrowing and no check on the performing technician's current employment
MUST be conjoined with it: a manager holds no community assignment, and
routing them through the community-assignment scope check would grant
them exactly nothing.

The scope MUST **fail closed on both sides**, because the failure mode of
a null company is a silent full-table read:

| Null case | Required behaviour |
|---|---|
| The caller's own maintenance company is absent | The caller MUST see **nothing** — never everything |
| A session carries no attributed performing company | It MUST appear in **no** manager's list and MUST NOT be readable by any manager by id |

Scope MUST be evaluated in addition to, never instead of, the
role/permission check, and MUST apply to every history endpoint — the
list and the by-id read alike. Rejection for an out-of-scope session MUST
NOT disclose that the session exists: it MUST reuse the same status,
error code and message as a nonexistent session.
(Previously: the "scope checked in addition to the permission" scenario
below used "a caller whose maintenance company is set but whose role
holds no `reviewSession:read`" as its witness. After this change every
real `Role` holds at least `reviewSession:read`, so no role can witness
that state through an HTTP request any more; the scenario is re-expressed
below as a unit-level, structurally-proven guarantee instead of an E2E
role witness. Everything else in this requirement is unchanged.)

#### Scenario: A manager sees their whole company's completed history
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X, and two technicians of X who completed sessions on two different communities
- WHEN the manager requests review history
- THEN the response MUST be 2xx and MUST contain every one of those completed sessions, regardless of performer or community

#### Scenario: Another company's sessions are never visible
- GIVEN a `completed` session S attributed to company Y, and a manager of company X
- WHEN the manager requests review history and then requests S by id
- THEN S MUST NOT appear in the list, and the by-id request MUST be refused indistinguishably from a nonexistent session

#### Scenario: Attribution survives the performer's transfer
- GIVEN a technician completed session S while employed by company X, and later transfers to company Y
- WHEN the manager of X and the manager of Y each request review history
- THEN S MUST still appear for X's manager and MUST NOT appear for Y's manager

#### Scenario: A manager with no maintenance company sees nothing
- GIVEN an authenticated `MAINTENANCE_COMPANY_MANAGER` whose own maintenance company is absent
- WHEN they request review history and request any real `completed` session by id
- THEN the list MUST be empty and the by-id request MUST be refused — the request MUST NOT degrade to an unscoped read

#### Scenario: A session with no attributed company is invisible to every manager
- GIVEN a `completed` session carrying no performing-company attribution
- WHEN every `MAINTENANCE_COMPANY_MANAGER` in the installation requests review history and requests that session by id
- THEN it MUST appear in no list and every by-id request MUST be refused

#### Scenario: The manager's scope requires no community assignment
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` holding no community assignment of any kind, active or deactivated
- WHEN they request review history
- THEN their company's completed sessions MUST still be returned in full — the community-assignment scope check MUST NOT be applied to this caller

#### Scenario: Drafts stay out of the company scope
- GIVEN company X has one `draft` and one `completed` session
- WHEN X's manager requests review history and requests the draft by id
- THEN only the `completed` session MUST be listed and the draft's by-id request MUST be refused indistinguishably from a nonexistent session

#### Scenario: Scope is checked in addition to the permission, not instead of it (now structural, not role-witnessed)
- GIVEN every real `Role` now holds at least `reviewSession:read` after this change, so no role can witness "company set but no `reviewSession:read`" through an HTTP request any more
- WHEN the guarantee is verified
- THEN it MUST be proven structurally instead: a unit test on `PermissionsGuard`/`PermissionChecker.can` asserts the guard rejects with 403 whenever the checked permission is absent from the caller's `ROLE_PERMISSIONS` entry, evaluated **before** any scope resolution runs and independent of the caller's maintenance company; and `ROLE_PERMISSIONS`'s exhaustive `Record<Role, Permission[]>` shape makes an unmapped role a compile-time failure, so "holds a company but not the permission" cannot arise for any real role in the first place

### Requirement: Installation-Wide Review History Scope for a System Admin

A `SYSTEM_ADMIN` holding `reviewSession:read` MUST be granted history
visibility over **every** `completed` review session in the
installation — across every maintenance company, every community, every
technician and all time — with **no scope predicate of any kind**. This
is one of **two** ways a history scope can narrow nothing in this system
— the other being a `MANAGER` holding `VIEW_ALL_REVIEWS` (see
*Installation-Wide Review History Scope for a Manager Holding
VIEW_ALL_REVIEWS*) — and both MUST be treated as intended behaviour, not
as a missing filter. The admin's own grant differs from the manager's in
one respect only: it is unconditional on anything beyond the role, where
the manager's is additionally gated by the capability.

The grant MUST be unconditional on the actor beyond their role:

| Condition | Required behaviour |
|---|---|
| The admin holds no community assignment, active or deactivated | Irrelevant — the full result MUST still be returned; no community-assignment scope resolution MUST decide it |
| The admin has no maintenance company | Irrelevant — the full result MUST still be returned; there MUST be no fail-closed branch, because there is no scope to fail closed on |
| A session's community has been deactivated or soft-deleted | The session MUST **still be visible** |
| A session's maintenance company has been deactivated or soft-deleted | The session MUST **still be visible** |
| A session carries no performing-company attribution | The session MUST **still be visible** |
| A session was performed by a user who has since transferred, been deactivated or been soft-deleted | The session MUST **still be visible** |

That divergence from the technician, representative and company-manager
scopes — the three that still narrow, and still fail closed or fall away
on deactivated/deleted context — is deliberate and MUST NOT be
"corrected": those three scopes are operational; the admin's (and a
granted manager's) is a total system audit, and deleted or deactivated
context MUST NOT hide a compliance record from the auditor.

Scope MUST still be evaluated in addition to, never instead of, the
role/permission check: a `SYSTEM_ADMIN` MUST reach a history endpoint
only by holding `reviewSession:read`, and authentication MUST still be
evaluated before both. The `completed` status filter MUST still apply:
a `draft` MUST NOT be listed and MUST NOT be readable by id, for this
actor either.

This grant MUST apply to history **reads** only — the lists and the by-id
read alike — and MUST confer nothing on the review-session write surface.
(Previously: described as "the only history scope in the system that
narrows nothing" and diverging from "the other three scopes" — both now
false in the strict singular/exclusive sense, since a granted `MANAGER`
also narrows nothing. The requirement now names the admin's grant as one
of two unconditional-narrows-nothing scopes, differing from the manager's
only in that the admin's needs no capability; the divergence from the
three genuinely narrowing scopes — technician, representative, company
manager — is otherwise unchanged.)

#### Scenario: The admin sees every completed session in the installation
- GIVEN completed sessions attributed to two different maintenance companies, on two different communities, performed by different technicians
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions

#### Scenario: The admin's scope resolves from the role alone
- GIVEN a `SYSTEM_ADMIN` holding no community assignment of any kind and no maintenance company
- WHEN they request review history
- THEN every completed session MUST still be returned, and neither the community-assignment nor the company scope resolution MUST decide the result

#### Scenario: A deactivated community's sessions stay visible to the admin
- GIVEN a `completed` session on a community that has since been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` requests review history and requests that session by id
- THEN it MUST appear in the list and the by-id request MUST return its full recorded record

#### Scenario: A soft-deleted company's sessions stay visible to the admin
- GIVEN a `completed` session attributed to a maintenance company that has since been deactivated or soft-deleted, and separately a `completed` session carrying no attributed company at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN both MUST appear — unlike in any manager's list, where the unattributed one appears nowhere

#### Scenario: The admin reads any completed session by id unconditionally
- GIVEN any `completed` session in the installation, performed by anyone, on any community, for any company
- WHEN a `SYSTEM_ADMIN` requests it by id
- THEN the request MUST succeed, with no scope condition evaluated against the actor

#### Scenario: Drafts and unknown ids still 404 for the admin
- GIVEN a `draft` session and a well-formed session identifier matching no session at all
- WHEN a `SYSTEM_ADMIN` requests each in turn through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND` with identical status, error code and message

#### Scenario: The admin's grant differs from a granted manager's only in needing no capability
- GIVEN a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`, both requesting review history against the same installation
- WHEN both results are compared
- THEN they MUST be identical, and the only structural difference between the two grants MUST be that the admin's needs no capability check while the manager's does

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN the admin history path after this change
- WHEN the guards on every history endpoint are inspected
- THEN each MUST still require a `reviewSession:*` permission, and the role MUST NOT substitute for it

#### Scenario: Unauthenticated caller is rejected before the role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: The Deferred Review Visibility Scopes Grant Nothing

FR-008's **role-based** visibility axis is now fully built: this change
ships the fifth and last scope (see *Installation-Wide Review History
Scope for a Manager Holding VIEW_ALL_REVIEWS*). What remains deferred is
**per-element** history and the other five `ManagerCapability` names
ADR-011 Decision 2 lists (`MANAGE_COMMUNITIES`,
`MANAGE_MAINTENANCE_COMPANIES`, `MANAGE_CHECKLIST_CONTENT`,
`MANAGE_INSPECTABLE_ELEMENTS`, `MANAGE_ORGANIZATION_PROFILE`); none of
them MUST be declared, gated or anticipated by any permission, capability
or role row. The `ManagerCapability` enum MUST declare exactly one
member, `VIEW_ALL_REVIEWS`, and no capability other than that one MUST
appear anywhere in `apps/**` or `packages/**`.

Exactly **one** unscoped "all sessions" history read MUST exist, and it
MUST be reachable from exactly **two** enumerable paths: a
`SYSTEM_ADMIN` unconditionally, or a `MANAGER` for whom
`VIEW_ALL_REVIEWS` has resolved affirmatively. No second unscoped read
MUST be introduced, and no other role, and no ungranted `MANAGER`, MUST
reach that one, on any route, under any circumstance.

A user's `maintenanceCompanyId` MUST affect history authorization
**only** through the `MAINTENANCE_COMPANY_MANAGER` scope defined in
*Company-Wide Review History Scope for a Maintenance Company Manager*. It
MUST have no effect on a `MAINTENANCE_TECHNICIAN`'s, a
`COMMUNITY_REPRESENTATIVE`'s, a `SYSTEM_ADMIN`'s or a `MANAGER`'s history
scope, and MUST grant no permission to any role. Symmetrically,
`managerCapabilities` MUST affect authorization **only** through the
`MANAGER` history scope, and MUST grant nothing to any other role and
nothing outside the review-history read.

No audit log of capability or role grants MUST ship: no table, no event,
no write. This matches ADR-011 Decision 5, under which role changes are
equally unaudited today.
(Previously: the `MANAGER` half of global visibility was deferred
entirely — `MANAGER` had to stay mapped to `[]`, no `ManagerCapability`
enum, `User.managerCapabilities` field, migration or capability-gated
layer was allowed to exist, and the single unscoped read had to be
reachable only by a `SYSTEM_ADMIN`.)

#### Scenario: MANAGER holds one permission and, by default, no capability
- GIVEN `ROLE_PERMISSIONS` and a newly created `MANAGER` after this change
- WHEN the entry and the user record are read
- THEN the entry MUST equal exactly `['reviewSession:read']` and the user's `managerCapabilities` MUST be empty — a capability is never held until a `SYSTEM_ADMIN` grants it

#### Scenario: Exactly one capability is declared
- GIVEN the `ManagerCapability` enum, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: The one unscoped history read is reachable from exactly two paths
- GIVEN every history read path after this change
- WHEN its scope is inspected
- THEN each MUST be scoped to a performer, a set of assigned communities, or one maintenance company — except exactly one installation-wide read, which MUST be reachable only when the caller is a `SYSTEM_ADMIN`, or a `MANAGER` whose `VIEW_ALL_REVIEWS` capability has resolved affirmatively

#### Scenario: No other role, and no ungranted manager, reaches the installation-wide result
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding no capability
- WHEN each requests review history and each requests, by id, a completed session outside their own scope
- THEN none MUST receive a session outside their own scope, and every such by-id request MUST be refused indistinguishably from a nonexistent session

#### Scenario: The company association still confers no history scope on a technician
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, who performed no session for C and holds no active technician assignment to C
- WHEN they request review history and a completed session of C by id
- THEN no session of C MUST be returned and the by-id request MUST be refused — their own company MUST NOT widen a technician's scope

#### Scenario: The performing roles still gain nothing else
- GIVEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: No capability or role grant is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of capability or role grants
- THEN no audit table, audit event or audit write MUST exist
