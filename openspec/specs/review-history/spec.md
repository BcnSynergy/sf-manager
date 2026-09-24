# Review History

## Purpose

Reading completed reviews (FR-008). `review-session` (FR-007) shipped the
write path and left completed sessions unreadable: the only by-id read is
performer-scoped and the only list is the draft-resume list. This
capability adds the read side for **five** visibility scopes: a
`MAINTENANCE_TECHNICIAN` sees the sessions **they** performed, a
`COMMUNITY_REPRESENTATIVE` sees the sessions performed on **their**
actively assigned communities regardless of who performed them, a
`MAINTENANCE_COMPANY_MANAGER` sees every `completed` session attributed to
their own maintenance company, across every technician and every
community, with no community assignment involved, a `SYSTEM_ADMIN` sees
**every** `completed` session in the installation, with no scope filter at
all, and a `MANAGER` holding the `VIEW_ALL_REVIEWS` capability (ADR-011
Decision 2) sees **every** `completed` session in the installation,
identically to a `SYSTEM_ADMIN` — a `MANAGER` without it sees nothing. The
first two scopes are resolved by the shipped Layer 2 community-scope
check; the third is not — it resolves from the performing-company
attribution frozen onto the session (owned by `review-session-management`);
the fourth resolves from the role alone, with no scope predicate
whatsoever; the fifth resolves neither from an assignment, nor a company,
nor the role alone, but from a per-user capability read fresh from the
database on every request. Plus the completed-only rule and a scoped
read-back of one historical session. Who holds the permission, and each
scope rule itself, are owned by `authorization`; the field write flow is
owned by `review-session-management`; the web surface by
`review-history-ui`.

FR-008's role-based visibility axis closed with the fifth scope. This
change ships the other half: **FR-008 closes with this change.** The
capability adds a second, **element-keyed** read surface — every past
review of **one** inspectable element, across **every** session it was
ever reviewed in — resolved through the **same five** visibility scopes,
now applied at **entry** level instead of session level. No new scope, no
new permission and no new authorization primitive ship; the only
additive schema object is a single-column index on
`ElementReviewEntry.inspectableElementId` (no new table, column, enum,
backfill or data migration — see the guard requirements below). The
element-keyed read reuses `ReviewHistoryAccessService`'s
existing checkers branch for branch, and the element itself is resolved
through the shipped community-scoped element lookup, which is what makes
the `:communityId` segment verified rather than decorative. The
session-level surface is untouched.

Deliberately **not** here (deferred, see the guard requirements below):
the other five `ManagerCapability` names ADR-011 Decision 2 lists,
per-element history filtering, pagination, date filters, sorting and
search, and any write, scheduling or analytics path. Signing is
completion itself (`review-session-management`), and the review
document of one completed session is owned by `review-document`, which
reuses this capability's five scopes without widening any of them. No
requirement of this capability is weakened.

## Requirements

### Requirement: A Performer's Own Completed Review History

The system MUST let an authorized caller list the review sessions that
they themselves performed and whose status is `completed`. The list MUST
be scoped to `performedById = the caller` — a session performed by any
other user MUST NOT appear, on any route, under any circumstance. The
list MUST be returned in a deterministic chronological order by the
session's completion time, and that ordering direction MUST be identical
to the community-scoped list's. An empty result MUST be a successful
empty list, never an error.

#### Scenario: A technician lists the sessions they performed
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C has completed two sessions for C
- WHEN they request their own review history
- THEN the response MUST be 2xx and MUST contain exactly those two sessions, in deterministic chronological order by completion time

#### Scenario: Another performer's sessions never appear
- GIVEN technicians U and W are both actively assigned to community C and each has completed a session for C
- WHEN U requests their own review history
- THEN only U's session MUST be returned and W's session MUST NOT appear in the result under any field

#### Scenario: An empty history is a successful empty result
- GIVEN an authorized caller who has completed no session
- WHEN they request their own review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

### Requirement: A Representative's Community-Scoped Completed Review History

The system MUST let a `COMMUNITY_REPRESENTATIVE` list the `completed`
review sessions of **every community they are actively assigned to**,
**including sessions they did not perform**. A session belonging to a
community the caller holds no active representative assignment to MUST
NOT appear. When the caller is actively assigned to more than one
community, the result MUST be a single flat list covering all of them,
ordered by completion time exactly as the own-history list is. An empty
result MUST be a successful empty list, never an error.

#### Scenario: A representative sees a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C, and a `MAINTENANCE_TECHNICIAN` has completed a session for C
- WHEN the representative requests their community review history
- THEN the response MUST be 2xx and MUST contain that technician-performed session

#### Scenario: Another community's sessions never appear
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C and not to community D, and completed sessions exist for both
- WHEN they request their community review history
- THEN only C's sessions MUST be returned and no session of D MUST appear in the result under any field

#### Scenario: Multiple assignments produce one flat list
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to communities C and D, each with completed sessions
- WHEN they request their community review history
- THEN a single list MUST be returned containing the completed sessions of both, each row identifying its own community

### Requirement: A Maintenance Company Manager's Company-Wide Completed Review History

The system MUST let a `MAINTENANCE_COMPANY_MANAGER` list the `completed`
review sessions performed **on behalf of their own maintenance company**,
across every technician of that company and every community those
technicians worked in, **including sessions they did not perform and
communities they hold no relationship to**. Membership MUST be decided by
the performing-company attribution frozen onto the session (owned by
`review-session-management`), never by the current maintenance company of
the session's performer.

A session attributed to any other company MUST NOT appear, on any route,
under any circumstance. The list MUST be returned in a deterministic
chronological order by the session's completion time, and that ordering
direction MUST be identical to the other two scopes' lists. An empty
result MUST be a successful empty list, never an error.

Because this list spans performers, every row MUST identify **who
performed** the session — a company-wide list that cannot attribute work
to a technician is not usable by the actor accountable for it.

The read MUST fail closed on a missing company on either side: a caller
with no maintenance company MUST receive an empty list, and a session
carrying no attributed company MUST appear in no manager's list.

#### Scenario: A manager sees every technician's work across communities
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X, and technicians of X who completed sessions on communities C and D
- WHEN they request their company review history
- THEN the response MUST be 2xx and MUST contain every one of those completed sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: Another company's sessions never appear
- GIVEN completed sessions attributed to companies X and Y
- WHEN the manager of X requests their company review history
- THEN only X's sessions MUST be returned, and no session of Y MUST appear in the result under any field

#### Scenario: Attribution is frozen, not derived from current employment
- GIVEN a technician completed session S while employed by company X and has since transferred to company Y
- WHEN X's manager and Y's manager each request their company review history
- THEN S MUST appear for X's manager and MUST NOT appear for Y's manager

#### Scenario: A manager with no company gets an empty list, not everything
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose own maintenance company is absent, while completed sessions exist in the installation
- WHEN they request their company review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT contain any session

#### Scenario: A session with no attributed company appears nowhere
- GIVEN a `completed` session carrying no performing-company attribution
- WHEN every manager in the installation requests their company review history
- THEN it MUST appear in none of the results

