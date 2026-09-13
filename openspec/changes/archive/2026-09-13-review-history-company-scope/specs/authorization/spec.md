# Delta for Authorization

> **Purpose amendment (for archive):** the capability's Purpose says
> "`MANAGER` and `MAINTENANCE_COMPANY_MANAGER` remain fully inert —
> declared but rejected wherever role-based checks apply". After this
> change only `MANAGER` is fully inert. `MAINTENANCE_COMPANY_MANAGER`
> becomes operational on the review **history** reads and nowhere else,
> holding `reviewSession:read` alone. It is also the first role whose
> resource scope is **not** a set of communities: its scope is its own
> maintenance company, matched against the performing company frozen onto
> each session. `SYSTEM_ADMIN` still holds no `reviewSession:*`
> permission, and the global (`VIEW_ALL_REVIEWS` / `ManagerCapability`)
> scope stays unbuilt.

## ADDED Requirements

### Requirement: The Maintenance Company Manager Becomes Operational

The system MUST grant `MAINTENANCE_COMPANY_MANAGER` exactly
`['reviewSession:read']` in `ROLE_PERMISSIONS` — the first time the role
maps to anything other than `[]`. It MUST receive **no** other
`reviewSession:*` member (no `create`, `perform`, `complete` or
`discard`) and **no** other permission family. `MANAGER` MUST remain
`[]`. `SYSTEM_ADMIN`'s row MUST be unchanged and MUST NOT gain any
`reviewSession:*` permission. The table MUST remain an exhaustive
`Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged: the company scope is added
beside it, not inside it.

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

#### Scenario: MANAGER and SYSTEM_ADMIN are untouched
- GIVEN the `MANAGER` and `SYSTEM_ADMIN` entries before and after this change
- WHEN they are compared
- THEN `MANAGER` MUST still equal `[]` and `SYSTEM_ADMIN` MUST be identical, with no `reviewSession:*` member added

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

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN a caller whose maintenance company is set but whose role holds no `reviewSession:read`
- WHEN they call any history endpoint
- THEN the response MUST be 403 — the company association MUST NOT substitute for the permission

## MODIFIED Requirements

### Requirement: Resource Scope for Review History Reads

Holding a review-session read permission MUST grant history visibility
**only** through the scope its holder's role resolves, and that scope
MUST differ by role:

| Caller | History scope granted |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Sessions where `performedById` equals the caller — **and nothing else**. No community assignment is required, active or otherwise |
| `COMMUNITY_REPRESENTATIVE` | All `completed` sessions of every community the caller holds an **active** community-representative assignment to, **regardless of who performed them** |
| `MAINTENANCE_COMPANY_MANAGER` | All `completed` sessions whose frozen performing-company attribution equals the caller's own maintenance company, across every technician and community — see *Company-Wide Review History Scope for a Maintenance Company Manager*. No community assignment is involved |
| Any other role | Nothing |

(Previously: only the technician and representative scopes existed, and a
technician's access to their **own** performed sessions additionally
required a currently-active community-technician assignment.)

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

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN a caller actively assigned to community C whose role holds no `reviewSession:*` permission
- WHEN they call any history endpoint
- THEN the response MUST be 403 — the assignment MUST NOT substitute for the permission

#### Scenario: Unauthenticated caller is rejected before the role and scope checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the scope check MUST execute

#### Scenario: Every history endpoint declares a permission requirement
- GIVEN the history endpoints after this change
- WHEN each one's permission metadata is inspected
- THEN every endpoint MUST require a `reviewSession:*` permission, with no exception, and none MUST be reachable on authentication alone

### Requirement: The Deferred Review Visibility Scopes Grant Nothing

FR-008's **global** visibility scope is deliberately still not built, and
no permission, capability or role row MUST anticipate it. `MANAGER` MUST
remain mapped to `[]` in `ROLE_PERMISSIONS`. `SYSTEM_ADMIN`'s row MUST be
unchanged and MUST NOT gain any `reviewSession:*` permission. No
`ManagerCapability` enum, `User.managerCapabilities` field, migration or
capability-gated permission layer MUST exist, and no `VIEW_ALL_REVIEWS`
permission or capability MUST be declared. No unscoped "all sessions"
history read MUST exist for any caller.

A user's `maintenanceCompanyId` MUST affect history authorization
**only** through the `MAINTENANCE_COMPANY_MANAGER` scope defined in
*Company-Wide Review History Scope for a Maintenance Company Manager*. It
MUST have no effect on a `MAINTENANCE_TECHNICIAN`'s or a
`COMMUNITY_REPRESENTATIVE`'s history scope, and MUST grant no permission
to any role.
(Previously: the company-wide scope was deferred alongside the global
one, and a user's `maintenanceCompanyId` had no effect on **any** history
authorization decision.)

#### Scenario: MANAGER stays mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` entry is read
- THEN it MUST equal `[]`

