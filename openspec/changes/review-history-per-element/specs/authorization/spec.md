# Delta for Authorization

> **Purpose amendment (for archive):** the capability's Purpose records
> five roles operational on the review-history **read surface**. After
> this change that surface has a **second** endpoint — the element-keyed
> history read — and the authorization story is unchanged in every
> dimension that matters: the same permission (`reviewSession:read`), the
> same guard order, the same five scopes, the same `PermissionChecker.can`
> signature, and **no `ROLE_PERMISSIONS` change of any kind**. The only
> new authorization statement is *where* the gate sits: this is a
> review-history read that happens to be keyed by an element, so it is
> gated on `reviewSession:read` and **never** on `inspectableElement:read`
> — a permission `SYSTEM_ADMIN` holds alone, and which would silently
> collapse a five-scope feature to one role.

## ADDED Requirements

### Requirement: The Element-Keyed Review History Read Is Gated on reviewSession:read, Never on inspectableElement:read

The element-keyed review history read MUST require the
`reviewSession:read` permission and **only** that permission. It MUST NOT
require, consult, imply or be widened by any member of the
`inspectableElement:*` family, even though its URL is nested under an
element and its response carries an element header. It is a review-history
read keyed by an element, not an element-management read.

`ROLE_PERMISSIONS` MUST be **unchanged** by this change: no role gains a
permission, no role loses one, and in particular **no role gains
`inspectableElement:read`**, which MUST remain held by `SYSTEM_ADMIN`
alone. The `Permission` union MUST gain no member, and
`PermissionChecker.can(role, permission)`'s signature MUST be unchanged —
no user, capability, element or resource argument, and no database read.

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

#### Scenario: The permission table is byte-unchanged
- GIVEN `ROLE_PERMISSIONS` and the `Permission` union before and after this change
- WHEN they are compared
- THEN they MUST be identical — no permission added, removed or moved between roles

#### Scenario: No role gains inspectableElement:read
- GIVEN every role's entry after this change
- WHEN the `inspectableElement:*` family is searched for across them
- THEN only `SYSTEM_ADMIN` MUST hold any member of it, exactly as before this change

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

### Requirement: Entry-Level Resource Scope for the Element-Keyed Review History Read

The scope table in *Resource Scope for Review History Reads* MUST apply,
**unchanged and role for role**, to the element-keyed history read — with
its unit of visibility being the element review **entry** rather than the
whole session. Each caller MUST see exactly the entries belonging to
sessions their existing scope already reaches:

| Caller | Entries visible on element E |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Only entries **they** recorded — and nothing else, regardless of assignment |
| `COMMUNITY_REPRESENTATIVE` | Every entry on E iff they hold an **active** representative assignment to E's community; otherwise nothing |
| `MAINTENANCE_COMPANY_MANAGER` | Only entries whose session's frozen performing-company attribution equals their own company; nothing if their own company is absent; never an unattributed session's entry |
| `SYSTEM_ADMIN` | Every entry on E, unconditionally |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | Every entry on E, identical to `SYSTEM_ADMIN` |
| `MANAGER` without the capability | Nothing |

This table is exhaustive over `Role`. No sixth scope, no element-specific
exception and no narrower technician rule MUST be introduced, and no
existing scope MUST be widened or narrowed by this change. Scope MUST be
evaluated in addition to, never instead of, the permission check.

Immediacy MUST hold exactly as at session level: a deactivated
representative assignment and a revoked `VIEW_ALL_REVIEWS` capability
MUST each take effect on the caller's **very next** request to this
endpoint, with no grace period and no cached grant. A technician's own
recorded entries MUST stay visible permanently, unaffected by their
assignment's deactivation, and that relaxation MUST stay bounded to their
own entries.

Rejection MUST disclose nothing beyond the caller's entitlement: the
outcomes are fixed by *Element Reachability Decides 404 Versus an Empty
History* (owned by `review-history`), under which an element the caller
cannot reach is `404 INSPECTABLE_ELEMENT_NOT_FOUND`, identical in status,
code and message to an unknown element.

This grant applies to **reads** only and MUST confer nothing on the
review-session write surface or on the element-management write surface.

#### Scenario: The five scopes are proven side by side on one shared element
- GIVEN one element reviewed in `completed` sessions by two technicians of two different maintenance companies, in a community the caller relationships differ over
- WHEN a technician, a representative, a company manager, a `SYSTEM_ADMIN`, a granted `MANAGER` and an ungranted `MANAGER` each request that element's history
- THEN each MUST receive exactly its own scope's entries — the technician only their own, the company manager only their own company's, the representative all of them, the admin and granted manager all of them and identical to each other, and the ungranted manager a `404 INSPECTABLE_ELEMENT_NOT_FOUND`

#### Scenario: A technician never sees another technician's entry on a shared element
- GIVEN technicians U and W both recorded entries on the same element E in different `completed` sessions
- WHEN U requests E's history
- THEN only U's own entry MUST be returned, and W's MUST NOT appear in any form — not as a row, a count, a date or a redacted placeholder

