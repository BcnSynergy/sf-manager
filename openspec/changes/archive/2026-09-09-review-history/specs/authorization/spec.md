# Delta for Authorization

> **Purpose amendment (for archive):** the capability's Purpose describes
> `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` as operational
> "**only** on the review-session surface". That stays true — the review
> **history** reads added by this change are part of that same surface and
> are governed by the same permission family and the same
> active-assignment scope dimension. What this change adds is the scope
> *shape* for reads that are not the caller's own draft: a representative
> may now read sessions they did not perform, on their actively assigned
> communities only. `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` remain
> fully inert, and `SYSTEM_ADMIN` still holds no `reviewSession:*`
> permission.

## ADDED Requirements

### Requirement: Resource Scope for Review History Reads

Holding a review-session read permission MUST grant history visibility
**only** through the caller's own currently-active community assignment,
and the scope MUST differ by the caller's assignment kind:

| Caller | History scope granted |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Sessions where `performedById` equals the caller, **and** the caller holds an active community-technician assignment to that session's community |
| `COMMUNITY_REPRESENTATIVE` | All `completed` sessions of every community the caller holds an active community-representative assignment to, **regardless of who performed them** |
| Any other role | Nothing |

Scope MUST be evaluated in addition to, never instead of, the
role/permission check, and MUST apply to every history endpoint —
the lists and the by-id read alike. A deactivated assignment
(`deactivatedAt` set) MUST NOT confer history scope, and the loss MUST
take effect on the caller's next request, with no grace period and no
cached grant. This applies to the caller's **own** performed sessions
too: a technician whose assignment is deactivated MUST lose access to
the sessions they personally performed on that community — confirmed
with the product owner on 2026-09-08, and stated as a requirement rather
than inherited by accident from the shipped scope check.

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

#### Scenario: A technician's own history requires a currently active assignment
- GIVEN a `MAINTENANCE_TECHNICIAN` who personally completed session S for community C and can read it
- WHEN their technician assignment to C is deactivated and they repeat both the list and the by-id request
- THEN S MUST no longer be listed and the by-id request MUST be refused — the performer relation alone MUST NOT confer scope

#### Scenario: Deactivating a representative assignment removes history access on the next request
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who has just listed C's completed sessions
- WHEN their assignment is deactivated and the identical request is repeated
- THEN the request MUST be refused or return no C sessions, immediately and with no cached grant

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN a caller actively assigned to community C whose role holds no `reviewSession:*` permission
- WHEN they call any history endpoint
- THEN the response MUST be 403 — the assignment MUST NOT substitute for the permission

#### Scenario: Unauthenticated caller is rejected before the role and scope checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the scope check MUST execute

#### Scenario: Every history endpoint declares a permission requirement
- GIVEN the history endpoints added by this change
- WHEN each one's permission metadata is inspected
- THEN every endpoint MUST require a `reviewSession:*` permission, with no exception, and none MUST be reachable on authentication alone

### Requirement: The Deferred Review Visibility Scopes Grant Nothing

FR-008's company-wide and global visibility scopes are deliberately not
built in this slice, and no permission, capability or role row MUST
anticipate them. `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` MUST remain
mapped to `[]` in `ROLE_PERMISSIONS`. `SYSTEM_ADMIN`'s row MUST be
unchanged and MUST NOT gain any `reviewSession:*` permission. No
`ManagerCapability` enum, `User.managerCapabilities` field, migration or
capability-gated permission layer MUST exist, and no `VIEW_ALL_REVIEWS`
permission or capability MUST be declared. A user's
`maintenanceCompanyId` MUST have no effect on any history authorization
decision.

#### Scenario: The two inert roles stay mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` entries are read
- THEN each MUST equal `[]`

#### Scenario: SYSTEM_ADMIN's permissions are unchanged
- GIVEN the `SYSTEM_ADMIN` entry before and after this change
- WHEN they are compared
- THEN they MUST be identical, with no `reviewSession:*` member added

#### Scenario: No manager capability or global-review mechanism is introduced
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: The company association confers no history scope
- GIVEN a `MAINTENANCE_TECHNICIAN` whose maintenance company serves community C, but who holds no active technician assignment to C
- WHEN they request review history and a completed session of C by id
- THEN no session of C MUST be returned and the by-id request MUST be refused

#### Scenario: The performing roles still gain nothing else
- GIVEN the `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries after this change
- WHEN they are read
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission
