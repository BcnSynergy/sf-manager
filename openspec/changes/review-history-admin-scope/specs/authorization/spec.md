# Delta for Authorization

> **Purpose amendment (for archive):** the capability's Purpose says
> `SYSTEM_ADMIN` "still holds no `reviewSession:*` permission". After this
> change `SYSTEM_ADMIN` holds exactly one — `reviewSession:read` — and is
> the **fourth** role operational on the review-history read surface. Its
> scope dimension is unlike every other role's: it is not a set of
> communities, not a maintenance company, and not a performer relation,
> but the whole installation, with no scope predicate at all. Only
> `MANAGER` remains fully inert. Everything else is unchanged: the
> permission family, the guard order, and the write surface.

## ADDED Requirements

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

`MANAGER` MUST remain mapped to `[]`. The table MUST remain an
exhaustive `Record<Role, Permission[]>`, and `PermissionChecker.can(role,
permission)`'s signature MUST be unchanged: the installation-wide scope
is added beside it, not inside it.

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

#### Scenario: MANAGER is untouched
- GIVEN the `MANAGER` entry before and after this change
- WHEN they are compared
- THEN it MUST still equal `[]`, with no `reviewSession:*` member added

#### Scenario: The permission table stays exhaustive
- GIVEN a new `Role` value were added to the enum without a `ROLE_PERMISSIONS` entry
- WHEN the project is type-checked
- THEN the build MUST fail

### Requirement: Installation-Wide Review History Scope for a System Admin

A `SYSTEM_ADMIN` holding `reviewSession:read` MUST be granted history
visibility over **every** `completed` review session in the
installation — across every maintenance company, every community, every
technician and all time — with **no scope predicate of any kind**. This
is the only history scope in the system that narrows nothing, and that
MUST be treated as intended behaviour, not as a missing filter.

The grant MUST be unconditional on the actor beyond their role:

| Condition | Required behaviour |
|---|---|
| The admin holds no community assignment, active or deactivated | Irrelevant — the full result MUST still be returned; no community-assignment scope resolution MUST decide it |
| The admin has no maintenance company | Irrelevant — the full result MUST still be returned; there MUST be no fail-closed branch, because there is no scope to fail closed on |
| A session's community has been deactivated or soft-deleted | The session MUST **still be visible** |
| A session's maintenance company has been deactivated or soft-deleted | The session MUST **still be visible** |
| A session carries no performing-company attribution | The session MUST **still be visible** |
| A session was performed by a user who has since transferred, been deactivated or been soft-deleted | The session MUST **still be visible** |

That divergence from the other three scopes is deliberate and MUST NOT be
"corrected": a representative loses a deactivated assignment's
communities and a manager fails closed on an absent company because those
scopes are operational; this one is a total system audit, and deleted or
deactivated context MUST NOT hide a compliance record from the auditor.

Scope MUST still be evaluated in addition to, never instead of, the
role/permission check: a `SYSTEM_ADMIN` MUST reach a history endpoint
only by holding `reviewSession:read`, and authentication MUST still be
evaluated before both. The `completed` status filter MUST still apply:
a `draft` MUST NOT be listed and MUST NOT be readable by id, for this
actor either.

This grant MUST apply to history **reads** only — the lists and the by-id
read alike — and MUST confer nothing on the review-session write surface.

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

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN the admin history path after this change
- WHEN the guards on every history endpoint are inspected
- THEN each MUST still require a `reviewSession:*` permission, and the role MUST NOT substitute for it

#### Scenario: Unauthenticated caller is rejected before the role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

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
| `SYSTEM_ADMIN` | **Every** `completed` session in the installation, with no scope predicate at all — see *Installation-Wide Review History Scope for a System Admin*. Neither a community assignment nor a maintenance company is involved, and deactivated or soft-deleted context hides nothing |
| Any other role | Nothing |

(Previously: only the technician, representative and company-manager
scopes existed, and `SYSTEM_ADMIN` was in the "any other role" row,
holding no `reviewSession:*` permission and therefore no history scope.)

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

The three assignment- and company-derived scopes above MUST be unchanged
by the addition of the admin scope: widening one role's visibility MUST
NOT widen another's, and the technician, representative and manager
results MUST be identical before and after this change.

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

