# Review History

## Purpose

Reading completed reviews (FR-008). `review-session` (FR-007) shipped the
write path and left completed sessions unreadable: the only by-id read is
performer-scoped and the only list is the draft-resume list. This
capability adds the read side for **three** visibility scopes: a
`MAINTENANCE_TECHNICIAN` sees the sessions **they** performed, a
`COMMUNITY_REPRESENTATIVE` sees the sessions performed on **their**
actively assigned communities regardless of who performed them, and a
`MAINTENANCE_COMPANY_MANAGER` sees every `completed` session attributed to
their own maintenance company, across every technician and every
community, with no community assignment involved. The first two scopes
are resolved by the shipped Layer 2 community-scope check; the third is
not — it resolves from the performing-company attribution frozen onto the
session (owned by `review-session-management`). Plus the completed-only
rule and a scoped read-back of one historical session. Who holds the
permission, and each scope rule itself, are owned by `authorization`; the
field write flow is owned by `review-session-management`; the web surface
by `review-history-ui`.

Deliberately **not** here (deferred, see the guard requirements below):
global visibility for `SYSTEM_ADMIN` / `MANAGER` and therefore the whole
`ManagerCapability` mechanism, per-element history filtering,
pagination, date filters, sorting and search, and any write, signing,
export, scheduling or analytics path.

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
community they are actively assigned to; and to a
`MAINTENANCE_COMPANY_MANAGER` **who did not perform it**, for a session
attributed to their own maintenance company. All three MUST receive the
identical record — there MUST be no reduced or role-specific variant of
the recorded record. The record MUST be returned as it was answered,
paired with the template snapshot's wording, per *Sessions Render the
Template's Frozen Snapshot*. Each entry MUST carry the identity of the
inspectable element it records — a record whose entries cannot be
attributed to a physical element is not a compliance record.
(Previously: the read-back was available to the performer and to an
actively assigned representative only.)

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
access itself. The system MUST NOT expose an unscoped by-id read of a
review session, and MUST NOT obtain a broader result set and narrow it in
a use case, controller or client. This MUST hold for the company scope
exactly as it does for the performer and community scopes: the caller's
maintenance company MUST be carried in the data access, and a company
that cannot be resolved MUST produce no result rather than an unscoped
one. The property that no use case can reach a session without its scope
check — established by `review-session` — MUST still hold after this
change.
(Previously: the port's scope dimensions were a performer or a set of
communities only.)

#### Scenario: No unscoped session read exists
- GIVEN the review-session repository port after this change
- WHEN its methods are enumerated
- THEN none MUST return a session (or a list of sessions) from an identifier alone, without a performer, community or maintenance-company scope in its signature

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change
- WHEN their data access is inspected
- THEN none MUST fetch sessions outside the caller's scope and filter them afterwards in application, presentation or client code

#### Scenario: An unresolvable company never widens the query
- GIVEN a company-scoped history read whose caller has no maintenance company
- WHEN the data access is inspected
- THEN it MUST NOT be issued without a company predicate, and MUST NOT fall back to an unfiltered read

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

FR-008's **global** visibility scope stays deferred, and so does its
per-element half. Company-wide visibility for
`MAINTENANCE_COMPANY_MANAGER` is no longer deferred — it ships in this
change, scoped by the session's frozen performing-company attribution.
The system MUST NOT introduce any of the following.
(Previously: company-wide visibility was deferred too, and this
capability shipped no migration.)

| Deferred | Must not exist |
|---|---|
| Global visibility (`SYSTEM_ADMIN` / `MANAGER`) | Any unscoped "all sessions" query; any `VIEW_ALL_REVIEWS` permission or capability; any `ManagerCapability` enum, `User.managerCapabilities` field, migration or capability-gated permission layer |
| Per-element history (FR-008's other half) | Any query, route or use case returning the past reviews of one inspectable element |
| List controls | Any pagination, date-range filter, sorting or search parameter on a history read — including on the company-wide list |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

#### Scenario: No manager capability mechanism exists
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: Every company-scoped query names a single company; no global query exists
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier in its signature, and none MUST return sessions without a performer, community or company scope

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
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter, on any of the three scopes

#### Scenario: The only migration is the attribution column and its backfill
- GIVEN the migration directory after this change
- WHEN it is compared with the state before the change
- THEN the only migration added MUST be the one introducing the performing-company attribution column, its index and its one-time data backfill
