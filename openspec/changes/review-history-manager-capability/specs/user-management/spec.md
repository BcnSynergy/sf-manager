# Delta for User Management

> **Purpose amendment (for archive):** the capability's Purpose describes
> admin-only CRUD over `User` records. After this change the same CRUD
> surface also carries the app's **first privilege grant**: an optional
> `managerCapabilities` on `PATCH /users/:id`, gated by the existing
> `user:update` permission, through which a `SYSTEM_ADMIN` grants and
> revokes ADR-011 Decision 2's `VIEW_ALL_REVIEWS`. It is deliberately an
> **edit-only** field: `POST /users` and `createUserSchema` are untouched,
> so a `MANAGER` is always created inert and granting is a deliberate
> second act. What the capability then unlocks is owned by `authorization`
> and `review-history`; this capability owns only who may set it and what
> states are legal.

## ADDED Requirements

### Requirement: Manager Capabilities Are Meaningful Only for a Manager

The system MUST treat `User.managerCapabilities` as meaningful **only**
when the user's role is `MANAGER`, and MUST enforce that against the
**resulting** state of every write, not against the payload alone and not
in the client.

Two rules MUST hold for every write, regardless of payload shape, field
ordering, or which client issued it:

| Resulting state | Required behaviour |
|---|---|
| Resulting role is `MANAGER` | Capabilities MAY be set, and MUST persist exactly as submitted |
| Resulting role is **not** `MANAGER`, and the same request supplies a non-empty capability list | The request MUST be rejected with a distinct, cause-specific code `MANAGER_CAPABILITIES_NOT_ALLOWED`, and **no** field MUST be changed |
| Resulting role is **not** `MANAGER`, and the user currently holds capabilities | The capabilities MUST be **cleared** as part of that same change, whether or not the request mentions them |

The clearing rule is deliberately **stricter** than the shipped
`maintenanceCompanyId` rule, which is left untouched on a role change
away from a maintenance role: a company is an identity fact, while a
capability is a privilege grant, and a stale grant MUST NOT silently
reappear. A user changed away from `MANAGER` and later changed back MUST
therefore hold **no** capability until it is granted again — including
when the demotion and the later promotion arrive as two **separate**
requests with no intervening explicit grant, and including when a
promotion **into** `MANAGER` happens to race a still-in-flight capability
grant for the same user.

Both directions of this rule MUST be enforced **transactionally**, not
merely "server-side" as a sequence of independent reads and writes: the
resulting role and the resulting capability list MUST be computed and
written from the **same, freshly-read** row inside one atomic write, so
that two near-simultaneous requests against the same user — one changing
`role` away from `MANAGER`, one granting a capability — cannot each
observe a pre-race snapshot and commit in an interleaving that leaves the
resulting row holding a non-`MANAGER` role **and** a non-empty
`managerCapabilities` array at the same time. That combination MUST be
unreachable, not merely unlikely.

No path MUST grant a capability at creation: `POST /users` and its
request contract MUST NOT accept `managerCapabilities`, and a newly
created `MANAGER` MUST hold an empty capability list.

Granting and revoking MUST require **no new permission**: the existing
`user:update` gate MUST be the only authority, and no
`user:grantCapability`-style permission and no second grantor role MUST
be introduced. No audit record of a grant or revoke MUST be written.

#### Scenario: A capability is granted to a manager
- GIVEN an existing user with role `MANAGER` holding no capability
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with `managerCapabilities: ['VIEW_ALL_REVIEWS']`
- THEN the response MUST be 2xx and the persisted user MUST hold exactly `['VIEW_ALL_REVIEWS']`

#### Scenario: A capability is revoked through the same field
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with `managerCapabilities: []`
- THEN the response MUST be 2xx and the persisted user MUST hold no capability — no separate revoke endpoint MUST be required

#### Scenario: A capability set for a non-manager resulting role is rejected
- GIVEN an existing user with role `COMMUNITY_REPRESENTATIVE`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with `managerCapabilities: ['VIEW_ALL_REVIEWS']`, with or without a `role` field
- THEN the response MUST be a 4xx error with `code: MANAGER_CAPABILITIES_NOT_ALLOWED` and no field MUST be changed

#### Scenario: A capability set alongside a role change away from MANAGER is rejected
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `SYSTEM_ADMIN` while also supplying `managerCapabilities: ['VIEW_ALL_REVIEWS']`
- THEN the response MUST be a 4xx error with `code: MANAGER_CAPABILITIES_NOT_ALLOWED` and no field MUST be changed