#### Scenario: The four scopes are proven side by side
- GIVEN one installation containing completed sessions across two companies, two communities and two technicians
- WHEN a technician, a representative, a manager and a `SYSTEM_ADMIN` each request review history
- THEN each MUST receive exactly its own scope's sessions — and the technician's, representative's and manager's results MUST be identical to what they were before this change

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

FR-008's global visibility scope is now **half** built: the
`SYSTEM_ADMIN` half ships in this change (see *Installation-Wide Review
History Scope for a System Admin*). The `MANAGER` half stays deliberately
unbuilt, and no permission, capability or role row MUST anticipate it.
`MANAGER` MUST remain mapped to `[]` in `ROLE_PERMISSIONS`. No
`ManagerCapability` enum, `User.managerCapabilities` field, migration or
capability-gated permission layer MUST exist, and no `VIEW_ALL_REVIEWS`
permission or capability MUST be declared.

Exactly **one** unscoped "all sessions" history read MUST exist, and it
MUST be reachable only by a `SYSTEM_ADMIN`. No second unscoped read MUST
be introduced, and no other role MUST reach that one, on any route, under
any circumstance.

A user's `maintenanceCompanyId` MUST affect history authorization
**only** through the `MAINTENANCE_COMPANY_MANAGER` scope defined in
*Company-Wide Review History Scope for a Maintenance Company Manager*. It
MUST have no effect on a `MAINTENANCE_TECHNICIAN`'s, a
`COMMUNITY_REPRESENTATIVE`'s or a `SYSTEM_ADMIN`'s history scope, and
MUST grant no permission to any role.
(Previously: the whole global scope was deferred — `SYSTEM_ADMIN`'s row
had to be unchanged with no `reviewSession:*` member, and **no** unscoped
"all sessions" history read was allowed to exist for any caller.)

#### Scenario: MANAGER stays mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` entry is read
- THEN it MUST equal `[]`

#### Scenario: No manager capability mechanism is introduced
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: The one unscoped history read is reachable only by the admin
- GIVEN every history read path after this change
- WHEN its scope is inspected
- THEN each MUST be scoped to a performer, a set of assigned communities, or one maintenance company — except exactly one installation-wide read, which MUST be reachable only when the caller's role is `SYSTEM_ADMIN`

#### Scenario: No non-admin role reaches the installation-wide result
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER`
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

### Requirement: Technician and Representative Become Operational

The system MUST grant the `reviewSession:*` permissions to
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` in
`ROLE_PERMISSIONS`. Both roles MUST receive the **same** review-session
permission set, because both perform sessions through the identical flow.
Neither MUST receive any other permission family. `MANAGER` MUST remain
`[]`; `MAINTENANCE_COMPANY_MANAGER` MUST hold exactly
`['reviewSession:read']` and nothing more (see *The Maintenance Company
Manager Becomes Operational*). `SYSTEM_ADMIN`'s row MUST gain no
`reviewSession:*` member beyond `reviewSession:read` (see *The System
Admin Becomes Operational on Review History Reads*). The table MUST
remain an exhaustive `Record<Role, Permission[]>`, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged:
the scope dimension is added beside it, not inside it.
(Previously: asserted that `SYSTEM_ADMIN`'s row MUST NOT gain **any**
`reviewSession:*` permission and MUST be identical before and after.)

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
`discard`) and **no** other permission family. `MANAGER` MUST remain
`[]`. `SYSTEM_ADMIN` MUST hold `reviewSession:read` and no other member
of the family, granted by *The System Admin Becomes Operational on Review
History Reads*; the two roles share the permission and differ only in the
scope it reaches. The table MUST remain an exhaustive `Record<Role,
Permission[]>`, and `PermissionChecker.can(role, permission)`'s signature
MUST be unchanged: the company scope is added beside it, not inside it.
(Previously: additionally asserted that `SYSTEM_ADMIN`'s row MUST be
unchanged and MUST NOT gain any `reviewSession:*` permission.)

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

#### Scenario: The manager's own scope is unchanged by the admin scope
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X and completed sessions attributed to companies X and Y
- WHEN they request review history after this change
- THEN the result MUST be exactly what it was before this change — only X's sessions, with no widening

#### Scenario: MANAGER is untouched and the admin holds read only
- GIVEN the `MANAGER` and `SYSTEM_ADMIN` entries before and after this change
- WHEN they are compared
- THEN `MANAGER` MUST still equal `[]`, and `SYSTEM_ADMIN`'s only difference MUST be the added `reviewSession:read`
