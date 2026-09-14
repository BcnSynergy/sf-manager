# Review History

## Purpose

Reading completed reviews (FR-008). `review-session` (FR-007) shipped the
write path and left completed sessions unreadable: the only by-id read is
performer-scoped and the only list is the draft-resume list. This
capability adds the read side for **four** visibility scopes: a
`MAINTENANCE_TECHNICIAN` sees the sessions **they** performed, a
`COMMUNITY_REPRESENTATIVE` sees the sessions performed on **their**
actively assigned communities regardless of who performed them, a
`MAINTENANCE_COMPANY_MANAGER` sees every `completed` session attributed to
their own maintenance company, across every technician and every
community, with no community assignment involved, and a `SYSTEM_ADMIN`
sees **every** `completed` session in the installation, with no scope
filter at all — the first and only read in the system that narrows
nothing. The first two scopes are resolved by the shipped Layer 2
community-scope check; the third is not — it resolves from the
performing-company attribution frozen onto the session (owned by
`review-session-management`); the fourth resolves from the role alone,
with no scope predicate whatsoever. Plus the completed-only rule and a
scoped read-back of one historical session. Who holds the permission, and
each scope rule itself, are owned by `authorization`; the field write flow
is owned by `review-session-management`; the web surface by
`review-history-ui`.

Deliberately **not** here (deferred, see the guard requirements below):
the `MANAGER` half of global visibility and therefore the whole
`ManagerCapability` mechanism, per-element history filtering, pagination,
date filters, sorting and search, and any write, signing, export,
scheduling or analytics path.

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

### Requirement: A System Admin's Installation-Wide Completed Review History

The system MUST let a `SYSTEM_ADMIN` list **every** `completed` review
session in the installation — across every maintenance company, every
community, every performer and all time — **with no scope narrowing of
any kind**. The absence of a scope filter is the requirement, not an
omission: it MUST be intended, asserted and preserved, and a later change
that re-introduces any narrowing on this read MUST be treated as a
regression.

The result MUST be a single flat list in the same deterministic
chronological order by completion time, and in the same direction, as the
other three scopes' lists. An empty installation MUST produce a
successful empty list, never an error.

Because this list spans companies, communities and performers, every row
MUST identify its community and **who performed** the session, exactly as
the company-wide list already does. No additional row field is required
by this scope.

Visibility MUST NOT be reduced by deleted or deactivated context — the
one scope with no exceptions:

| Case | Required behaviour |
|---|---|
| The session's community has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session's attributed maintenance company has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session carries no performing-company attribution at all | The session MUST still be listed and readable by id |
| The session's performer has been deactivated or soft-deleted, or has changed employer | The session MUST still be listed and readable by id |

This deliberately diverges from the other three scopes, where deactivated
context removes visibility. The purpose here is total system audit, not
operational scoping: deleted context MUST NOT hide a compliance record
from the auditor.

The `completed`-only rule MUST still hold: a `draft` MUST NOT appear in
this list and MUST NOT be readable through the history detail read by
this actor either.

#### Scenario: The admin sees every completed session in the installation
- GIVEN completed sessions attributed to companies X and Y, on communities C and D, performed by three different technicians
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: The ordering matches the other three scopes
- GIVEN the same set of completed sessions visible to a technician, a representative, a manager and a `SYSTEM_ADMIN`
- WHEN each list is compared
- THEN the relative order of any two sessions present in more than one of them MUST be identical

#### Scenario: A deactivated community's sessions remain visible
- GIVEN a `completed` session on a community that has since been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` requests review history and opens that session
- THEN it MUST be listed and its full recorded record MUST be returned

#### Scenario: A soft-deleted or absent company does not hide a session
- GIVEN a `completed` session attributed to a soft-deleted maintenance company, and another carrying no attributed company at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN both MUST appear — even though the unattributed one appears in no manager's list

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

This read MUST be reachable **only** for a `SYSTEM_ADMIN`. For every
other role, the shipped scope rules MUST decide the outcome exactly as
they did before this change.

#### Scenario: The admin opens a session from a company and community they have no relation to
- GIVEN a `completed` session S attributed to company X, performed by X's technician on community C, and a `SYSTEM_ADMIN` with no assignment and no company
- WHEN the admin opens S
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: Deleted context does not block the by-id read
- GIVEN a `completed` session whose community, attributed company and performer have all been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` opens it
- THEN the response MUST be 2xx and MUST return its full recorded record