#### Scenario: Capabilities are cleared on a role change away from MANAGER
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing only `role` to `COMMUNITY_REPRESENTATIVE`, without mentioning `managerCapabilities`
- THEN the response MUST be 2xx, the role MUST be updated, and the persisted `managerCapabilities` MUST be empty

#### Scenario: Clearing is enforced server-side regardless of client or payload shape
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN the role change away from `MANAGER` is submitted directly to the API, bypassing the web form entirely
- THEN the capabilities MUST still be cleared — the guarantee MUST NOT depend on any client behaviour

#### Scenario: A role round trip leaves no capability behind
- GIVEN a `MANAGER` holding `['VIEW_ALL_REVIEWS']` whose role is changed to `SYSTEM_ADMIN` and later changed back to `MANAGER`
- WHEN the resulting user is read
- THEN `managerCapabilities` MUST be empty

#### Scenario: A promotion into MANAGER never silently re-grants a stale capability
- GIVEN a user whose row still carries a non-empty `managerCapabilities` array left over from a prior time they held role `MANAGER` (however that row-state arose)
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `MANAGER` without supplying `managerCapabilities` in that same request
- THEN the response MUST be 2xx and the resulting `managerCapabilities` MUST be empty — a capability survives a promotion into `MANAGER` only when the **same** request that performs the promotion explicitly supplies it

#### Scenario: Two concurrent writes cannot leave a non-MANAGER row holding a capability
- GIVEN a `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN two requests against the same user id race — one changing `role` away from `MANAGER` with no mention of `managerCapabilities`, the other granting `managerCapabilities: ['VIEW_ALL_REVIEWS']` with no mention of `role` — submitted close enough together that a non-transactional implementation could interleave their reads
- THEN both requests MUST be resolved against a consistent, serialized ordering, and the resulting row MUST NEVER hold a role other than `MANAGER` together with a non-empty `managerCapabilities` array, regardless of which request's write lands last

#### Scenario: Creation cannot grant a capability
- GIVEN the create-user request contract and `createUserSchema` after this change
- WHEN they are inspected, and a `MANAGER` is created
- THEN neither MUST accept `managerCapabilities`, and the created user MUST hold an empty capability list

#### Scenario: No new permission and no audit record ship
- GIVEN the `Permission` union, the route's permission metadata and the schema after this change
- WHEN they are inspected
- THEN the grant MUST be gated by `user:update` alone, no capability-granting permission MUST exist, and no audit table, event or write MUST record a grant, a revoke or a role change

### Requirement: Every User Response Carries the Manager Capabilities

Every response that represents a user — the list, the create response and
the update response — MUST carry `managerCapabilities` on the **shared**
user representation, so a client can render the current grant without any
additional request. It MUST be an array, empty rather than absent when
the user holds no capability, and present for every role, not only for
`MANAGER`.

No `GET /users/:id` MUST be added for this: the shared list response MUST
remain sufficient to prefill an edit form. Responses MUST still exclude
password hashes and MUST still exclude soft-deleted users from the list.

#### Scenario: The list response carries the field for every user
- GIVEN an installation containing a granted `MANAGER`, an ungranted `MANAGER` and users of other roles
- WHEN a `SYSTEM_ADMIN` lists users
- THEN each user MUST carry `managerCapabilities` as an array — `['VIEW_ALL_REVIEWS']` for the granted manager and empty for everyone else — and none MUST carry a password hash

#### Scenario: The update response reflects the new grant
- GIVEN a `SYSTEM_ADMIN` grants `VIEW_ALL_REVIEWS` to a `MANAGER`
- WHEN the update response is read
- THEN it MUST carry `managerCapabilities: ['VIEW_ALL_REVIEWS']`

#### Scenario: No per-user read endpoint is added
- GIVEN the users routes after this change
- WHEN they are enumerated
- THEN no `GET /users/:id` MUST exist — the list response MUST be the source for prefilling an edit form

## MODIFIED Requirements

### Requirement: Update User

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing user's email, role, `maintenanceCompanyId` and/or
`managerCapabilities` by user id (not by email upsert). Updating a user's
role to any value other than `SYSTEM_ADMIN` is subject to the Last-Admin
Lockout invariant below. Every update MUST leave the user in a state
consistent with the `maintenanceCompanyId` invariant: when the resulting
role is `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN`, the
resulting `maintenanceCompanyId` MUST be non-null and reference a live
company; when the resulting role is `SYSTEM_ADMIN`, `MANAGER`, or
`COMMUNITY_REPRESENTATIVE`, a `maintenanceCompanyId` supplied in the same
request MUST be rejected. Changing role away from a maintenance role MUST
leave any existing `maintenanceCompanyId` untouched — the system MUST NOT
auto-clear it and MUST NOT reject the request because of it; only an
explicit `maintenanceCompanyId` value in the same or a later request
changes it.

Every update MUST also leave the user in a state consistent with the
capability invariant defined in *Manager Capabilities Are Meaningful Only
for a Manager*: capabilities are legal only when the **resulting** role
is `MANAGER`, a capability supplied for any other resulting role MUST be
rejected with `MANAGER_CAPABILITIES_NOT_ALLOWED`, and a role change away
from `MANAGER` MUST **clear** them — unlike `maintenanceCompanyId`,
which is deliberately left untouched.

The shipped partial-`PATCH` contract MUST hold for the new field, with
both of its values meaning something distinct and neither meaning
"nothing happened" by accident:

| `managerCapabilities` in the request | Required behaviour |
|---|---|
| Absent | Unchanged — except where the capability invariant requires clearing |
| `[]` | An explicit **revoke**: the user MUST end the request holding no capability |
| `['VIEW_ALL_REVIEWS']` | A **grant**, legal only when the resulting role is `MANAGER` |

The field MUST accept only declared `ManagerCapability` members; an
unknown capability name MUST be rejected as a validation error.
(Previously: accepted email, role and/or `maintenanceCompanyId` only, and
had no knowledge of `managerCapabilities`.)

#### Scenario: Admin updates a user's email
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target user id exists
- WHEN they submit a new email for that user id
- THEN the response MUST be 2xx and the user's email MUST be updated

#### Scenario: Update targets a non-existent user
- GIVEN a user id that does not correspond to an existing user
- WHEN an admin attempts to update it
- THEN the response MUST be a 4xx error (not found)

#### Scenario: Admin moves a maintenance-role user to a different company
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a valid `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with a different, existing, non-soft-deleted `maintenanceCompanyId`
- THEN the response MUST be 2xx and the user's `maintenanceCompanyId` MUST reflect the new company