#### Scenario: Each row identifies its performer
- GIVEN a manager's company history containing sessions performed by two different technicians
- WHEN the rows are inspected
- THEN each row MUST identify the user who performed that session

#### Scenario: An empty company history is a successful empty result
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of a company whose technicians have completed no session
- WHEN they request their company review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

#### Scenario: Backfilled pre-existing sessions are visible
- GIVEN sessions completed before this change, whose attribution was populated by the one-time backfill
- WHEN the manager of the attributed company requests their company review history
- THEN those sessions MUST be listed alongside newly completed ones, with no distinction in shape

### Requirement: A Granted Manager's Installation-Wide Completed Review History

The system MUST let a `MANAGER` holding the `VIEW_ALL_REVIEWS` capability
list **every** `completed` review session in the installation, and open
any of them by identifier — the **same** result, in the **same** order,
with the **same** row shape as *A System Admin's Installation-Wide
Completed Review History* produces for a `SYSTEM_ADMIN`. There MUST be no
manager-specific variant: no reduced result, no enriched result, no extra
or missing row field, and no separate route.

It MUST be served by the **same** unscoped read pair the admin scope
already ships. No new repository method, no new route and no
`ReviewSessionRepository` port signature change MUST be introduced, and
the read MUST NOT be re-expressed as a scoped read issued with an empty,
wildcard or null scope value.

Visibility MUST NOT be reduced by deleted or deactivated context, exactly
as for the admin: a session whose community, attributed maintenance
company or performer has been deactivated or soft-deleted, and a session
carrying no performing-company attribution at all, MUST still be listed
and readable by id. `VIEW_ALL_REVIEWS` means literally everything.

The `completed`-only rule MUST still hold: a `draft` MUST NOT appear in
this list and MUST NOT be readable through the history detail read by
this actor either. An empty installation MUST produce a successful empty
list, never an error.

#### Scenario: A granted manager sees every completed session
- GIVEN completed sessions attributed to companies X and Y, on communities C and D, performed by three different technicians, and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they request review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: The granted manager's list is identical to the admin's
- GIVEN the same installation, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request review history and both lists are compared
- THEN they MUST contain exactly the same sessions, in exactly the same order, with exactly the same row fields

#### Scenario: Deleted or deactivated context hides nothing from the granted manager
- GIVEN a `completed` session on a soft-deleted community, one attributed to a soft-deleted maintenance company, and one carrying no attributed company at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests review history and opens each of the three
- THEN all three MUST be listed and each MUST return its full recorded record

#### Scenario: The granted manager reads back any completed session
- GIVEN a `completed` session S performed by a technician of company X on community C, and a `MANAGER` holding `VIEW_ALL_REVIEWS` with no relationship to either
- WHEN they open S
- THEN the response MUST be 2xx and MUST return the same recorded record the performer and the admin would see, with no manager-specific variant

#### Scenario: An empty installation renders a successful empty list
- GIVEN an installation with no `completed` session at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

#### Scenario: Drafts and unknown ids still 404 for the granted manager
- GIVEN one `draft` session and a well-formed session identifier matching no session anywhere
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests each through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code and message

#### Scenario: The fifth scope adds no repository read
- GIVEN the `ReviewSessionRepository` port and its adapters before and after this change
- WHEN their methods and signatures are compared
- THEN they MUST be identical — the granted manager MUST be served by the existing unscoped list/by-id pair, with no method added, removed or re-signed

### Requirement: An Ungranted Manager Reads Nothing

A `MANAGER` who does **not** hold `VIEW_ALL_REVIEWS` MUST read nothing
through the history surface, and MUST be **observably identical** to the
role's behaviour before this change. This is a binding regression
requirement, to be proven rather than asserted: the list MUST be empty
and every by-id request MUST be `404 REVIEW_SESSION_NOT_FOUND`,
indistinguishable in status, code and message from a nonexistent
session, on **every** history route — proven for each route, not sampled.

The empty result MUST be produced **before** any review-session data
access: an absent capability MUST short-circuit, and MUST NOT fall
through to the unscoped read, to a scoped read with an empty or null
scope value, or to any post-hoc filtering of a broader result set.

The ungranted state MUST be the default and MUST be recoverable only by
an explicit grant. A newly created `MANAGER` MUST hold no capability; a
`MANAGER` whose capability was revoked MUST read nothing from their very
next request; a user changed away from `MANAGER` and later changed back
MUST hold **no** capability; and a soft-deleted `MANAGER` MUST read
nothing regardless of what their record carries.

#### Scenario: An ungranted manager's list is empty on every route
- GIVEN completed sessions existing across two companies and two communities, and an authenticated `MANAGER` holding no capability
- WHEN they request the history list
- THEN the response MUST be 2xx carrying an empty list

#### Scenario: An ungranted manager's by-id read is indistinguishable from nonexistent
- GIVEN any `completed` session in the installation and an authenticated `MANAGER` holding no capability
- WHEN they request it by id, and separately request a well-formed identifier matching no session
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, error code and message, disclosing nothing about the session's existence

#### Scenario: An ungranted manager reaches no repository call
- GIVEN an authenticated `MANAGER` holding no capability
- WHEN they call the history list and the history by-id read
- THEN no `ReviewSessionRepository` read MUST be issued for either request

#### Scenario: An absent capability never widens the query
- GIVEN the manager history path after this change
- WHEN its data access is inspected
- THEN an unresolved or absent capability MUST NOT issue the unscoped read, MUST NOT issue any read with an empty, wildcard or null scope value, and MUST NOT fetch-then-filter

#### Scenario: A newly created manager holds no capability
- GIVEN a `SYSTEM_ADMIN` creates a new `MANAGER`
- WHEN that manager requests review history
- THEN the list MUST be empty — creation MUST offer no way to hold a capability

#### Scenario: A revoked manager reads nothing from the next request
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` who has just listed every completed session
- WHEN the capability is revoked and they repeat the identical request without logging out or back in
- THEN the list MUST be empty

#### Scenario: A role round trip leaves no capability behind
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` whose role is changed to another role and later changed back to `MANAGER`
- WHEN they request review history
- THEN the list MUST be empty — the previously granted capability MUST NOT have survived the round trip

#### Scenario: A soft-deleted manager holding the capability reads nothing
- GIVEN a `MANAGER` whose record holds `VIEW_ALL_REVIEWS` and who has since been soft-deleted
- WHEN a history request is made on their behalf
- THEN it MUST return nothing

### Requirement: A System Admin's Installation-Wide Completed Review History

The system MUST let a `SYSTEM_ADMIN` list **every** `completed` review
session in the installation — across every maintenance company, every
community, every performer and all time — **with no scope narrowing of
any kind**. The absence of a scope filter is the requirement, not an
omission: it MUST be intended, asserted and preserved, and a later change
that re-introduces any narrowing on this read MUST be treated as a
regression.

