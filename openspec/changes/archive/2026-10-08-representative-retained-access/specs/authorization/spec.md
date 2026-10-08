# Delta for Authorization

## MODIFIED Requirements

### Requirement: Resource Scope for Review History Reads

Holding a review-session read permission MUST grant history visibility
**only** through the scope its holder's role resolves, and that scope
MUST differ by role:

| Caller | History scope granted |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Sessions where `performedById` equals the caller — **and nothing else**. No community assignment is required, active or otherwise |
| `COMMUNITY_REPRESENTATIVE` | The union of (a) all `completed` sessions of every community the caller holds an **active** community-representative assignment to, **regardless of who performed them**, and (b) every `completed` session where `performedById` equals the caller, **on any community and with no assignment required, active or otherwise** |
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
"any other role | Nothing" row. The `COMMUNITY_REPRESENTATIVE` row was
only "all `completed` sessions of every community the caller holds an
**active** community-representative assignment to, regardless of who
performed them", with no own-performed branch.)

Scope MUST be evaluated in addition to, never instead of, the
role/permission check, and MUST apply to every history endpoint — the
lists and the by-id read alike.

A deactivated assignment (`deactivatedAt` set) MUST NOT confer history
scope over sessions the caller did not perform, and the loss MUST take
effect on the caller's next request, with no grace period and no cached
grant. **Reversed with the product owner on 2026-09-09:** that rule MUST
NOT extend to the caller's own performed sessions. A
`MAINTENANCE_TECHNICIAN` MUST retain access to the sessions they
personally performed, permanently, regardless of whether they still hold
an active community-technician assignment to those sessions' community —
the performer relation alone confers scope over the caller's own work.
**Extended to the `COMMUNITY_REPRESENTATIVE` with the product owner on
2026-10-08:** the identical rule applies — a representative MUST retain
access to the sessions they personally performed (and signed), on any
community, whether or not they hold an active community-representative
assignment to it. (Previously — confirmed 2026-09-08 and now reversed —
a deactivated assignment removed access to the technician's own performed
sessions too; and, until 2026-10-08, to the representative's too.)

That relaxation is strictly bounded to the caller's own performed
sessions. A `MAINTENANCE_TECHNICIAN` MUST still see **no** session
performed by anyone else, on any community, whether or not they hold an
active assignment there. A `COMMUNITY_REPRESENTATIVE` MUST still see **no**
session performed by anyone else on a community to which they hold no
active representative assignment. The assignment-derived
`COMMUNITY_REPRESENTATIVE` scope — the only one that reaches sessions the
caller did not perform — MUST still require an active assignment at
request time, exactly as shipped.

This requirement governs history **reads** only. *Resource Scope — an
Active Assignment Is Required Beyond the Permission* MUST remain in force
unchanged over the review-session **write** surface: a technician or
representative whose assignment to a community has been deactivated MUST
still be refused when opening, resuming, resolving a code against,
recording against, discarding or completing a session for it.

Rejection for an out-of-scope session MUST NOT disclose that the session
exists: it MUST reuse the same status, error code and message as a
nonexistent session, per *Resource Scope — an Active Assignment Is
Required Beyond the Permission*.

#### Scenario: A representative's history is limited to actively assigned communities
- GIVEN a `COMMUNITY_REPRESENTATIVE` with an active representative assignment to community C and none to community D, and who performed no session on D
- WHEN they request review history and then request a completed session of D by id
- THEN the history MUST contain C's completed sessions only, and the D request MUST be refused indistinguishably from a nonexistent session
(Previously: no "performed no session on D" qualifier.)

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

#### Scenario: A representative's own history survives assignment deactivation
- GIVEN a `COMMUNITY_REPRESENTATIVE` who personally performed and signed `completed` session S on community C and can read it
- WHEN their representative assignment to C is deactivated and they repeat both the list and the by-id request
- THEN S MUST still be listed and the by-id request MUST still succeed
(Previously, in this position: "Deactivating a representative assignment removes history access on the next request" — a representative lost all C sessions, including their own.)

#### Scenario: A deactivated representative still sees no one else's sessions
- GIVEN representative R, whose assignment to community C has been deactivated, session S1 on C performed by R, and session S2 on C performed by technician W
- WHEN R requests review history and then requests S2 by id
- THEN the list MUST contain S1 and MUST NOT contain S2, and the S2 request MUST be refused indistinguishably from a nonexistent session, the same `404 REVIEW_SESSION_NOT_FOUND` as an unknown identifier

#### Scenario: An active representative sees the union of community and own sessions
- GIVEN representative R actively assigned to community C only, session S1 on C performed by technician W, and session S2 on community D performed by R, with R's assignment to D never having existed or being deactivated
- WHEN R requests review history
- THEN the list MUST contain both S1 and S2, and a session on D performed by anyone else MUST NOT appear

#### Scenario: Deactivation removes others' sessions on the next request
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who has just listed C's completed sessions, including ones performed by others
- WHEN their assignment is deactivated and the identical request is repeated
- THEN the sessions performed by others MUST no longer be returned, immediately and with no cached grant
(Previously: "the request MUST be refused or return no C sessions".)

#### Scenario: A deactivated representative's write surface stays closed
- GIVEN a `COMMUNITY_REPRESENTATIVE` whose assignment to community C has been deactivated but who can still read their own completed sessions for C
- WHEN they attempt to open, resume, record against, discard or complete a session for C
- THEN every one of those requests MUST be refused and MUST perform no write

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
- THEN each MUST receive exactly its own scope's sessions — the granted manager's result identical to the admin's, the ungranted manager's empty, and the technician's, company manager's and admin's results identical to what they were before this change, and the representative's identical to before this change for a representative who performed no session outside their actively assigned communities

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

### Requirement: Entry-Level Resource Scope for the Element-Keyed Review History Read

The scope table in *Resource Scope for Review History Reads* MUST apply,
**unchanged and role for role**, to the element-keyed history read — with
its unit of visibility being the element review **entry** rather than the
whole session. Each caller MUST see exactly the entries belonging to
sessions their existing scope already reaches:

| Caller | Entries visible on element E |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Only entries **they** recorded — and nothing else, regardless of assignment |
| `COMMUNITY_REPRESENTATIVE` | Every entry on E iff they hold an **active** representative assignment to E's community; otherwise only the entries **they** recorded, and nothing else |
| `MAINTENANCE_COMPANY_MANAGER` | Only entries whose session's frozen performing-company attribution equals their own company; nothing if their own company is absent; never an unattributed session's entry |
| `SYSTEM_ADMIN` | Every entry on E, unconditionally |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | Every entry on E, identical to `SYSTEM_ADMIN` |
| `MANAGER` without the capability | Nothing |
(Previously: the representative row read "Every entry on E iff they hold an **active** representative assignment to E's community; otherwise nothing".)

This table is exhaustive over `Role`. No sixth scope, no element-specific
exception and no narrower technician rule MUST be introduced, and no
existing scope MUST be widened or narrowed by this change beyond the
representative's own-entries relaxation above. Scope MUST be
evaluated in addition to, never instead of, the permission check.

Immediacy MUST hold exactly as at session level: a deactivated
representative assignment and a revoked `VIEW_ALL_REVIEWS` capability
MUST each take effect on the caller's **very next** request to this
endpoint, with no grace period and no cached grant. A technician's or
representative's own recorded entries MUST stay visible permanently,
unaffected by their assignment's deactivation, and that relaxation MUST
stay bounded to their own entries.

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
- GIVEN element E on community D, a representative actively assigned to community C only, and a representative whose assignment to D has just been deactivated, neither of whom recorded any entry on E
- WHEN each requests E's history
- THEN both MUST be refused indistinguishably from a nonexistent element, immediately and with no cached grant
(Previously: no "recorded any entry on E" qualifier.)

#### Scenario: A deactivated representative keeps only their own entries on the element
- GIVEN representative R recorded an entry on element E of community C, technician W recorded another, and R's assignment to C has been deactivated
- WHEN R requests E's history
- THEN exactly R's own entry MUST be returned, and W's MUST NOT appear in any form

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