#### Scenario: A company manager never sees another company's entry on a shared element
- GIVEN element E was reviewed in a session attributed to company X and in another attributed to company Y
- WHEN X's manager requests E's history
- THEN only the X-attributed entry MUST be returned, and Y's MUST NOT appear in any form

#### Scenario: A representative's element history is bounded by an active assignment
- GIVEN element E on community D, a representative actively assigned to community C only, and a representative whose assignment to D has just been deactivated
- WHEN each requests E's history
- THEN both MUST be refused indistinguishably from a nonexistent element, immediately and with no cached grant

#### Scenario: Revoking the capability removes element history on the next request
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` who has just read an element's full history
- WHEN the capability is revoked and the identical request is repeated on the same session cookie
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, immediately and with no cached grant

#### Scenario: A technician's own entries survive their assignment's deactivation
- GIVEN technician U recorded an entry on element E of community C and can read E's history
- WHEN U's technician assignment to C is deactivated and the identical request is repeated
- THEN U's own entry MUST still be returned, and no entry recorded by anyone else MUST have become visible

#### Scenario: The company scope still fails closed on both sides
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose own maintenance company is absent, and an element whose only entry belongs to a session carrying no performing-company attribution
- WHEN the first requests any element's history and every company manager requests the second element's history
- THEN the first MUST be refused with no repository read issued, and the unattributed entry MUST appear for no manager at all

#### Scenario: Scope is checked in addition to the permission, not instead of it
- GIVEN the element-keyed history endpoint after this change
- WHEN the order of its checks is verified
- THEN authentication MUST run first, the permission check second and rejectable with 403 before any scope resolution, and scope resolution third — and no scope MUST be able to substitute for the permission

#### Scenario: The write surfaces gain nothing
- GIVEN any of the five roles able to read an element's history
- WHEN each calls a review-session write endpoint and an element-management write endpoint
- THEN each response MUST be exactly what it was before this change, with no write performed

## MODIFIED Requirements

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
read MUST be introduced, and no other role, and no ungranted `MANAGER`,
MUST reach either, on any route, under any circumstance. An element
identifier MUST NOT be mistaken for an actor scope: it narrows which
entries are candidates and confers no visibility of its own.

A user's `maintenanceCompanyId` MUST affect history authorization
**only** through the `MAINTENANCE_COMPANY_MANAGER` scope defined in
*Company-Wide Review History Scope for a Maintenance Company Manager*, on
both read surfaces. It MUST have no effect on a
`MAINTENANCE_TECHNICIAN`'s, a `COMMUNITY_REPRESENTATIVE`'s, a
`SYSTEM_ADMIN`'s or a `MANAGER`'s history scope, and MUST grant no
permission to any role. Symmetrically, `managerCapabilities` MUST affect
authorization **only** through the `MANAGER` history scope, and MUST
grant nothing to any other role and nothing outside the review-history
reads.

No audit log of capability or role grants MUST ship: no table, no event,
no write. This matches ADR-011 Decision 5, under which role changes are
equally unaudited today.
(Previously: **per-element** history was listed alongside the five
remaining capability names as deferred, and exactly one actor-unscoped
read was allowed to exist. Per-element history now ships — the deferral
is narrowed, not deleted: it becomes a bound on what shipped, namely one
element-keyed read family, five scopes applied at entry level, no new
permission, no `ROLE_PERMISSIONS` change, and a second actor-unscoped
read reachable from exactly the same two actor paths as the first.)

#### Scenario: MANAGER holds one permission and, by default, no capability
- GIVEN `ROLE_PERMISSIONS` and a newly created `MANAGER` after this change
- WHEN the entry and the user record are read
- THEN the entry MUST equal exactly `['reviewSession:read']` and the user's `managerCapabilities` MUST be empty — a capability is never held until a `SYSTEM_ADMIN` grants it

#### Scenario: Exactly one capability is declared
- GIVEN the `ManagerCapability` enum, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: Each actor-unscoped history read is reachable from exactly two paths
- GIVEN every history read path after this change, session-level and element-keyed alike
- WHEN its scope is inspected
- THEN each MUST be scoped to a performer, a set of assigned communities, or one maintenance company — except exactly one installation-wide session read and exactly one installation-wide element-keyed read, each of which MUST be reachable only when the caller is a `SYSTEM_ADMIN`, or a `MANAGER` whose `VIEW_ALL_REVIEWS` capability has resolved affirmatively

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
- THEN they MUST contain only `reviewSession:*` members — no `user:*`, `community:*`, `maintenanceCompany:*`, `inspectableElement:*`, `checklistQuestion:*` or `reviewTemplate:*` permission

#### Scenario: No capability or role grant is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of capability or role grants
- THEN no audit table, audit event or audit write MUST exist