#### Scenario: Role change away from a maintenance role leaves maintenanceCompanyId untouched
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing only `role` to `MANAGER`, without mentioning `maintenanceCompanyId`
- THEN the response MUST be 2xx, the role MUST be updated, and `maintenanceCompanyId` MUST remain exactly as it was

#### Scenario: Missing company when changing role to a maintenance role rejected
- GIVEN an existing user with role `MANAGER` and no `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `MAINTENANCE_COMPANY_MANAGER` without supplying a `maintenanceCompanyId`
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_REQUIRED` and no field MUST be changed

#### Scenario: Company id rejected when changing role to a non-maintenance role
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `COMMUNITY_REPRESENTATIVE` while also supplying a `maintenanceCompanyId`
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_NOT_ALLOWED` and no field MUST be changed

#### Scenario: An absent capability field changes nothing
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing only the email, without mentioning `managerCapabilities`
- THEN the response MUST be 2xx and the user MUST still hold `['VIEW_ALL_REVIEWS']`

#### Scenario: An empty capability array revokes
- GIVEN an existing `MANAGER` holding `['VIEW_ALL_REVIEWS']`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with `managerCapabilities: []` and no other change
- THEN the response MUST be 2xx and the user MUST hold no capability

#### Scenario: An unknown capability name is rejected
- GIVEN an existing `MANAGER`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with a capability name that is not a declared `ManagerCapability` member
- THEN the response MUST be a 4xx validation error and no field MUST be changed

#### Scenario: Capability rejection is distinguishable from the company causes
- GIVEN a request rejected for supplying a capability on a non-`MANAGER` resulting role
- WHEN its error code is compared with `MAINTENANCE_COMPANY_REQUIRED`, `MAINTENANCE_COMPANY_NOT_ALLOWED` and `MAINTENANCE_COMPANY_NOT_FOUND`
- THEN it MUST be `MANAGER_CAPABILITIES_NOT_ALLOWED` and MUST differ from all three