The result MUST be a single flat list in the same deterministic
chronological order by completion time, and in the same direction, as
every other scope's list, including a granted `MANAGER`'s (see *A Granted
Manager's Installation-Wide Completed Review History*), whose list is
this same read and is therefore identical to the admin's, session for
session and in the same order. An empty installation MUST produce a
successful empty list, never an error.

Because this list spans companies, communities and performers, every row
MUST identify its community and **who performed** the session, exactly as
the company-wide list already does. No additional row field is required
by this scope.

Visibility MUST NOT be reduced by deleted or deactivated context — this
and the granted-manager scope are now the **two** scopes with no
exceptions:

| Case | Required behaviour |
|---|---|
| The session's community has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session's attributed maintenance company has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session carries no performing-company attribution at all | The session MUST still be listed and readable by id |
| The session's performer has been deactivated or soft-deleted, or has changed employer | The session MUST still be listed and readable by id |

This deliberately diverges from the technician, representative and
company-manager scopes, where deactivated context removes visibility. The
purpose here — as for a granted manager — is total system audit, not
operational scoping: deleted context MUST NOT hide a compliance record
from the auditor.

The `completed`-only rule MUST still hold: a `draft` MUST NOT appear in
this list and MUST NOT be readable through the history detail read by
this actor either.
(Previously: described as diverging from "the other three scopes" and
ordering compared against "the other three scopes' lists" — both counts
now understate the picture, since a granted `MANAGER`'s scope is the
identical read and therefore shares this scope's every property,
including the no-narrowing behaviour and the deactivated/deleted-context
exceptions table. The divergence from the technician, representative and
company-manager scopes — the three that still narrow — is otherwise
unchanged.)

#### Scenario: The admin sees every completed session in the installation
- GIVEN completed sessions attributed to companies X and Y, on communities C and D, performed by three different technicians
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: The ordering matches every other scope's list, including a granted manager's
- GIVEN the same set of completed sessions visible to a technician, a representative, a company manager, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN each list is compared
- THEN the relative order of any two sessions present in more than one of them MUST be identical, and the admin's and the granted manager's lists MUST be identical session for session

#### Scenario: A deactivated community's sessions remain visible
- GIVEN a `completed` session on a community that has since been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` requests review history and opens that session
- THEN it MUST be listed and its full recorded record MUST be returned

#### Scenario: A soft-deleted or absent company does not hide a session
- GIVEN a `completed` session attributed to a soft-deleted maintenance company, and another carrying no attributed company at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN both MUST appear — even though the unattributed one appears in no company manager's list

#### Scenario: An empty installation renders a successful empty list
- GIVEN an installation with no `completed` session at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

#### Scenario: Drafts never appear for the admin either
- GIVEN the installation holds one `draft` session and one `completed` session
- WHEN a `SYSTEM_ADMIN` requests review history and requests the draft by id
- THEN only the `completed` session MUST be listed, and the draft's by-id request MUST be rejected as `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A nonexistent id still 404s for the admin
- GIVEN a well-formed session identifier matching no session anywhere in the installation
- WHEN a `SYSTEM_ADMIN` requests it through the history detail read
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code and message to the draft rejection above

#### Scenario: Each row identifies its community and its performer
- GIVEN an admin's installation-wide history spanning several communities and several performers
- WHEN the rows are inspected
- THEN each MUST identify the community the session belongs to and the user who performed it

#### Scenario: The unscoped read is asserted, not merely unfiltered by accident
- GIVEN the admin history read after this change
- WHEN a scope narrowing — by community, by company, by performer, by the liveness of any of them — is re-introduced into it
- THEN a test MUST fail, proving the absence of narrowing is asserted behaviour

### Requirement: A System Admin Can Read Any Completed Session by Identifier

The system MUST let a `SYSTEM_ADMIN` open **any** `completed` session in
the installation by its identifier and read back its full recorded
record, **unconditionally** — with no scope condition evaluated against
the actor, no community assignment, no company match and no liveness
check on the session's community, company or performer.

The record returned MUST be identical to what the session's performer
would see. There MUST be no admin-specific, reduced or enriched variant.

The only two rejections that remain reachable for this actor are a
session identifier matching nothing at all, and a session whose status is
not `completed`; both MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical
in status, error code and message, per *An Out-of-Scope Historical
Session Is Indistinguishable From a Nonexistent One*.

This unconditional read MUST be reachable by exactly **two** actors: a
`SYSTEM_ADMIN`, whose access is unconditional on anything beyond the
role, and a `MANAGER` for whom `VIEW_ALL_REVIEWS` resolves affirmatively,
whose access is conditional on that capability alone (see *A Granted
Manager's Installation-Wide Completed Review History*). For every other
role — and for a `MANAGER` without the capability — the shipped scope
rules MUST decide the outcome exactly as they did before this change.
(Previously: the read was reachable **only** for a `SYSTEM_ADMIN`, and
every other role, `MANAGER` included, was decided by the shipped scope
rules.)

#### Scenario: The admin opens a session from a company and community they have no relation to
- GIVEN a `completed` session S attributed to company X, performed by X's technician on community C, and a `SYSTEM_ADMIN` with no assignment and no company
- WHEN the admin opens S
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: Deleted context does not block the by-id read
- GIVEN a `completed` session whose community, attributed company and performer have all been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` opens it
- THEN the response MUST be 2xx and MUST return its full recorded record

#### Scenario: The admin's access stays unconditional on any capability
- GIVEN a `SYSTEM_ADMIN` whose user record carries no capability of any kind
- WHEN they open any `completed` session by id
- THEN the response MUST be 2xx — the capability mechanism MUST NOT be consulted for this actor

#### Scenario: No role other than the admin and a granted manager gains the unconditional by-id read
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding no capability, and a `completed` session outside each one's scope
- WHEN each requests that session by id after this change
- THEN each MUST receive `404 REVIEW_SESSION_NOT_FOUND`, exactly as before this change

#### Scenario: The admin read performs no write
- GIVEN a `completed` session with recorded answers
- WHEN a `SYSTEM_ADMIN` lists and opens it any number of times
- THEN its status, entries, answers and observations MUST be byte-for-byte unchanged

### Requirement: Only Completed Sessions Appear in History

Every history read — both list scopes and the detail read — MUST exclude
sessions whose status is not `completed`. A `draft` session MUST remain
reachable exclusively through the existing draft-resume flow owned by
`review-session-management`, which MUST be unchanged by this capability.
The completed-only rule MUST hold as stated behaviour, independently of
which query, route or caller reaches the data.

#### Scenario: A draft never appears in the performer's own history
- GIVEN a `MAINTENANCE_TECHNICIAN` holds one `draft` session and one `completed` session
- WHEN they request their own review history
- THEN only the `completed` session MUST be returned

#### Scenario: A draft never appears in the community history
- GIVEN community C has one `draft` session and one `completed` session
- WHEN a representative actively assigned to C requests their community review history
- THEN only the `completed` session MUST be returned

#### Scenario: A draft is not readable through the history detail read
- GIVEN a `draft` session S exists in the caller's own scope
- WHEN the caller requests S through the history detail read
- THEN the request MUST be rejected as `404 REVIEW_SESSION_NOT_FOUND`, identically to a nonexistent session

#### Scenario: The existing draft-resume flow is unchanged
- GIVEN the draft-resume list and the by-id resume read after this change
- WHEN their behaviour is compared to before this change
- THEN both MUST be unchanged — the draft-resume list still returning drafts only, and the by-id resume read still performer-scoped and still status-agnostic, with no completed-only filter added to it

#### Scenario: A session enters history only on completion
- GIVEN a `draft` session S absent from the caller's history
- WHEN S is completed and the history is requested again
- THEN S MUST now appear

### Requirement: Scoped Read-Back of One Historical Session

The system MUST let an authorized caller open one `completed` session
within their visibility scope and read back its full recorded record —
every element review entry with its answers and its observations,
including elements left unreviewed with their recorded reason. The
read-back MUST be available to the session's performer; to a
`COMMUNITY_REPRESENTATIVE` **who did not perform it**, for a session on a
community they are actively assigned to; to a
`MAINTENANCE_COMPANY_MANAGER` **who did not perform it**, for a session
attributed to their own maintenance company; to a `SYSTEM_ADMIN`, for
**any** `completed` session in the installation, whose scope is the whole
installation (see *A System Admin Can Read Any Completed Session by
Identifier*); and to a `MANAGER` holding `VIEW_ALL_REVIEWS`, for **any**
`completed` session in the installation on exactly the same terms (see
*A Granted Manager's Installation-Wide Completed Review History*). All
five MUST receive the identical record — there MUST be no reduced or
role-specific variant of the recorded record. The record MUST be returned
as it was answered, paired with the template snapshot's wording, per
*Sessions Render the Template's Frozen Snapshot*. Each entry MUST carry
the identity of the inspectable element it records — a record whose
entries cannot be attributed to a physical element is not a compliance
record.
(Previously: available to the performer, an actively assigned
representative, the manager of the attributed company and a
`SYSTEM_ADMIN` — four callers, with no capability-gated caller.)

#### Scenario: A performer reads back their own completed session
- GIVEN a `MAINTENANCE_TECHNICIAN` completed a session with three elements answered and one marked unreviewed with a reason
- WHEN they open that session from their history
- THEN the response MUST be 2xx and MUST return all four entries with their recorded answers, snapshotted question wording, and the unreviewed element's reason

#### Scenario: A representative reads back a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C, and a technician-performed `completed` session S for C
- WHEN the representative opens S from their history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: A manager reads back a session performed under their company
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X and a `completed` session S attributed to X, performed by one of X's technicians on a community the manager has no relationship to
- WHEN the manager opens S from their company history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: An admin reads back a session from any company or community
- GIVEN a `SYSTEM_ADMIN` and a `completed` session S attributed to any company, on any community, performed by anyone
- WHEN the admin opens S from their history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see, with no admin-specific variant

#### Scenario: A granted MANAGER reads back the identical record
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` and the same `completed` session S the admin just read back
- WHEN they open S
- THEN the response MUST be 2xx and MUST return byte-for-byte the same recorded record the admin received, with no manager-specific variant

#### Scenario: An ungranted MANAGER gets no read-back
- GIVEN a `MANAGER` holding no capability and any `completed` session S
- WHEN they open S
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: Each entry identifies the element it records
- GIVEN a `completed` session read back through history
- WHEN its entries are inspected
- THEN each entry MUST carry the identity of the inspectable element it records

#### Scenario: An element removed after completion does not drop its entry
- GIVEN a `completed` session one of whose inspectable elements was decommissioned or soft-deleted after completion
- WHEN the session is read back through history
- THEN that entry MUST still be returned with its answers and observations, with the element identity absent rather than the entry omitted

#### Scenario: Read-back survives later edits to the live question pool
- GIVEN a `completed` session and subsequent edits to the live `ChecklistQuestion` pool
- WHEN the session is read back through history
- THEN each answer MUST still be paired with the snapshotted wording that was answered

### Requirement: One Inspectable Element's Completed Review History

The system MUST let an authorized caller read the review history of a
**single** inspectable element, identified by its community and its own
identifier, and receive **every** review of that element the caller is
allowed to see, drawn from **every** `completed` session it was ever
reviewed in — not only the most recent, and not only those within one
session.

The response MUST carry two parts:

| Part | Required content |
|---|---|
| The element header | The element's `code`, name, element type, location, active/decommissioned state and the community it belongs to — enough to identify the physical element the record is about, without a second request |
| The entry list | One row per element review entry in the caller's scope, each carrying **when** the review was recorded, **who** recorded it, whether the element was **reviewed or left unreviewed**, its recorded **observations**, and a reference to the `completed` session the entry belongs to |

The entry list MUST be ordered **most recent first** by the moment each
entry was recorded, with a deterministic tiebreak so that two entries
recorded at the same instant always appear in the same relative order
across identical requests. The ordering MUST be stable and MUST NOT
depend on insertion order, on the database's default ordering, or on the
caller's role.

Only entries belonging to `completed` sessions MUST appear. An entry
recorded in a `draft` session — including one currently in progress
against the same element — MUST NOT appear for any caller, in any scope.

Each row MUST reference the session it belongs to, and it MUST be an
invariant of every scope that **any row the caller can see belongs to a
session that same caller can open** through *Scoped Read-Back of One
Historical Session*. A row the caller cannot follow through to its
session MUST NOT be returned.

The response MUST NOT re-render each past review's answers inline: the
rows carry the summary fields named above and the session reference, and
the answers stay where they already ship, on the session read-back. This
is a deliberate scope boundary, not an omission.

A **decommissioned** element (`deactivatedAt` set) MUST have its history
returned in full — decommissioning is domain state, not a delete, and a
retired element's compliance record MUST stay readable.

#### Scenario: Every past review of one element is returned across all its sessions
- GIVEN element E was reviewed in three different `completed` sessions on three different dates, and a caller whose scope covers all three
- WHEN they request E's review history
- THEN the response MUST be 2xx and MUST contain all three entries in one list, most recent first — not only the latest, and not only one session's

#### Scenario: The element header identifies the physical element
- GIVEN any successful element review history response
- WHEN its element header is inspected
- THEN it MUST carry the element's `code`, name, element type, location, active/decommissioned state and its community

#### Scenario: Each row carries when, who, the outcome and its session
- GIVEN an element history containing an entry that was reviewed and one that was left unreviewed with a reason
- WHEN the rows are inspected
- THEN each MUST carry the moment it was recorded, the user who recorded it, whether the element was reviewed or left unreviewed, its observations, and a reference to its `completed` session

#### Scenario: The ordering is deterministic and identical across repeated requests
- GIVEN an element whose history contains two entries recorded at the same instant
- WHEN the same caller requests the element's history twice
- THEN both responses MUST list every entry in exactly the same order, most recent first, with the same tiebreak applied

#### Scenario: Every visible row belongs to a session the same caller can open
- GIVEN any caller and any element history response they received
- WHEN each row's referenced session is requested by that same caller through the session read-back
- THEN every one MUST return its full recorded record — no row MUST reference a session the caller is refused

#### Scenario: A draft review of the same element never appears
- GIVEN element E has two entries from `completed` sessions and one recorded in a `draft` session still in progress
- WHEN any caller whose scope covers E requests its history
- THEN exactly the two `completed` entries MUST be returned, and the `draft` one MUST NOT appear

#### Scenario: A decommissioned element keeps its full history
- GIVEN element E was reviewed in two `completed` sessions and has since been decommissioned
- WHEN a caller whose scope covers both requests E's history
- THEN the response MUST be 2xx, MUST contain both entries, and the header MUST report the element as decommissioned

#### Scenario: Answers are not re-rendered per row
- GIVEN an element history response
- WHEN a row is inspected
- THEN it MUST NOT carry that past review's per-question answers — those MUST remain available only through the referenced session's read-back

### Requirement: The Five Visibility Scopes Apply at Entry Level

The element-keyed read MUST resolve visibility through the **same five**
scopes the session-level history already ships, applied to the element's
**entries** rather than to whole sessions. No sixth scope, no narrower
technician rule and no element-specific exception MUST be invented, and
no scope MUST be widened.

| Caller | Entries returned for element E |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Exactly the entries **they** recorded on E — and nothing else. Entries recorded by any other performer MUST NOT be returned, whether or not the caller holds an active assignment to E's community |
| `COMMUNITY_REPRESENTATIVE` | **Every** entry on E, regardless of who recorded it, **iff** they hold an **active** representative assignment to E's community; otherwise nothing |
| `MAINTENANCE_COMPANY_MANAGER` | Exactly the entries whose session carries their **own** company as its frozen performing-company attribution — across every technician of that company. An entry whose session carries **no** attribution MUST NOT be returned to any company manager. A caller whose own maintenance company is absent MUST receive nothing |
| `SYSTEM_ADMIN` | **Every** entry on E, unconditionally |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | **Every** entry on E, identical to `SYSTEM_ADMIN` — same rows, same order, same fields, with no manager variant |
| `MANAGER` without the capability | Nothing |

A technician's own entries MUST stay readable permanently, exactly as at
session level: a deactivated community assignment MUST NOT retroactively
hide work the caller personally performed. The relaxation MUST stay
bounded to their own entries — a deactivated technician MUST still see
**no** entry recorded by anyone else.

An unresolvable scope MUST fail **closed** and MUST short-circuit
**before** any review-session data access: an absent company, an absent
or unresolved `VIEW_ALL_REVIEWS` capability, and an absent active
representative assignment MUST each produce no result rather than a wider
one.

#### Scenario: A technician sees only their own entries on a shared element
- GIVEN element E was reviewed in two `completed` sessions on E's community, one performed by technician U and one by technician W
- WHEN U requests E's history and W requests E's history
- THEN U's response MUST contain exactly U's one entry and W's MUST contain exactly W's one entry — neither MUST contain the other's

#### Scenario: A technician's own entry survives their assignment's deactivation
- GIVEN technician U recorded an entry on element E and can read E's history
- WHEN U's technician assignment to E's community is deactivated and they repeat the identical request
- THEN U's own entry MUST still be returned, and no entry recorded by anyone else MUST appear

#### Scenario: A representative sees every entry on an actively assigned community's element
- GIVEN element E on community C, reviewed by two different technicians of two different maintenance companies, and a `COMMUNITY_REPRESENTATIVE` actively assigned to C who performed neither session
- WHEN they request E's history
- THEN both entries MUST be returned, regardless of performer or performing company

#### Scenario: A company manager sees only their own company's entries on a shared element
- GIVEN element E reviewed in a `completed` session attributed to company X and in another attributed to company Y, and a third whose session carries no attribution at all
- WHEN X's `MAINTENANCE_COMPANY_MANAGER` requests E's history
- THEN exactly the X-attributed entry MUST be returned — Y's entry and the unattributed entry MUST NOT appear

#### Scenario: Attribution survives the performer's transfer on the element read too
- GIVEN a technician recorded an entry on element E while employed by company X and has since transferred to company Y
- WHEN X's manager and Y's manager each request E's history
- THEN the entry MUST appear for X's manager and MUST NOT appear for Y's manager — the scope MUST resolve from the session's frozen attribution, never from the performer's current employer

#### Scenario: A granted manager's element history is identical to the admin's
- GIVEN an element reviewed across two companies, two performers and several dates, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request that element's history and the responses are compared
- THEN they MUST contain exactly the same entries, in exactly the same order, with exactly the same fields and the same element header

#### Scenario: An unresolvable scope issues no read at all
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose own maintenance company is absent, and a `MANAGER` holding no capability
- WHEN each requests any element's history
- THEN neither request MUST issue any review-session repository read, and neither MUST fall through to a wider read or to a read carrying an empty, wildcard or null scope value

#### Scenario: No sixth scope and no element-specific narrowing is introduced
- GIVEN the element-keyed history authorization after this change
- WHEN its branches are compared with the shipped session-level ones
- THEN there MUST be exactly the same five, decided by the same checkers, differing only by the element identifier — with no additional branch, no role-specific exception and no narrower technician rule

### Requirement: Element Reachability Decides 404 Versus an Empty History

Whether a caller learns that an element **exists** MUST be decided by one
explicit matrix, uniform across roles, so that no role learns more about
an element's existence than its own scope already entitles it to.

An element that is unknown, soft-deleted, or does not belong to the
`:communityId` in the request MUST be rejected with `404
INSPECTABLE_ELEMENT_NOT_FOUND` — the **same** status, error code and
message in all three cases, for **every** role including `SYSTEM_ADMIN`,
carrying no field, hint or payload difference between them. No distinct
code for "exists, but not in that community" and none for "exists, but
not yours" MUST be introduced.

For an element that **does** exist in the requested community, the
outcome MUST be:

| Caller | Element exists, caller's scoped entry set is **empty** |
|---|---|
| `SYSTEM_ADMIN` | 2xx with an **empty** entry list and the element header — never an error |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | 2xx with an **empty** entry list and the element header |
| `COMMUNITY_REPRESENTATIVE` with an **active** assignment to the element's community | 2xx with an **empty** entry list and the element header |
| `COMMUNITY_REPRESENTATIVE` without an active assignment to it | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MAINTENANCE_TECHNICIAN` | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MAINTENANCE_COMPANY_MANAGER` | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MANAGER` without the capability | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |

The asymmetry is deliberate and MUST NOT be "corrected": the first three
scopes reach an element through a relation to the **element's own
context** — the whole installation, or an active assignment to its
community — so an empty record is a true and disclosable fact about an
element they are already entitled to see. The technician's and the
company manager's scopes are **session-derived**: they have no relation
to an element they have never reviewed, so for them "no entries in scope"
**is** "not reachable", and returning an empty list would disclose the
element's existence to a caller with no entitlement to know it.

A **non-empty** scoped entry set MUST always produce 2xx, for every role.
Partial visibility MUST NOT escalate to a 404: a caller who can see one
of an element's five entries MUST receive that one entry, not a rejection.

Every rejection on this surface MUST be produced at a single throw site
with a single code, so that no future branch can make the outcomes
diverge by role.

#### Scenario: Unknown, soft-deleted and wrong-community elements are indistinguishable
- GIVEN a well-formed element identifier matching no element at all, a soft-deleted element of community C, and an element that exists in community D
- WHEN the same caller requests each in turn under community C's path
- THEN all three responses MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, identical in status, error code and message

#### Scenario: The wrong-community pairing discloses nothing, even to an admin
- GIVEN element E belongs to community D, and a `SYSTEM_ADMIN`
- WHEN the admin requests E's history under community C's path
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, identical to a nonexistent element — the admin's installation-wide scope MUST NOT bypass the community segment

#### Scenario: A never-reviewed element renders an empty history for an admin
- GIVEN element E exists in community C and has never been reviewed in any session
- WHEN a `SYSTEM_ADMIN` requests E's history
- THEN the response MUST be 2xx, MUST carry E's element header and an empty entry list, and MUST NOT be an error

#### Scenario: A never-reviewed element renders an empty history for a granted manager and an assigned representative
- GIVEN element E exists in community C and has never been reviewed, a `MANAGER` holding `VIEW_ALL_REVIEWS`, and a `COMMUNITY_REPRESENTATIVE` actively assigned to C
- WHEN each requests E's history
- THEN both MUST receive 2xx with E's header and an empty entry list

#### Scenario: A technician gets 404, not an empty list, for an element they never reviewed
- GIVEN element E exists in community C and was reviewed only by technician W, and technician U who recorded nothing on E
- WHEN U requests E's history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element — U MUST NOT learn that E exists

#### Scenario: A company manager gets 404 for an element none of their sessions touched
- GIVEN element E exists in community C and was reviewed only in sessions attributed to company Y, and a `MAINTENANCE_COMPANY_MANAGER` of company X
- WHEN X's manager requests E's history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element

#### Scenario: A representative without an active assignment gets 404
- GIVEN element E on community D, a `COMMUNITY_REPRESENTATIVE` actively assigned only to community C, and a second representative whose assignment to D has been deactivated
- WHEN each requests E's history
- THEN both MUST receive `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element

#### Scenario: An ungranted manager gets 404 on every element
- GIVEN any element in the installation, reviewed or never reviewed, and a `MANAGER` holding no capability
- WHEN they request its history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, and no review-session repository read MUST be issued

#### Scenario: Partial visibility returns the visible rows, never a 404
- GIVEN element E has five entries, of which technician U recorded exactly one
- WHEN U requests E's history
- THEN the response MUST be 2xx carrying exactly U's one entry — partial visibility MUST NOT escalate to a rejection

#### Scenario: One throw site, one code
- GIVEN every rejection path of the element-keyed history read after this change
- WHEN they are enumerated
- THEN every one MUST resolve to the same `404 INSPECTABLE_ELEMENT_NOT_FOUND` response, and no role-specific status, code or message MUST exist

### Requirement: An Element Belongs to Exactly One Community for Its Lifetime

The element-keyed history read MUST resolve an element through its
community, and the system MUST keep that resolution unambiguous by
keeping an element's community **immutable**: no route, use case,
repository method or administrative action MUST move an inspectable
element between communities, and its community MUST NOT be an updatable
field.

This is a **standing recorded assumption**, relied on by this
capability: because an element never moves, every entry ever recorded
against it belongs to a session of that one community, and the read
therefore needs no cross-community rule and MUST NOT introduce one.

If element reassignment is ever built, that change MUST explicitly decide
whether an element's history spans its former community and MUST revisit
this requirement — it MUST NOT be allowed to ship while leaving the
question implicit.

#### Scenario: No path moves an element between communities
- GIVEN the inspectable-element routes, use cases and repository port after this change
- WHEN they are searched for a way to change an element's community
- THEN none MUST exist — the community MUST NOT appear among any update's mutable fields, and no reassignment or transfer operation MUST be reachable

#### Scenario: The element history adds no cross-community rule
- GIVEN the element-keyed history read's authorization and data access after this change
- WHEN they are inspected
- THEN neither MUST contain any rule, branch or predicate anticipating an element that has belonged to more than one community

### Requirement: History Scope Is Carried by the Query, Not by the Caller

Every history read MUST have its visibility scope expressed in the data
access itself, and the system MUST NOT obtain a broader result set and
narrow it in a use case, controller or client. This MUST hold for all
**five** scopes, and on **both** read surfaces — the session-level one
and the element-keyed one added by *One Inspectable Element's Completed
Review History* — including the two installation-wide ones, where the
scope **is** the whole installation: those reads MUST be distinct data
accesses whose only predicates are the `completed` status (and, on the
element-keyed surface, the element itself), never a scoped read issued
with an empty, wildcard or null scope value. A scope that cannot be
resolved MUST still produce no result rather than an unscoped one, for
every role that has a scope to resolve — and an unresolved or absent
`VIEW_ALL_REVIEWS` capability MUST be treated as exactly such an
unresolvable scope.

An **element identifier is not an actor scope.** It narrows *which*
entries are candidates; it says nothing about *who* may see them. Every
element-keyed read MUST therefore carry the actor's scope as a required
parameter alongside the element — with exactly **one** exception, the
installation-wide element read, which mirrors the shipped unscoped pair
and MUST be reachable from exactly **two** enumerable call sites: the
`SYSTEM_ADMIN` path, and the `MANAGER` path after the capability has
resolved affirmatively.

So after this change the repository MUST expose exactly **two**
actor-unscoped reads and no more: the shipped installation-wide
list/by-id pair, and the single installation-wide element-keyed read.
Both MUST be unreachable from every other path, and both MUST be named
and expressed so that a reader — and an autocomplete list — cannot
mistake either for, or accidentally select either in place of, a scoped
read. *How* this is achieved, and how the shipped property that no read
of a session is available from an identifier alone is restated now that
element-keyed reads exist, is a design decision; *that* the
actor-unscoped reads are unreachable from every other path is a
requirement.
(Previously: there was exactly **one** actor-unscoped read — the shipped
list/by-id pair — and the "exactly one unscoped read exists" scenario
asserted that every other repository method carried a performer,
community or maintenance-company scope. The element-keyed installation-
wide read makes that literal count false: it carries the element but no
actor scope. The guarantee is not weakened, only recounted — the number
of actor-unscoped reads is now a bounded, enumerable **two**, each
reachable from the same two actor paths and from nowhere else.)

#### Scenario: Exactly two actor-unscoped reads exist
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods that read `completed` sessions or their entries are enumerated
- THEN exactly two MUST carry no performer, community or maintenance-company scope — the shipped installation-wide list/by-id pair, and the single installation-wide element-keyed read — and every other method MUST carry one

#### Scenario: Every element-keyed read names its scope in its signature
- GIVEN the element-keyed repository methods after this change
- WHEN their signatures are inspected
- THEN each MUST take the element identifier **and** its actor scope as required parameters, except the single installation-wide one, so that no caller can widen its own scope by omitting an argument

#### Scenario: The actor-unscoped reads are reachable only from the admin and granted-manager paths
- GIVEN the call sites of both actor-unscoped reads after this change
- WHEN every one of them is enumerated — no sampling
- THEN each MUST be reachable from exactly two, all four in the history access resolution: the `SYSTEM_ADMIN` path and the `MANAGER` path guarded by an affirmative capability resolution — and no other use case, service, controller or adapter MUST call either

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change, session-level and element-keyed alike
- WHEN their data access is inspected
- THEN none MUST fetch sessions or entries outside the caller's scope and filter them afterwards in application, presentation or client code — in particular, the element-keyed read MUST NOT fetch all of an element's entries and drop the ones the caller may not see

#### Scenario: An unresolvable company never widens the query
- GIVEN a company-scoped history read whose caller has no maintenance company, on either surface
- WHEN the data access is inspected
- THEN it MUST NOT be issued without a company predicate, and MUST NOT fall back to an unfiltered read — and in particular MUST NOT fall through to either actor-unscoped read

#### Scenario: An absent capability never widens the query
- GIVEN a `MANAGER` history read whose caller holds no `VIEW_ALL_REVIEWS`, on either surface
- WHEN the data access is inspected
- THEN no read MUST be issued at all, and the path MUST NOT fall through to either actor-unscoped read

#### Scenario: The scoped reads are not re-expressed as the unscoped ones
- GIVEN the technician, representative and company-manager history reads after this change, session-level and element-keyed alike
- WHEN their data access is inspected
- THEN each MUST still carry its own scope predicate, and none MUST be implemented by issuing an actor-unscoped read and narrowing the result

### Requirement: An Out-of-Scope Historical Session Is Indistinguishable From a Nonexistent One

This is a security requirement, not a UX preference. A session
identifier that the caller cannot see MUST be rejected with `404
REVIEW_SESSION_NOT_FOUND` — the **same** status, error code and message
as an identifier that matches no session anywhere in the installation,
carrying no field, hint or payload difference between them. No distinct
error code MUST exist for "exists, but not yours", and no response MUST
disclose that the session exists.

#### Scenario: An out-of-scope session behaves exactly like a nonexistent one
- GIVEN a `completed` session S the caller cannot see, and a well-formed session identifier matching no session at all
- WHEN the caller requests each in turn through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND` with identical status, error code and message

#### Scenario: Another technician's completed session is not disclosed
- GIVEN technician W completed session S, and technician U did not perform it
- WHEN U requests S by id
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, indistinguishable from a nonexistent session

#### Scenario: Another community's completed session is not disclosed
- GIVEN a `completed` session S on community D, and a representative actively assigned only to community C
- WHEN the representative requests S by id
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, indistinguishable from a nonexistent session

#### Scenario: No "exists but not yours" error code is introduced
- GIVEN the application's declared error codes after this change
- WHEN they are inspected
- THEN none MUST distinguish an out-of-scope session from an unknown one

### Requirement: History Access Requires a Currently Active Community Assignment, Except for One's Own Performed Sessions

**Reversed with the product owner (2026-09-09), superseding the
2026-09-08 confirmation.** A `MAINTENANCE_TECHNICIAN` MUST always be able
to see the sessions they **personally performed**, regardless of whether
their community assignment is still active: the performer relation alone
confers scope over the caller's own work, permanently. A deactivated
assignment MUST NOT retroactively hide a technician's own completed
sessions, in the list or by id.

The active-assignment requirement stays fully in force for every history
scope that reaches sessions the caller did **not** perform through a
community assignment. A `COMMUNITY_REPRESENTATIVE` whose representative
assignment to a community has been deactivated MUST lose access to that
community's sessions — retroactively, on their next request, with no
grace period and no cached grant. A technician whose assignment has been
deactivated MUST still see **no** session performed by anyone else on
that community — the reversal widens nothing beyond their own work.

The `MAINTENANCE_COMPANY_MANAGER` scope is outside this requirement
entirely: it involves no community assignment, and no assignment
deactivation MUST affect it.
(Previously: named *…, Including for One's Own Sessions*, and required an
active community assignment for the caller's own performed sessions too.)

#### Scenario: A technician's own completed session stays readable after their assignment is deactivated
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C who successfully reads back their own `completed` session S for C
- WHEN their technician assignment to C is deactivated and they repeat the same request
- THEN S MUST still appear in their own history and requesting S by id MUST still return its full recorded record

#### Scenario: A deactivated technician gains nothing beyond their own work
- GIVEN technician U, whose assignment to community C has been deactivated, and a `completed` session S on C performed by technician W
- WHEN U requests their history and requests S by id
- THEN S MUST NOT be listed and the by-id request MUST return `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A representative loses community history on deactivation
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who successfully lists C's completed sessions
- WHEN their representative assignment to C is deactivated and they repeat the same request
- THEN C's sessions MUST no longer be returned, and requesting any of them by id MUST return `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A representative's access returns with a new active assignment
- GIVEN a representative whose assignment to community C was deactivated and whose C history is consequently empty
- WHEN they are actively assigned to C again and repeat the request
- THEN the previously hidden completed sessions MUST be visible again

#### Scenario: Deactivation takes effect on the next request
- GIVEN a `COMMUNITY_REPRESENTATIVE` who has just performed a successful history read
- WHEN their assignment is deactivated and the identical request is issued immediately afterwards
- THEN the request MUST already be refused — no cached grant, no grace period

#### Scenario: A manager's history is unaffected by any assignment change
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X, and the deactivation of every community assignment held by X's technicians
- WHEN the manager repeats their company history request
- THEN the same completed sessions MUST still be returned

### Requirement: The Review Document Read Inherits the Session-Level History Guards

The `review-document` read is a history read of one session and MUST be
bound by this capability's session-level guards exactly as the history
detail read is: *Only Completed Sessions Appear in History*, *History
Scope Is Carried by the Query, Not by the Caller*, *An Out-of-Scope
Historical Session Is Indistinguishable From a Nonexistent One*, *An
Ungranted Manager Reads Nothing* and *History Adds No Write Path*.

It MUST resolve its session through the same five scopes and the same
scoped reads the history detail read uses. It MUST NOT add a third
actor-unscoped repository read, MUST NOT reach either existing
actor-unscoped read from any path other than the `SYSTEM_ADMIN` path
and the affirmatively granted `MANAGER` path, and MUST NOT fetch a
session and check its scope afterwards.

#### Scenario: Still exactly two actor-unscoped reads
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods reading `completed` sessions or their entries are enumerated
- THEN exactly the same two actor-unscoped reads MUST exist as before this change, and every other method MUST carry a performer, community or maintenance-company scope

#### Scenario: The actor-unscoped reads gain no new caller path
- GIVEN every call site of the two actor-unscoped reads after this change
- WHEN they are enumerated — no sampling
- THEN each MUST still be reachable only from the `SYSTEM_ADMIN` path and the affirmatively granted `MANAGER` path

#### Scenario: The document read is scoped in the query
- GIVEN the document read for a technician, a representative and a company manager
- WHEN its data access is inspected
- THEN each MUST carry its own scope predicate, and none MUST fetch the session unscoped and narrow afterwards

#### Scenario: A draft is not readable through the document read
- GIVEN a `draft` session in the caller's own scope
- WHEN the caller reads its document
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical to a nonexistent session

> **Reconciling the base spec's "Deferred" table:** "any capability
> gating anything other than the review-history reads" still holds. The
> `review-document` read is not a second thing `VIEW_ALL_REVIEWS` gates
> — it is the review-history read's own scope, reused verbatim by a
> second surface. No new capability check, branch or gate is added
> anywhere for it.

### Requirement: History Adds No Write Path

This capability MUST be read-only end to end. It MUST NOT introduce any
operation that edits, annotates, comments on, reopens, discards,
soft-deletes or hard-deletes a `completed` session, an element review
entry or an answer, and MUST NOT weaken *Completed Sessions Are
Immutable*. No history read MUST mutate any persisted state.

#### Scenario: No mutating history operation exists
- GIVEN the routes, use cases and repository port methods added by this change
- WHEN they are enumerated
- THEN every one MUST be a read, and none MUST edit, annotate, reopen, discard or delete a session, an entry or an answer

#### Scenario: A history read leaves state untouched
- GIVEN a `completed` session with recorded answers
- WHEN it is listed and read back through history any number of times
- THEN its status, entries, answers and observations MUST be byte-for-byte unchanged

### Requirement: The Deferred Review Visibility Scopes Are Not Built

**FR-008 closes with this change.** Its role-based visibility axis closed
with the fifth scope; its **per-element** half ships here (see *One
Inspectable Element's Completed Review History*). Nothing of FR-008
remains deferred. The `ManagerCapability` mechanism MUST still declare
exactly one member, `VIEW_ALL_REVIEWS`, and MUST gate review-history
visibility only — now across **both** read surfaces. The system MUST NOT
introduce any of the following.
(Previously: per-element history was deferred, its row forbade "any
query, route or use case returning the past reviews of one inspectable
element", the *"No per-element history query or route exists"* scenario
required that none be found, and FR-008 did not close. That row and that
scenario are **narrowed, not deleted**: exactly one such read now ships,
and the guard becomes a bound on it — one element-keyed read family, five
scopes, no controls, no second variant.)

| Deferred | Must not exist |
|---|---|
| ADR-011 Decision 2's other five capabilities | Any declaration, gate, branch, UI or reference to `MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`, `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS` or `MANAGE_ORGANIZATION_PROFILE`, anywhere in `apps/**` or `packages/**`; any capability gating anything other than the review-history reads |
| A third actor-unscoped read | Any actor-unscoped "all sessions" or "all entries" query beyond the two named in *History Scope Is Carried by the Query, Not by the Caller*, and any path reaching either while serving a caller who is neither a `SYSTEM_ADMIN` nor a `MANAGER` with an affirmatively resolved capability |
| Capability state outside the database | Any `managerCapabilities` claim in a JWT or token payload, any cached or precomputed capability, and any client-side authorization decision derived from one |
| An audit trail | Any audit table, event or write recording a capability grant, a capability revoke or a role change |
| A narrowed variant of the granted read | Any per-company, per-community or date-bounded variant of `VIEW_ALL_REVIEWS`, and any granted-manager-specific repository method or route, on either surface |
| A second element-keyed surface | Any cross-element or cross-community aggregation ("every element's last review"), any element-keyed read reached from a route other than the single nested one, any unscoped `findById` on the inspectable-element port, and any `GET` by-id inspectable-element endpoint |
| List controls | Any pagination, cursor, limit, offset, date-range filter, sorting or search parameter on a history read — on **either** surface, including the installation-wide list and an element's own record however long it grows |
| Analytics derived from the element record | Any stored `lastInspectedAt` or equivalent projection, any overdue or due-date computation, any trend or chart, and any export or signing path over an element's record |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

#### Scenario: Exactly one manager capability is declared
- GIVEN the `ManagerCapability` enum, the user model, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: The capability lives only in the database
- GIVEN the token payload, the authenticated actor, the current-user endpoint's response and the client's authorization code after this change
- WHEN each is inspected
- THEN none MUST carry `managerCapabilities`, and the capability MUST be re-read from the database on every request with no cache

#### Scenario: Every scoped query still names its scope, and only two name no actor
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier, each community-scoped method its communities and each performer-scoped method its performer — and exactly two methods MUST carry no actor scope at all, per *History Scope Is Carried by the Query, Not by the Caller*

#### Scenario: The company scope never joins to the performer's current company
- GIVEN the company-scoped history queries after this change, session-level and element-keyed alike
- WHEN their predicates are inspected
- THEN each MUST match the session's own recorded performing company, and none MUST resolve membership through the performer's current `User.maintenanceCompanyId`

#### Scenario: Exactly one per-element history read family exists, behind one route
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN exactly one family MUST be found — one nested route under the element's community, one use case, and one repository method per scope — and no second route, no flat element-keyed route, and no cross-element or cross-community aggregation MUST exist

#### Scenario: The element port gains nothing
- GIVEN the inspectable-element repository port and the element-management routes before and after this change
- WHEN they are compared
- THEN the port MUST have gained no method — the element MUST be resolved through the shipped community-scoped lookup — and no `GET` by-id inspectable-element endpoint MUST exist

#### Scenario: No list-control parameters are accepted, on either surface
- GIVEN the history read routes and their request contracts after this change
- WHEN they are inspected
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter, on any of the five scopes or on the element-keyed read

#### Scenario: No projection or analytics is derived from the element record
- GIVEN the schema, the read model and the use cases after this change
- WHEN they are inspected
- THEN no stored `lastInspectedAt` or equivalent projection MUST exist, and no overdue computation, trend, chart, export or signing path MUST be derived from an element's record

#### Scenario: The capability column and the element-index stay the only additive schema changes
- GIVEN the migration directory and `schema.prisma` before and after this change
- WHEN they are compared
- THEN this change MUST introduce no table, no column, no enum, no backfill and no data migration beyond the one additive index on `ElementReviewEntry.inspectableElementId` (see the next scenario) — the `ManagerCapability` enum, the `User.managerCapabilities` column and that index MUST remain the only additive schema objects the history slices introduced, and `ReviewSession` MUST be unchanged

#### Scenario: Any index for the element-keyed read is measured, additive and independently revertable
- GIVEN the element-filtered read's query plan
- WHEN an index is considered for it
- THEN one MUST ship only if a measured plan justifies it, MUST be purely additive, MUST be revertable independently of the rest of this change, and MUST NOT replace or drop any existing index

#### Scenario: The installation-wide read keeps its covering index
- GIVEN the composite index on `ReviewSession(status, completedAt, id)` that keeps the unscoped read off a full table scan and filesort
- WHEN the schema and migration directory are inspected after this change
- THEN that index MUST still exist unchanged — the element-keyed read MUST NOT be read as license to drop it or to alter it
