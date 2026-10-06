# Delta for Authorization

> **Permission contract (settled by design):** the schedule read is gated by
> one new permission, `reviewSchedule:read`, granted to `SYSTEM_ADMIN`,
> `MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE`, and to
> no other role. `MAINTENANCE_COMPANY_MANAGER` stays exactly
> `['reviewSession:read']`.
>
> Every main requirement or scenario that states a role's exact permission
> set, says the `Permission` union or `ROLE_PERMISSIONS` is unchanged, or
> confines `VIEW_ALL_REVIEWS` or a community assignment to history or the
> review-session surface, is restated below as a MODIFIED block, so no clause
> is literally false after archive. Clauses that compared the table "before
> and after this change" for a past change are rewritten so that they name the
> slice they describe (for example "by the organization-profile family's
> introduction") or state the property directly. The main spec's *Purpose*
> paragraph is not a requirement and cannot be modified by a delta, yet three
> of its sentences become incomplete after this change: (a) the company
> manager is "operational on the review history reads only, holding
> `reviewSession:read` alone" (still true of its permission set, but it must
> not imply the schedule is reachable by it); (b) "`MANAGER` holds
> `reviewSession:read` too" (the `MANAGER` now also holds
> `reviewSchedule:read`); and (c) the technician and representative are
> operational "only on the review-session surface" (they now also read the
> review schedule). The archive step MUST update the Purpose for the
> company-manager, `MANAGER` and technician/representative sentences so that
> each names `reviewSchedule:read` or the review schedule surface as
> applicable.

## ADDED Requirements

### Requirement: Permission and Scope Check on the Review Schedule Endpoint

The review-schedule read MUST be gated by the permission
`reviewSchedule:read`. `ROLE_PERMISSIONS` MUST grant it to `SYSTEM_ADMIN`,
`MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE`, and MUST
NOT grant it to `MAINTENANCE_COMPANY_MANAGER`, who MUST be refused with
`403`. Holding `reviewSession:read` MUST NOT by itself admit the company
manager. Authentication MUST be evaluated
first (`401`), the role gate second, scope third, and no schedule data MUST
be read before the scope is resolved. A `MANAGER` MUST be admitted whether
or not they hold `VIEW_ALL_REVIEWS`, receiving an empty result without it
(see `review-schedule`). Resource scope for `COMMUNITY_REPRESENTATIVE` and
`MAINTENANCE_TECHNICIAN` MUST be their active community assignments, with no
performer-based or company-based widening. The capability MUST be resolved
freshly on every request and MUST fail closed: a capability that cannot be
affirmatively established (absent, or a soft-deleted user) yields an empty
scope, while a genuine infrastructure fault MUST surface as an error response
and MUST NOT be hidden as an empty result, consistently with *The Capability
Is Resolved Fresh Per Request and Fails Closed*. No new `ManagerCapability`
member MUST be declared, and the endpoint MUST confer no write access on any
role.

#### Scenario: Company manager is refused although it holds reviewSession:read
- GIVEN a `MAINTENANCE_COMPANY_MANAGER`, who may read review history
- WHEN they call the schedule endpoint
- THEN the response MUST be `403`