#### Scenario: SYSTEM_ADMIN's permissions are unchanged
- GIVEN the `SYSTEM_ADMIN` entry before and after this change
- WHEN they are compared
- THEN they MUST be identical, with no `reviewSession:*` member added

#### Scenario: No manager capability or global-review mechanism is introduced
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: No unscoped history read exists
- GIVEN every history read path after this change
- WHEN its scope is inspected
- THEN each MUST be scoped to a performer, a set of assigned communities, or one maintenance company — none MUST return sessions across the whole installation

#### Scenario: The company association still confers no history scope on a technician
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, who performed no session for C and holds no active technician assignment to C
- WHEN they request review history and a completed session of C by id
- THEN no session of C MUST be returned and the by-id request MUST be refused — their own company MUST NOT widen a technician's scope

#### Scenario: The performing roles still gain nothing else
- GIVEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

### Requirement: Technician and Representative Become Operational

The system MUST grant the `reviewSession:*` permissions to
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` in
`ROLE_PERMISSIONS`. Both roles MUST receive the **same** review-session
permission set, because both perform sessions through the identical flow.
Neither MUST receive any other permission family. `MANAGER` MUST remain
`[]`; `MAINTENANCE_COMPANY_MANAGER` MUST hold exactly
`['reviewSession:read']` and nothing more (see *The Maintenance Company
Manager Becomes Operational*). `SYSTEM_ADMIN`'s row MUST NOT gain any
`reviewSession:*` permission. The table MUST remain an exhaustive
`Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged: the scope dimension is added
beside it, not inside it.
(Previously: asserted that both `MANAGER` and
`MAINTENANCE_COMPANY_MANAGER` remain `[]`.)

#### Scenario: Both performing roles hold the same review-session permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are read
- THEN each MUST be non-empty and MUST contain exactly the same `reviewSession:*` members

#### Scenario: The performing roles gain nothing else
- GIVEN the two performing roles' entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: MANAGER stays inert and the company manager holds read only
- GIVEN `ROLE_PERMISSIONS` after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN `MANAGER` MUST equal `[]` and `MAINTENANCE_COMPANY_MANAGER` MUST equal exactly `['reviewSession:read']`

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

### Requirement: Non-Admin Roles Remain Inert After the Checklist Permissions Are Added

The system MUST keep `MANAGER` mapped to `[]` in `ROLE_PERMISSIONS`, and
MUST keep `MAINTENANCE_COMPANY_MANAGER` limited to `reviewSession:read`
alone. No `checklistQuestion:*` or `reviewTemplate:*` permission MUST be
granted to **any** non-admin role, including `MAINTENANCE_TECHNICIAN`,
`COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_COMPANY_MANAGER`, whose
entries hold `reviewSession:*` members only. A session reads a template's
frozen snapshot through the review-session surface, never through a
template permission. In particular, `MANAGER` MUST NOT receive
checklist-content permissions: the `MANAGE_CHECKLIST_CONTENT` capability
depends on `User.managerCapabilities`, which is deliberately not built.
`PermissionChecker.can`'s signature MUST be unchanged.
(Previously: asserted both `MANAGER` and `MAINTENANCE_COMPANY_MANAGER`
stay mapped to `[]`.)

#### Scenario: MANAGER stays mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` entry is read
- THEN it MUST equal `[]`

#### Scenario: No non-admin role holds a checklist or template permission
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN all four non-admin entries are read
- THEN none MUST contain a `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: No manager capability mechanism is introduced
- GIVEN the shipped user model and authorization code are inspected
- WHEN they are searched for `managerCapabilities` or `MANAGE_CHECKLIST_CONTENT`
- THEN neither MUST exist

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

## RENAMED Requirements

### Requirement: Maintenance-Role Permissions Stay Inert → The Company Association Itself Confers No Permission

(Reason: the old name asserts that both maintenance roles hold no
permissions, which stops being true the moment
`MAINTENANCE_COMPANY_MANAGER` gains `reviewSession:read`. The
requirement's surviving claim is narrower and sharper: the company
association itself never grants a permission.)
(Migration: replace the old requirement block wholesale with the full
`The Company Association Itself Confers No Permission` block under
*MODIFIED Requirements* above; update the spec references in
`role-permission.checker.spec.ts` and any test naming the old
requirement.)