#### Scenario: No other role gains the unconditional by-id read
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE` and a `MAINTENANCE_COMPANY_MANAGER`, and a `completed` session outside each one's scope
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
attributed to their own maintenance company; and to a `SYSTEM_ADMIN`,
for **any** `completed` session in the installation, whose scope is the
whole installation (see *A System Admin Can Read Any Completed Session by
Identifier*). All four MUST receive the identical record — there MUST be
no reduced or role-specific variant of the recorded record. The record
MUST be returned as it was answered, paired with the template snapshot's
wording, per *Sessions Render the Template's Frozen Snapshot*. Each entry
MUST carry the identity of the inspectable element it records — a record
whose entries cannot be attributed to a physical element is not a
compliance record.
(Previously: the read-back was available to the performer, an actively
assigned representative, and the manager of the attributed company only.)

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

### Requirement: History Scope Is Carried by the Query, Not by the Caller

Every history read MUST have its visibility scope expressed in the data
access itself, and the system MUST NOT obtain a broader result set and
narrow it in a use case, controller or client. This MUST hold for all
four scopes — including the `SYSTEM_ADMIN` scope, where the scope **is**
the whole installation: the admin read MUST be a distinct data access
whose only predicate is the `completed` status, never a scoped read
issued with an empty, wildcard or null scope value. A scope that cannot
be resolved MUST still produce no result rather than an unscoped one, for
every role that has a scope to resolve.

The installation-wide read MUST be reachable **only** from the
`SYSTEM_ADMIN` path. It MUST be impossible to reach it while serving any
other role, and it MUST be named and expressed so that a reader — and an
autocomplete list — cannot mistake it for, or accidentally select it in
place of, a scoped read. *How* this is achieved, and how the shipped
property that no read of a session is available from an identifier alone
is restated now that one such read legitimately exists, is a design
decision; *that* the unscoped read is unreachable from every non-admin
path is a requirement.
(Previously: the system MUST NOT expose an unscoped by-id read of a
review session at all, and no port method MUST return a session from an
identifier alone.)

#### Scenario: Exactly one unscoped read exists
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods that read `completed` sessions are enumerated
- THEN exactly one list method and one by-id method MUST carry no performer, community or maintenance-company scope, and every other method MUST carry one

#### Scenario: The unscoped read is reachable only from the admin path
- GIVEN the call sites of the unscoped read after this change
- WHEN every one of them is enumerated — no sampling
- THEN each MUST be the `SYSTEM_ADMIN` path of the history access resolution, and no other use case, service, controller or adapter MUST call it

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change
- WHEN their data access is inspected
- THEN none MUST fetch sessions outside the caller's scope and filter them afterwards in application, presentation or client code

#### Scenario: An unresolvable company never widens the query
- GIVEN a company-scoped history read whose caller has no maintenance company
- WHEN the data access is inspected
- THEN it MUST NOT be issued without a company predicate, and MUST NOT fall back to an unfiltered read — and in particular MUST NOT fall through to the admin's unscoped read

#### Scenario: The scoped reads are not re-expressed as the unscoped one
- GIVEN the technician, representative and manager history reads after this change
- WHEN their data access is inspected
- THEN each MUST still carry its own scope predicate, and none MUST be implemented by issuing the unscoped read and narrowing the result

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

FR-008's global visibility scope is now **half** built: the
`SYSTEM_ADMIN` half ships in this change (see *A System Admin's
Installation-Wide Completed Review History*). The `MANAGER` half stays
deferred, and so does per-element history. FR-008 does **not** close with
this change. The system MUST NOT introduce any of the following.
(Previously: the whole global scope was deferred, no unscoped "all
sessions" query was allowed to exist, and the capability's only migration
was the performing-company attribution column and its backfill.)

| Deferred | Must not exist |
|---|---|
| Global visibility for `MANAGER` | Any `VIEW_ALL_REVIEWS` permission or capability; any `ManagerCapability` enum, `User.managerCapabilities` field, migration or capability-gated permission layer; any `MANAGER` review visibility rule |
| A second unscoped read | Any unscoped "all sessions" query beyond the single admin pair, and any path reaching that pair while serving a non-`SYSTEM_ADMIN` caller |
| Per-element history (FR-008's other half) | Any query, route or use case returning the past reviews of one inspectable element |
| List controls | Any pagination, date-range filter, sorting or search parameter on a history read — including on the installation-wide list, by far the largest |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

#### Scenario: No manager capability mechanism exists
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: Every scoped query still names its scope, and only one query names none
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier, each community-scoped method its communities and each performer-scoped method its performer — and exactly one list/by-id pair MUST carry no scope at all

#### Scenario: The company scope never joins to the performer's current company
- GIVEN the company-scoped history queries after this change
- WHEN their predicates are inspected
- THEN each MUST match the session's own recorded performing company, and none MUST resolve membership through the performer's current `User.maintenanceCompanyId`

#### Scenario: No per-element history query or route exists
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN none MUST be found

#### Scenario: No list-control parameters are accepted
- GIVEN the history read routes and their request contracts after this change
- WHEN they are inspected
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter, on any of the four scopes

#### Scenario: This change adds no migration
- GIVEN the migration directory and `schema.prisma` after this change
- WHEN they are compared with the state before the change
- THEN both MUST be unchanged — installation-wide visibility MUST require no new column, index or backfill
