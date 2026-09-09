# Review History

## Purpose

Reading completed reviews (FR-008, first slice). `review-session`
(FR-007) shipped the write path and left completed sessions unreadable:
the only by-id read is performer-scoped and the only list is the
draft-resume list. This capability adds the read side for the **two**
visibility scopes that the shipped Layer 2 community-scope check already
resolves — a `MAINTENANCE_TECHNICIAN` sees the sessions **they**
performed, a `COMMUNITY_REPRESENTATIVE` sees the sessions performed on
**their** actively assigned communities regardless of who performed them
— plus the completed-only rule and a scoped read-back of one historical
session. Who holds the permission, and the community-assignment scope
rule itself, are owned by `authorization`; the field write flow is owned
by `review-session-management`; the web surface by `review-history-ui`.

Deliberately **not** here (deferred, see the guard requirements below):
company-wide visibility for `MAINTENANCE_COMPANY_MANAGER`, global
visibility for `SYSTEM_ADMIN` / `MANAGER` and therefore the whole
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
read-back MUST be available both to the session's performer and, for a
session on a community they are actively assigned to, to a
`COMMUNITY_REPRESENTATIVE` **who did not perform it**. The record MUST
be returned as it was answered, paired with the template snapshot's
wording, per *Sessions Render the Template's Frozen Snapshot*. Each entry
MUST carry the identity of the inspectable element it records — a record
whose entries cannot be attributed to a physical element is not a
compliance record.

#### Scenario: A performer reads back their own completed session
- GIVEN a `MAINTENANCE_TECHNICIAN` completed a session with three elements answered and one marked unreviewed with a reason
- WHEN they open that session from their history
- THEN the response MUST be 2xx and MUST return all four entries with their recorded answers, snapshotted question wording, and the unreviewed element's reason

#### Scenario: A representative reads back a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C, and a technician-performed `completed` session S for C
- WHEN the representative opens S from their history
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
a use case, controller or client. The property that no use case can reach
a session without its scope check — established by `review-session` —
MUST still hold after this change.

#### Scenario: No unscoped session read exists
- GIVEN the review-session repository port after this change
- WHEN its methods are enumerated
- THEN none MUST return a session (or a list of sessions) from an identifier alone, without a performer or community scope in its signature

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change
- WHEN their data access is inspected
- THEN none MUST fetch sessions outside the caller's scope and filter them afterwards in application, presentation or client code

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

### Requirement: History Access Requires a Currently Active Community Assignment, Including for One's Own Sessions

**Confirmed with the product owner (2026-09-08), settling the proposal's
open question 4.** History visibility MUST require an active community
assignment at request time, and this MUST apply to the caller's **own**
performed sessions as well as to the representative's community view. A
`MAINTENANCE_TECHNICIAN` whose community assignment has been deactivated
MUST lose access to the sessions they personally performed on that
community — retroactively, not only for future sessions. This inherits
the semantics `review-session` already shipped (performer **and**
currently-active assignment); it is a deliberate decision, not a
side effect of the existing code. The loss MUST take effect on the
caller's next request, with no grace period and no cached grant.

#### Scenario: A technician's own completed session becomes unreadable once their assignment is deactivated
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C who successfully reads back their own `completed` session S for C
- WHEN their technician assignment to C is deactivated and they repeat the same request
- THEN S MUST no longer appear in their own history, and requesting S by id MUST return `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A representative loses community history on deactivation
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who successfully lists C's completed sessions
- WHEN their representative assignment to C is deactivated and they repeat the same request
- THEN C's sessions MUST no longer be returned, and requesting any of them by id MUST return `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: Access returns with a new active assignment
- GIVEN a caller whose assignment to community C was deactivated and whose C history is consequently empty
- WHEN they are actively assigned to C again and repeat the request
- THEN the previously hidden completed sessions MUST be visible again

#### Scenario: Deactivation takes effect on the next request
- GIVEN a caller who has just performed a successful history read
- WHEN their assignment is deactivated and the identical request is issued immediately afterwards
- THEN the request MUST already be refused — no cached grant, no grace period

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

FR-008's two remaining visibility scopes stay deferred, and so does its
per-element half. The system MUST NOT introduce any of the following.

| Deferred | Must not exist |
|---|---|
| Company-wide visibility (`MAINTENANCE_COMPANY_MANAGER`) | Any review query, route or use case scoped by maintenance company; any `ReviewSession` → `User.maintenanceCompanyId` join |
| Global visibility (`SYSTEM_ADMIN` / `MANAGER`) | Any unscoped "all sessions" query; any `VIEW_ALL_REVIEWS` permission or capability; any `ManagerCapability` enum, `User.managerCapabilities` field, migration or capability-gated permission layer |
| Per-element history (FR-008's other half) | Any query, route or use case returning the past reviews of one inspectable element |
| List controls | Any pagination, date-range filter, sorting or search parameter on a history read |

#### Scenario: No manager capability mechanism exists
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST exist, and no migration MUST have added such a field

#### Scenario: No company-scoped or global review query exists
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN none MUST return sessions scoped by maintenance company, and none MUST return sessions without a performer or community scope

#### Scenario: No per-element history query or route exists
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN none MUST be found

#### Scenario: No list-control parameters are accepted
- GIVEN the history read routes and their request contracts after this change
- WHEN they are inspected
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter

#### Scenario: No migration ships with this change
- GIVEN the migration directory after this change
- WHEN it is compared with the state before the change
- THEN no new migration MUST have been added