#### Scenario: The permission is granted to exactly four roles
- GIVEN `ROLE_PERMISSIONS` after this change
- WHEN the entries are read
- THEN `reviewSchedule:read` MUST appear in the `SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries and in no other entry

#### Scenario: Four roles are admitted
- GIVEN a `SYSTEM_ADMIN`, a `MANAGER`, a `MAINTENANCE_TECHNICIAN` and a `COMMUNITY_REPRESENTATIVE`
- WHEN each calls the schedule endpoint
- THEN none receives `401` or `403`

#### Scenario: Authentication precedes authorization
- GIVEN no valid session
- WHEN the schedule endpoint is called
- THEN the response MUST be `401` and neither the role gate nor the capability resolution MUST execute

#### Scenario: Scope fails closed before any data read
- GIVEN a `MANAGER` whose capability is absent, or whose user record has been soft-deleted
- WHEN they call the schedule endpoint
- THEN the result MUST be empty and no schedule data MUST have been read

#### Scenario: An infrastructure fault surfaces as an error
- GIVEN a `MANAGER` and a genuine infrastructure fault while the capability is resolved (a database connection error, for example)
- WHEN they call the schedule endpoint
- THEN the response MUST be an error response, not a success with an empty list, and no schedule data MUST have been read

#### Scenario: The endpoint widens nothing
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any administrative endpoint or review-session write endpoint
- THEN every response MUST be `403`, and `ManagerCapability` MUST still declare exactly one member, `VIEW_ALL_REVIEWS`

## MODIFIED Requirements

### Requirement: The Organization Profile Grants Nothing Beyond Itself

The new family MUST widen nothing. The four non-admin rows of
`ROLE_PERMISSIONS` MUST be **unchanged by this family** — it adds no
member to any of them. `MAINTENANCE_COMPANY_MANAGER` MUST remain exactly
`['reviewSession:read']`, and `MANAGER` MUST hold exactly
`['reviewSession:read', 'reviewSchedule:read']`, the second member being
granted by the review-schedule read and not by this family.
Holding `organizationProfile:*` MUST confer nothing on any other
surface, and no other permission family MUST be widened to reach the
profile, with exactly **one** exception: the review-document read
(`review-document`, gated by the existing `reviewSession:read`
permission) MAY return the organization profile's six letterhead
fields — `name`, `legalName`, `taxId`, `address`, `phone`, `email` — to
a caller holding no `organizationProfile:*` permission. That exception
MUST NOT extend to `id` or `logoAssetId`, MUST NOT add any
`organizationProfile:*` member to any row of `ROLE_PERMISSIONS`, MUST
NOT create a new `Permission` member, `ROLE_PERMISSIONS` grant or
capability, and MUST NOT be reachable other than through the scoped
review-document read itself.

No `ManagerCapability` member MUST be declared for this slice: in
particular `MANAGE_ORGANIZATION_PROFILE`, which ADR-011 Decision 2
names and *The Deferred Review Visibility Scopes Grant Nothing* holds
undeclared, MUST still appear nowhere in `apps/**` or `packages/**`, and
the `ManagerCapability` enum MUST still declare exactly one member,
`VIEW_ALL_REVIEWS`. FR-013's `MANAGER` half stays deferred to its own
slice on purpose.

No audit trail of profile edits MUST ship: no table, no event, no
write — consistent with ADR-011 Decision 5, under which role changes are
equally unaudited today.
(Previously: the four non-admin rows were unchanged "by this change", with
`MANAGER` and `MAINTENANCE_COMPANY_MANAGER` both still exactly
`['reviewSession:read']`. The review-schedule change grants `MANAGER`
`reviewSchedule:read`, so the claim is scoped to this family and the
`MANAGER` row is restated. Three scenarios below that compared rows or the
permission table "before and after this change" are rewritten to name the
slice they describe or to state the property directly.)

#### Scenario: The four non-admin rows are unchanged
- GIVEN `ROLE_PERMISSIONS` before and after the organization-profile family was introduced
- WHEN the `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are compared
- THEN that introduction MUST have added no `organizationProfile:*` member to any of the four; `MAINTENANCE_COMPANY_MANAGER` MUST still be exactly `['reviewSession:read']`, and `MANAGER` MUST be exactly `['reviewSession:read', 'reviewSchedule:read']`, the second member having been granted later by the review-schedule read
(Previously: each MUST be identical to what it was, with `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` both still exactly `['reviewSession:read']`.)

#### Scenario: The capability is still undeclared
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `MANAGE_ORGANIZATION_PROFILE`
- THEN it MUST NOT appear anywhere in `apps/**` or `packages/**`, and `ManagerCapability` MUST still declare exactly one member, `VIEW_ALL_REVIEWS`

#### Scenario: The admin's other permissions are untouched
- GIVEN the `SYSTEM_ADMIN` entry
- WHEN it is read
- THEN it MUST still include `organizationProfile:read` and `organizationProfile:update`, and neither the organization-profile family nor its letterhead exception MUST have removed any permission from it or added any beyond those two (its `reviewSession:read` and `reviewSchedule:read` members come from their own requirements)
(Previously: "before and after this change" the entry MUST be identical, with no permission removed and none added, which cannot hold once `SYSTEM_ADMIN` also holds `reviewSchedule:read`.)

#### Scenario: No profile edit is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of profile edits
- THEN no audit table, audit event or audit write MUST exist

#### Scenario: The one exception is exactly the six letterhead fields
- GIVEN a `MAINTENANCE_TECHNICIAN` holding no `organizationProfile:*` permission, reading the document of a `completed` session in their scope
- WHEN the response's letterhead is inspected
- THEN it MUST carry exactly the six letterhead fields — `name`, `legalName`, `taxId`, `address`, `phone`, `email` — and MUST NOT carry `id` or `logoAssetId`

#### Scenario: No permission is added to reach the exception
- GIVEN the `Permission` union and `ROLE_PERMISSIONS`
- WHEN the review-document read's letterhead exception is inspected
- THEN the exception MUST have added no `Permission` member, no `ROLE_PERMISSIONS` grant and no capability, and no `organizationProfile:*` member MUST appear on any non-admin row
(Previously: the union and the table before and after "this change" MUST be identical, which cannot hold once `reviewSchedule:read` is added to both.)

#### Scenario: The exception is unreachable outside the scoped read
- GIVEN a caller holding `reviewSession:read` but not in scope for a given session, or holding `reviewSession:read` with no session context at all
- WHEN they attempt to reach the organization profile's letterhead fields other than through that session's review-document read
- THEN no route or use case MUST return them

### Requirement: Non-Admin Roles Remain Inert After the Checklist Permissions Are Added

The system MUST keep `MANAGER` limited to exactly
`['reviewSession:read', 'reviewSchedule:read']` and
`MAINTENANCE_COMPANY_MANAGER` limited to exactly `['reviewSession:read']`.
No `checklistQuestion:*` or `reviewTemplate:*` permission MUST be granted to
**any** non-admin role, including `MAINTENANCE_TECHNICIAN`,
`COMMUNITY_REPRESENTATIVE`, `MAINTENANCE_COMPANY_MANAGER` and `MANAGER`,
whose entries hold `reviewSession:*` members and, for all but
`MAINTENANCE_COMPANY_MANAGER`, `reviewSchedule:read` only. A session reads a
template's frozen snapshot through the review-session surface, never through
a template permission.

This requirement governs **checklist-content authority only**, and that
scope is now explicit: `MANAGER` MUST NOT receive checklist-content
permissions, and the `MANAGE_CHECKLIST_CONTENT` capability ADR-011
Decision 2 names MUST NOT be declared, implemented or referenced
anywhere. The `User.managerCapabilities` mechanism now exists — declared
by *The Manager Becomes Operational on Review History Reads, Gated by a
Granted Capability* — but it MUST declare exactly one member,
`VIEW_ALL_REVIEWS`, and it MUST gate review-history visibility and the
installation-wide scope of the review-schedule read only. No capability
MUST gate, imply or unlock checklist-question or review-template authority.
`PermissionChecker.can`'s signature MUST be unchanged.
(Previously: `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` were limited to
`reviewSession:read` alone, the entries held `reviewSession:*` members only,
and the capability "MUST gate review-history visibility only".)

#### Scenario: MANAGER holds no checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` entry is read
- THEN it MUST equal exactly `['reviewSession:read', 'reviewSchedule:read']`, containing no `checklistQuestion:*` and no `reviewTemplate:*` member
(Previously: it MUST equal exactly `['reviewSession:read']`.)

#### Scenario: No non-admin role holds a checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN all four non-admin entries are read
- THEN none MUST contain a `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: The company manager holds no schedule permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_COMPANY_MANAGER` entry is read
- THEN it MUST equal exactly `['reviewSession:read']` and MUST NOT contain `reviewSchedule:read`

#### Scenario: No checklist-content capability is introduced
- GIVEN the shipped user model, schema and authorization code after this change
- WHEN they are searched for `MANAGE_CHECKLIST_CONTENT`
- THEN it MUST NOT appear anywhere in `apps/**` or `packages/**`, and the `ManagerCapability` enum MUST declare exactly one member, `VIEW_ALL_REVIEWS`

#### Scenario: The capability mechanism reaches no checklist authority
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any checklist-question or review-template endpoint — create, update, activate or read
- THEN every response MUST be 403, and no capability MUST be consulted by those endpoints' authorization

### Requirement: Technician and Representative Become Operational

The system MUST grant the `reviewSession:*` permissions to
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` in
`ROLE_PERMISSIONS`. Both roles MUST receive the **same** review-session
permission set, because both perform sessions through the identical flow.
Neither MUST receive any other permission family, except that both
additionally hold `reviewSchedule:read` (see *Permission and Scope Check on
the Review Schedule Endpoint*).
`MAINTENANCE_COMPANY_MANAGER` MUST hold exactly `['reviewSession:read']`
and nothing more (see *The Maintenance Company Manager Becomes
Operational*), and `MANAGER` MUST hold exactly
`['reviewSession:read', 'reviewSchedule:read']` and nothing more (see *The
Manager Becomes Operational on Review History Reads, Gated by a Granted
Capability*). `SYSTEM_ADMIN`'s row MUST gain no
`reviewSession:*` member beyond `reviewSession:read` (see *The System
Admin Becomes Operational on Review History Reads*). The table MUST
remain an exhaustive `Record<Role, Permission[]>`, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged:
the scope dimension is added beside it, not inside it.
(Previously: additionally asserted `MANAGER` MUST remain `[]` — now
false, as `MANAGER` holds `reviewSession:read`; the performing roles'
own grants are unchanged by this change. Before the review-schedule
change, neither performing role received any other permission family and
`MANAGER` held exactly `['reviewSession:read']`.)

#### Scenario: Both performing roles hold the same review-session permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are read
- THEN each MUST be non-empty and MUST contain exactly the same `reviewSession:*` members

#### Scenario: The performing roles gain nothing else
- GIVEN the two performing roles' entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members and `reviewSchedule:read` — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission
(Previously: only `reviewSession:*` members, without `reviewSchedule:read`.)

#### Scenario: Both read-only roles hold no write member
- GIVEN `ROLE_PERMISSIONS` after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN the `MANAGER` entry MUST equal exactly `['reviewSession:read', 'reviewSchedule:read']` and the `MAINTENANCE_COMPANY_MANAGER` entry MUST equal exactly `['reviewSession:read']`
(Previously: each MUST equal exactly `['reviewSession:read']`. The title no longer says "read alone", because the `MANAGER` now also holds `reviewSchedule:read`.)

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
MUST hold `reviewSession:read` and, additionally, `reviewSchedule:read` and
no other permission at all, granted by *The Manager Becomes Operational on
Review History Reads, Gated by a Granted Capability*; the roles share the
permission and differ only in the scope it reaches. This role MUST NOT
hold `reviewSchedule:read`: the schedule endpoint refuses it with `403`. This role's own scope MUST stay its own maintenance
company, unaffected by either of the two installation-wide scopes, and it
MUST NOT be reachable by any capability. The table MUST remain an
exhaustive `Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged: the company scope is added
beside it, not inside it.
(Previously: additionally asserted `MANAGER` MUST remain `[]` — now
false, as `MANAGER` holds `reviewSession:read`; this role's own grant and
scope are unchanged by this change. The sentence on `MANAGER` read "and no
other permission at all" after `reviewSession:read`; it now also names
`reviewSchedule:read`. This role's own row is unchanged.)

#### Scenario: The manager holds exactly one permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_COMPANY_MANAGER` entry is read
- THEN it MUST equal exactly `['reviewSession:read']`

#### Scenario: The manager gains no write member of the review-session family
- GIVEN the `MAINTENANCE_COMPANY_MANAGER` entry after this change
- WHEN it is compared with the technician's and representative's entries
- THEN it MUST contain none of `reviewSession:create`, `reviewSession:perform`, `reviewSession:complete` or `reviewSession:discard`, and no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*`, `reviewTemplate:*` or `reviewSchedule:read` permission
(Previously: the list did not name `reviewSchedule:read`.)

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
be otherwise unchanged **by this grant**, with none removed and none added
by it. The review-schedule read separately grants `SYSTEM_ADMIN`
`reviewSchedule:read` (see *Permission and Scope Check on the Review
Schedule Endpoint*), which is outside the `reviewSession:*` family.

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
grant and scope are unchanged by this change. The sentence "Its existing
administrative permissions MUST be otherwise unchanged, with none removed and
none added" was unqualified; it is now scoped to this grant, because the
review-schedule read adds `reviewSchedule:read` to the admin's row.)

#### Scenario: The review-history introduction gave the admin exactly one review-session permission
- GIVEN the `SYSTEM_ADMIN` entry of `ROLE_PERMISSIONS` before and after the review-history introduction
- WHEN they are compared
- THEN the only difference made by that introduction MUST be the addition of `reviewSession:read`, with no other permission added or removed by it
(Previously: before and after "this change" the only difference MUST be the addition of `reviewSession:read`, with no other permission added or removed. The later `reviewSchedule:read` member is granted by the review-schedule read.)

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
other permission except `reviewSchedule:read` (see *Permission and Scope
Check on the Review Schedule Endpoint*): no other member of the
`reviewSession:*` family (no `create`, `perform`, `complete` or `discard`)
and no member of any other family (`user:*`, `community:*`,
`maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*`,
`reviewTemplate:*`).

Holding this permission on its own MUST grant **no visibility**. History
visibility for this role MUST additionally require the
`VIEW_ALL_REVIEWS` capability on the calling user
(`User.managerCapabilities`). The permission decides whether the request
reaches the history surface at all; the capability decides what — if
anything — that surface returns. A `MANAGER` **without** the capability
MUST be observably indistinguishable from the role as it behaved before
this change. That guarantee governs the review-history read surface only;
the review-schedule endpoint is a separate read on which an ungranted
`MANAGER` receives a success response with an empty list, not a `403`.
(Previously: the sentence on the other permissions read "no other permission"
after `reviewSession:read`, and the guarantee was not scoped.)

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

#### Scenario: The manager gains exactly two permissions in total
- GIVEN the `MANAGER` entry of `ROLE_PERMISSIONS` before the review-history introduction, and the entry now
- WHEN they are compared
- THEN the review-history introduction MUST have added only `reviewSession:read`, and the entry MUST now equal exactly `['reviewSession:read', 'reviewSchedule:read']`, the second member being granted by the review-schedule read
(Previously: the only difference MUST be the addition of `reviewSession:read`, leaving the entry exactly `['reviewSession:read']`; the title read "gains exactly one permission".)

#### Scenario: The manager gains no other permission of any family
- GIVEN the `MANAGER` entry after this change
- WHEN its members are enumerated
- THEN it MUST contain none of `reviewSession:create`, `reviewSession:perform`, `reviewSession:complete`, `reviewSession:discard`, and no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission, and no permission other than `reviewSession:read` and `reviewSchedule:read`
(Previously: no permission other than `reviewSession:read` was allowed.)

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
variant of the read. It MUST affect the review-history read surface — which
now, by construction, includes the review-document read: `review-document`
reuses this capability's review-history scope resolution without widening
it, so a granted manager's document visibility is exactly the
review-document read inheriting this same history scope, not a second grant —
and, beyond that surface, nothing else in the system except the
installation-wide scope of the review-schedule read (see `review-schedule`),
which returns computed per-pair statuses and never a session or an entry.

Scope MUST still be evaluated in addition to, never instead of, the
role/permission check, and authentication MUST still be evaluated before
both. The `completed` status filter MUST still apply: a `draft` MUST NOT
be listed and MUST NOT be readable by id for this actor either. This
grant MUST apply to history **reads** only — the lists and the by-id read
alike.
(Previously: "It MUST affect the review-history read surface and nothing
else in the system", which is false once the capability also gates the
installation-wide scope of the review-schedule read.)

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

#### Scenario: The capability widens nothing outside the history read and the schedule's installation-wide scope
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any administrative endpoint — users, communities, maintenance companies, inspectable elements, checklist questions, review templates — and any review-session write endpoint
- THEN every response MUST be 403, and the capability MUST NOT appear in any authorization decision outside the review-history read and the installation-wide scope of the review-schedule read
(Previously: "outside the review-history read". The installation-wide scope of the review-schedule read is now the one named exception.)

#### Scenario: Unauthenticated caller is rejected before the role and capability checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the capability resolution MUST execute

#### Scenario: The capability governs the review-document read too, through the same scope
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` and a `completed` session anywhere in the installation
- WHEN they read that session's document
- THEN the response MUST be 2xx, granted through the same history scope this capability already establishes, with no separate document-specific grant

### Requirement: The Element-Keyed Review History Read Is Gated on reviewSession:read, Never on inspectableElement:read

The element-keyed review history read MUST require the
`reviewSession:read` permission and **only** that permission. It MUST NOT
require, consult, imply or be widened by any member of the
`inspectableElement:*` family, even though its URL is nested under an
element and its response carries an element header. It is a review-history
read keyed by an element, not an element-management read.

`ROLE_PERMISSIONS` MUST be **unchanged by the element-keyed history read's
introduction**: that read added no permission to any role and removed none,
and in particular **no role gains `inspectableElement:read`**, which MUST
remain held by `SYSTEM_ADMIN` alone. The element-keyed read MUST add no
member to the `Permission` union, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged —
no user, capability, element or resource argument, and no database read.
The later `reviewSchedule:read` member, added by the review-schedule read, is
outside this requirement.

Consequently all **five** roles holding `reviewSession:read` MUST reach
this endpoint's authorization layer, and what each then receives MUST be
decided by scope, per *Entry-Level Resource Scope for the Element-Keyed
Review History Read* — never by a 403.

Guard order MUST be unchanged: authentication first, then the permission
check, then scope resolution. An unauthenticated caller MUST be rejected
with 401 before either.

Reaching this endpoint MUST confer nothing on the element-management
surface: no element create, update, decommission, soft-delete, label or
list route MUST widen to any role, and no element-management route's gate
MUST be relaxed to `reviewSession:read`.
(Previously: "`ROLE_PERMISSIONS` MUST be **unchanged** by this change: no role
gains a permission, no role loses one … The `Permission` union MUST gain no
member", unqualified, which is false once the review-schedule change adds
`reviewSchedule:read`. The claim is scoped to the element-keyed read.)

#### Scenario: The element-keyed history read leaves the permission table byte-unchanged
- GIVEN `ROLE_PERMISSIONS` and the `Permission` union before and after the element-keyed history read was introduced
- WHEN they are compared
- THEN that introduction MUST have added, removed or moved no permission between roles and added no `Permission` member; the later `reviewSchedule:read` is not part of this comparison
(Previously: before and after "this change" they MUST be identical — no permission added, removed or moved between roles.)

#### Scenario: No role gains inspectableElement:read
- GIVEN every role's entry after this change
- WHEN the `inspectableElement:*` family is searched for across them
- THEN only `SYSTEM_ADMIN` MUST hold any member of it, exactly as before the element-keyed history read was introduced
(Previously: "exactly as before this change".)

#### Scenario: The element-keyed endpoint declares reviewSession:read
- GIVEN the element-keyed history route's permission metadata
- WHEN it is inspected
- THEN it MUST require `reviewSession:read`, MUST require no `inspectableElement:*` permission, and MUST NOT be reachable on authentication alone

#### Scenario: All five roles pass the permission check on the new endpoint
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER`, a `SYSTEM_ADMIN` and a `MANAGER` (granted and ungranted)
- WHEN each calls the element-keyed history endpoint
- THEN none MUST receive 403 — each MUST reach scope resolution, and the outcome MUST be decided there

#### Scenario: Unauthenticated caller is rejected before the permission and scope checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls the element-keyed history endpoint
- THEN the response MUST be 401, and neither the permission check nor any scope resolution MUST execute

#### Scenario: The element-management surface is not widened
- GIVEN every inspectable-element management route after this change
- WHEN each one's gate is inspected and called by a non-`SYSTEM_ADMIN` holding `reviewSession:read`
- THEN each MUST still require `inspectableElement:*` and MUST still respond 403 — the history read MUST NOT have relaxed any of them

#### Scenario: The checker's signature is unchanged
- GIVEN `PermissionChecker.can` before and after this change
- WHEN its signature is compared
- THEN it MUST still take a role and a permission only — no user, capability, element or resource argument, and no asynchronous database read

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
confers resource scope only on the review-session surface and on the
review-schedule read (see *Resource Scope — an Active Assignment Is Required
Beyond the Permission* and *Permission and Scope Check on the Review Schedule
Endpoint*), never a permission.
(Previously: "confers access only within the review-session surface". The
review-schedule read also resolves a representative's or technician's scope
from their active assignments, so the sentence now names it.)

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

### Requirement: Assignments Confer No Permission Outside the Review-Session Surface

An active community assignment MUST remain permission-less everywhere. It
MAY decide resource scope only on the review-session surface and on the
review-schedule read, where the permission itself comes from the role and
the assignment decides which communities' data is reached. It MUST NOT grant
a technician or representative any access to `/users`, `/communities`, its
assignment sub-resources, `/maintenance-companies`, `/checklist-questions`,
`/review-templates`, or the inspectable-element admin endpoints.
(Previously: "permission-less everywhere except the review-session surface".
The review-schedule read is the second surface whose scope an assignment
decides.)

#### Scenario: An assigned technician still cannot reach admin endpoints
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C
- WHEN they call any `/users`, `/communities`, `/maintenance-companies`, `/checklist-questions`, `/review-templates` or inspectable-element endpoint, including ones concerning C
- THEN every response MUST be 403

#### Scenario: An assigned representative still cannot reach admin endpoints
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C
- WHEN they call the same set of endpoints
- THEN every response MUST be 403

### Requirement: The Deferred Review Visibility Scopes Grant Nothing

**FR-008 closes with this change.** Its role-based visibility axis closed
with the fifth scope; its **per-element** half ships here, gated on
`reviewSession:read` and scoped by the same five rules applied at entry
level (see *The Element-Keyed Review History Read Is Gated on
reviewSession:read, Never on inspectableElement:read* and *Entry-Level
Resource Scope for the Element-Keyed Review History Read*). What remains
deferred is only the other five `ManagerCapability` names ADR-011
Decision 2 lists (`MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`,
`MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS`,
`MANAGE_ORGANIZATION_PROFILE`); none of them MUST be declared, gated or
anticipated by any permission, capability or role row. The
`ManagerCapability` enum MUST declare exactly one member,
`VIEW_ALL_REVIEWS`, and no capability other than that one MUST appear
anywhere in `apps/**` or `packages/**`.

Exactly **one** actor-unscoped "all sessions" history read MUST exist,
and exactly **one** actor-unscoped element-keyed history read MUST exist.
Both MUST be reachable from exactly **two** enumerable paths each: a
`SYSTEM_ADMIN` unconditionally, or a `MANAGER` for whom
`VIEW_ALL_REVIEWS` has resolved affirmatively. No third actor-unscoped
history read MUST be introduced, and no other role, and no ungranted
`MANAGER`, MUST reach either, on any route, under any circumstance. The
review-schedule read is not a history read and not a third such read: it
returns computed per-pair statuses and never a session or an entry, and
its installation-wide result is reachable from the same two actor paths
only. An element identifier MUST NOT be mistaken for an actor scope: it
narrows which entries are candidates and confers no visibility of its own.

A user's `maintenanceCompanyId` MUST affect history authorization
**only** through the `MAINTENANCE_COMPANY_MANAGER` scope defined in
*Company-Wide Review History Scope for a Maintenance Company Manager*, on
both read surfaces. It MUST have no effect on a
`MAINTENANCE_TECHNICIAN`'s, a `COMMUNITY_REPRESENTATIVE`'s, a
`SYSTEM_ADMIN`'s or a `MANAGER`'s history scope, and MUST grant no
permission to any role. Symmetrically, `managerCapabilities` MUST affect
authorization **only** through the `MANAGER` history scope and the
installation-wide scope of the review-schedule read, and MUST grant nothing
to any other role and nothing outside the review-history reads and the
review-schedule read.

No audit log of capability or role grants MUST ship: no table, no event,
no write. This matches ADR-011 Decision 5, under which role changes are
equally unaudited today.
(Previously: **per-element** history was listed alongside the five
remaining capability names as deferred, and exactly one actor-unscoped
read was allowed to exist. Per-element history now ships — the deferral
is narrowed, not deleted: it becomes a bound on what shipped, namely one
element-keyed read family, five scopes applied at entry level, no new
permission, no `ROLE_PERMISSIONS` change, and a second actor-unscoped
read reachable from exactly the same two actor paths as the first. This
change further narrows the capability sentences, which read "nothing
outside the review-history reads", to also allow the review-schedule read.
It also qualifies "No third actor-unscoped read" as "No third actor-unscoped
**history** read": the review-schedule read is installation-wide for the same
two actor paths but returns computed per-pair statuses, never a session or an
entry, so it is named explicitly as not being a history read.)

#### Scenario: MANAGER holds two permissions and, by default, no capability
- GIVEN `ROLE_PERMISSIONS` and a newly created `MANAGER` after this change
- WHEN the entry and the user record are read
- THEN the entry MUST equal exactly `['reviewSession:read', 'reviewSchedule:read']` and the user's `managerCapabilities` MUST be empty — a capability is never held until a `SYSTEM_ADMIN` grants it
(Previously: the entry MUST equal exactly `['reviewSession:read']`.)

#### Scenario: Exactly one capability is declared
- GIVEN the `ManagerCapability` enum, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: Each actor-unscoped history read is reachable from exactly two paths
- GIVEN every history read path after this change, session-level and element-keyed alike
- WHEN its scope is inspected
- THEN each MUST be scoped to a performer, a set of assigned communities, or one maintenance company — except exactly one installation-wide session read and exactly one installation-wide element-keyed read, each of which MUST be reachable only when the caller is a `SYSTEM_ADMIN`, or a `MANAGER` whose `VIEW_ALL_REVIEWS` capability has resolved affirmatively

#### Scenario: The schedule's installation-wide result is reachable from the same two paths
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding no capability
- WHEN each requests the review schedule
- THEN none MUST receive a pair outside their own scope, the company manager MUST be refused with `403`, and the ungranted manager MUST receive an empty list

#### Scenario: No other role, and no ungranted manager, reaches an installation-wide result
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding no capability
- WHEN each requests review history, requests by id a completed session outside their own scope, and requests the history of an element outside their own scope
- THEN none MUST receive anything outside their own scope, every such by-id session request MUST be refused indistinguishably from a nonexistent session, and every such element request MUST be refused indistinguishably from a nonexistent element

#### Scenario: An element identifier confers no visibility of its own
- GIVEN the element-keyed history authorization after this change
- WHEN it is inspected
- THEN the element identifier MUST narrow candidate entries only, and MUST NOT appear in any branch as the reason a caller is allowed to see an entry

#### Scenario: The company association still confers no history scope on a technician
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, who recorded no entry on element E of C and holds no active technician assignment to C
- WHEN they request review history, a completed session of C by id, and E's element history
- THEN no session of C MUST be returned, the by-id request MUST be refused, and the element request MUST be refused — their own company MUST NOT widen a technician's scope on either surface

#### Scenario: The performing roles still gain nothing else
- GIVEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members and `reviewSchedule:read` — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission
(Previously: only `reviewSession:*` members, without `reviewSchedule:read`.)

#### Scenario: No capability or role grant is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of capability or role grants
- THEN no audit table, audit event or audit write MUST exist
