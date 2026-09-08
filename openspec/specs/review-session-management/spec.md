# Review Session Management

## Purpose

Performing a review (FR-007): a `MAINTENANCE_TECHNICIAN` or
`COMMUNITY_REPRESENTATIVE` opens a session against one community and one
frozen `active` review template, walks the building resolving each element
by the `code` printed on its label, records that element's answers,
optionally leaves elements unreviewed with a stated reason, pauses and
resumes, and finally completes the session. Answers are durable the moment
they are recorded — there is no atomic end-of-walk submit. A session in
`draft` is mutable; a `completed` session is permanently immutable and
undeletable by every role. Access control (who holds the permissions, and
the community-assignment scope rule) is owned by the `authorization` spec.
Out of scope here: review history and cross-session queries (FR-008),
scheduling / due dates / reminders (FR-009), signing and export (FR-010),
offline operation, camera scanning, photos, attachments, per-answer notes,
defect records, and notifications.

## Requirements

### Requirement: Open a Review Session Against a Community and a Specific Template

The system MUST allow an authorized user to open a review session by
choosing a community and a specific `active` **frozen** review template
(the caller identifies the template directly, not just its element type —
see "Element type resolves to exactly one template" below, since one
element type MAY have more than one `active` template across different
frequency lineages). The session MUST be bound to exactly one community
and exactly one such template. The session MUST start in `draft` status.
The session's element type and frequency MUST be derived from its bound
template and MUST NOT be stored as independent, separately settable
session inputs. When the named template is not currently `active`, or no
`active` template exists for the intended element type, the request MUST
be rejected with a clear, identifiable error and no session MUST be
persisted.

#### Scenario: A technician opens a session for an assigned community
- GIVEN a `MAINTENANCE_TECHNICIAN` is actively assigned to community C and an `active` frozen template exists for element type T
- WHEN they open a session for C and T
- THEN the response MUST be 2xx, a session MUST exist in `draft` status, and it MUST reference C and that template

#### Scenario: A representative opens a session through the identical flow
- GIVEN a `COMMUNITY_REPRESENTATIVE` is actively assigned to community C and an `active` frozen template exists for element type T
- WHEN they open a session for C and T using the same operation a technician uses
- THEN the response MUST be 2xx and the resulting session MUST be indistinguishable in shape from a technician-opened session

#### Scenario: No active template for the element type
- GIVEN no `active` template exists for element type T
- WHEN an authorized user attempts to open a session for community C and T
- THEN the request MUST be rejected with an identifiable error and no session row MUST be created

#### Scenario: A draft template can never back a session
- GIVEN element type T has a `draft` template and no `active` one
- WHEN an authorized user attempts to open a session for T
- THEN the request MUST be rejected and no session MUST reference the `draft` template

#### Scenario: Element type and frequency are derived, not supplied
- GIVEN a session bound to a template
- WHEN the session's element type and frequency are read
- THEN they MUST equal the template's, and no operation MUST allow setting them independently of the template

#### Scenario: Element type resolves to exactly one template
- GIVEN more than one `active` template exists for element type T across different frequency lineages
- WHEN a user opens a session for T
- THEN the system MUST NOT choose one arbitrarily; the requester MUST identify which template applies, or the request MUST be rejected

### Requirement: At Most One Open Draft Per Community, Template and User

The system MUST allow a user to hold at most **one** `draft` session for a
given (community, template) pair. An attempt to open a second one MUST be
rejected with an identifiable error, MUST NOT create a second session, and
MUST leave the existing draft untouched. The rule is per user: a different
user MAY hold their own draft for the same pair, and the same user MAY
hold drafts for different communities or different templates at once.

#### Scenario: A second draft for the same pair is rejected
- GIVEN user U holds a `draft` session for community C and template V
- WHEN U attempts to open another session for C and V
- THEN the request MUST be rejected with an identifiable error, no second session MUST be created, and U's existing draft MUST be unchanged

#### Scenario: Another user may hold their own draft for the same pair
- GIVEN user U holds a `draft` session for community C and template V, and user W is also actively assigned to C
- WHEN W opens a session for C and V
- THEN the request MUST succeed and W MUST hold a separate `draft` session

#### Scenario: The same user may hold drafts for different pairs
- GIVEN user U holds a `draft` session for community C and template V
- WHEN U opens a session for a different community, or for a different template of C
- THEN the request MUST succeed

#### Scenario: Completing frees the pair
- GIVEN user U's session for community C and template V is `completed`
- WHEN U opens a new session for C and V
- THEN the request MUST succeed

### Requirement: Only the Opener May Resume a Draft Session

The system MUST allow the user who opened a `draft` session — and only
that user — to resume it, with every previously recorded answer and
unreviewed-element reason intact. Any other user, including one actively
assigned to the same community, MUST be rejected. Handover of a session
between users is out of scope for this slice.

#### Scenario: The opener resumes with all prior work intact
- GIVEN user U opened a session and recorded answers for two elements before leaving
- WHEN U resumes that session later
- THEN the response MUST be 2xx and both elements' recorded answers MUST be returned unchanged

#### Scenario: Another assigned user cannot resume someone else's draft
- GIVEN user U holds a `draft` session for community C, and user W is also actively assigned to C
- WHEN W attempts to resume U's session
- THEN the request MUST be rejected and the session MUST be unchanged

#### Scenario: No handover operation exists
- GIVEN the API surface and use cases after this change
- WHEN they are inspected
- THEN none MUST transfer a session's ownership from one user to another

### Requirement: Discard a Draft Session

The system MUST allow the user who opened a `draft` session to discard it.
A discarded session MUST NOT be resumable and MUST free its (community,
template) pair for a new draft. Only a `draft` session MAY be discarded —
see *Completed Sessions Are Immutable*.

#### Scenario: The opener discards their draft
- GIVEN user U holds a `draft` session for community C and template V
- WHEN U discards it
- THEN the response MUST be 2xx, the session MUST NOT be resumable, and U MUST be able to open a new session for C and V

#### Scenario: Another user cannot discard someone else's draft
- GIVEN user U holds a `draft` session and user W is also actively assigned to the same community
- WHEN W attempts to discard U's session
- THEN the request MUST be rejected and the session MUST remain resumable by U

### Requirement: Resolve an Element by Code Within the Session's Scope

Within a `draft` session, the system MUST resolve a submitted element
`code` to exactly one element and present that element's questions. The
resolution MUST succeed only when the element belongs to the session's
community, is of the session's element type, is active (not
decommissioned), and is not soft-deleted. Every other outcome MUST be
rejected under *Rejected Codes Are Indistinguishable*. A failed resolution
MUST persist nothing and MUST leave the session untouched.

#### Scenario: A valid in-scope code resolves and presents questions
- GIVEN a `draft` session for community C and element type T, and an active element E in C of type T with `code` X
- WHEN the user submits X
- THEN the response MUST be 2xx, MUST identify E, and MUST present the session template's questions for E

#### Scenario: A rejected code persists nothing
- GIVEN a `draft` session with two elements already answered
- WHEN the user submits a code that cannot be resolved in scope
- THEN the request MUST be rejected, and the session's status and recorded answers MUST be byte-for-byte unchanged

#### Scenario: No bare global code lookup is exposed
- GIVEN the API surface after this change
- WHEN it is inspected
- THEN no operation MUST return an element from a `code` alone, without a session scope or an equivalent community-and-element-type constraint

### Requirement: Rejected Codes Are Indistinguishable

This is a security requirement, not a UX preference: `code` is globally
unique across the installation, so a distinguishable "exists, but not
yours" response would let any authorized user enumerate other companies'
communities and elements by guessing codes.

The system MUST reject **all** of the following with the *same* HTTP
status and the *same* error code and message, carrying no field, hint or
payload difference between them:

| Rejected input |
|---|
| A code matching no element at all |
| A code of an element in another community |
| A code of an element of another element type |
| A code of a decommissioned element |
| A code of a soft-deleted element |

No distinct error code MUST exist for any of these cases, and no response
MUST disclose that the code exists elsewhere in the installation. No audit
or logging mechanism for failed lookups is introduced by this slice.

#### Scenario: A foreign-community code behaves exactly like a nonsense code
- GIVEN a `draft` session for community C, and an active element E in a different community with `code` X
- WHEN the user submits X, and separately submits a well-formed code matching no element
- THEN both responses MUST have the identical status, identical error code and identical message

#### Scenario: A wrong-element-type code behaves exactly like a nonsense code
- GIVEN a `draft` session for community C and element type T, and an element in C of a different element type with `code` X
- WHEN the user submits X, and separately submits a well-formed code matching no element
- THEN both responses MUST be identical in status, error code and message

#### Scenario: A decommissioned element's code behaves exactly like a nonsense code
- GIVEN a `draft` session for community C and element type T, and a decommissioned element in C of type T with `code` X
- WHEN the user submits X, and separately submits a well-formed code matching no element
- THEN both responses MUST be identical in status, error code and message

#### Scenario: A soft-deleted element's code behaves exactly like a nonsense code
- GIVEN a soft-deleted element in the session's community and element type with `code` X
- WHEN the user submits X, and separately submits a well-formed code matching no element
- THEN both responses MUST be identical in status, error code and message

#### Scenario: No "exists but not yours" error code exists
- GIVEN the application's declared error codes after this change
- WHEN they are inspected
- THEN none MUST distinguish an out-of-scope element from an unknown code

#### Scenario: No failed-lookup audit trail is introduced
- GIVEN the schema and use cases after this change
- WHEN they are inspected
- THEN no table, record or logging mechanism MUST capture rejected code lookups

### Requirement: Sessions Render the Template's Frozen Snapshot

The questions a session presents — their wording, their set and their
order — MUST come from the bound template's activation snapshot, never
from the live `ChecklistQuestion` pool. Editing, soft-deleting or
reordering pool questions after a session opens MUST NOT change what that
session presents, at any later point in its life, including after it is
completed.

#### Scenario: Editing the live pool does not change an open session
- GIVEN a `draft` session bound to template V whose snapshot contains question Q with wording W
- WHEN a `SYSTEM_ADMIN` edits Q's live wording to W2 and the user then resolves an element in that session
- THEN the presented wording for Q MUST still be W

#### Scenario: Soft-deleting a pool question does not shrink an open session
- GIVEN a `draft` session bound to template V whose snapshot contains question Q
- WHEN a `SYSTEM_ADMIN` soft-deletes Q from the live pool and the user then resolves an element in that session
- THEN Q MUST still be presented, in its snapshotted position

#### Scenario: A completed session reads back as it was answered
- GIVEN a `completed` session and subsequent edits to the live question pool
- WHEN the session's recorded answers are read afterwards
- THEN each answer MUST still be paired with the snapshotted wording that was answered

### Requirement: Record an Element's Answers

Within a `draft` session, the system MUST record an answer of `YES`, `NO`
or `NOT_APPLICABLE` for every question in the session template's frozen
snapshot for a resolved element. The recording MUST be durable
immediately, independently of whether the session is ever completed. A
session MUST hold at most one review record per element. A recording MUST
be rejected when it omits a snapshot question, when it carries a question
that is not in the snapshot, or when it carries a value outside the three
declared ones. Recording MUST be possible only while the session is
`draft`.

#### Scenario: An element's answers are durable immediately
- GIVEN a `draft` session with element E resolved
- WHEN the user records answers for every snapshot question of E and the session is never completed
- THEN reading the session afterwards MUST return E's answers exactly as recorded

#### Scenario: Re-recording corrects rather than duplicating
- GIVEN element E already has recorded answers in a `draft` session
- WHEN the user records answers for E again in that session
- THEN the session MUST still hold exactly one review record for E, carrying the latest values

#### Scenario: An incomplete answer set is rejected
- GIVEN a `draft` session with element E resolved and a snapshot of N questions
- WHEN the user submits answers for fewer than N of them
- THEN the request MUST be rejected and no partial record MUST be persisted for E

#### Scenario: An unknown question is rejected
- GIVEN a `draft` session with element E resolved
- WHEN the user submits an answer for a question that is not in the session template's snapshot
- THEN the request MUST be rejected and nothing MUST be persisted

#### Scenario: An out-of-range answer value is rejected
- GIVEN a `draft` session with element E resolved
- WHEN the user submits any answer value other than `YES`, `NO` or `NOT_APPLICABLE`
- THEN the request MUST be a 4xx validation error and nothing MUST be persisted

### Requirement: An Unreviewed Element Requires a Recorded Reason

The system SHALL require and record a non-empty reason whenever an element
within a session's scope is left unreviewed. A request to leave an element
unreviewed without a reason MUST be rejected and MUST persist nothing.
Recording a reason MUST NOT count the element as reviewed.

This requirement is stated in terms of observable behaviour only. The
reason is persisted on the per-element review record
(`ElementReviewEntry.observations`), settled by `sdd-design`.

#### Scenario: An element is left unreviewed with a reason
- GIVEN a `draft` session for community C and element type T, containing active element E
- WHEN the user marks E unreviewed with the reason "sealed room, no access"
- THEN the response MUST be 2xx, and reading the session MUST report E as unreviewed together with that reason

#### Scenario: An empty or missing reason is rejected
- GIVEN a `draft` session containing active element E
- WHEN the user attempts to mark E unreviewed with no reason, or with a blank one
- THEN the request MUST be rejected and nothing MUST be persisted for E

#### Scenario: An unreviewed element is not counted as reviewed
- GIVEN element E is marked unreviewed with a reason
- WHEN the session's reviewed elements are read
- THEN E MUST NOT appear among them

### Requirement: Complete a Session With Explained Gaps Only

The system MUST allow completing a `draft` session **without** having
reviewed every active element of its community and element type — locked
rooms and blocked access are the field reality. Completion MUST be
rejected when any active, non-soft-deleted element of the session's
community and element type is neither reviewed nor carries a recorded
unreviewed reason. Completion MUST transition the session to `completed`.
Decommissioned and soft-deleted elements MUST NOT be required for
completion.

#### Scenario: A partial session with explained gaps completes
- GIVEN community C has 5 active elements of type T, 3 reviewed in the session and 2 marked unreviewed with reasons
- WHEN the user completes the session
- THEN the response MUST be 2xx and the session's status MUST be `completed`

#### Scenario: An unexplained gap blocks completion
- GIVEN community C has 5 active elements of type T and the session has 3 reviewed and 2 with neither answers nor a reason
- WHEN the user attempts to complete the session
- THEN the request MUST be rejected with an identifiable error and the session MUST remain `draft`

#### Scenario: A fully reviewed session completes
- GIVEN every active element of the session's community and element type has recorded answers
- WHEN the user completes the session
- THEN the response MUST be 2xx and the status MUST be `completed`

#### Scenario: Decommissioned and soft-deleted elements do not block completion
- GIVEN community C has active elements all reviewed, plus a decommissioned element and a soft-deleted one of the same type
- WHEN the user completes the session
- THEN the response MUST be 2xx, and no reason MUST be required for the decommissioned or soft-deleted elements

### Requirement: Completed Sessions Are Immutable

A session whose status is not `draft` MUST be permanently immutable. No
role — **including `SYSTEM_ADMIN`** — MUST be able to edit it, reopen it,
record further answers or unreviewed reasons against it, discard it,
soft-delete it or hard-delete it. This MUST be enforced by the domain
layer, so that it holds regardless of which route, use case or repository
method is used to reach the session.

#### Scenario: Answering a completed session is rejected
- GIVEN a `completed` session
- WHEN any user attempts to record answers for an element in it
- THEN the request MUST be rejected with an identifiable error and the session MUST be unchanged

#### Scenario: Reopening a completed session is rejected
- GIVEN a `completed` session
- WHEN any user attempts to transition it back to `draft`
- THEN the request MUST be rejected and the status MUST remain `completed`

#### Scenario: A SYSTEM_ADMIN cannot delete a completed session
- GIVEN a `completed` session
- WHEN a `SYSTEM_ADMIN` attempts to delete or discard it by any available means
- THEN the request MUST be rejected and the session MUST still exist with its answers intact

#### Scenario: Discarding is refused for a completed session
- GIVEN a `completed` session
- WHEN its opener attempts to discard it
- THEN the request MUST be rejected

#### Scenario: Immutability holds below the controller
- GIVEN the domain layer is exercised directly, bypassing routes and guards
- WHEN a mutation is attempted against a session whose status is not `draft`
- THEN the domain MUST refuse it

### Requirement: Review Records Carry No Deletion Path

Review records are compliance evidence: the system MUST NOT provide a soft
delete or a hard delete for a review session, an element's review record,
or an answer. No `deletedAt` column MUST exist on any of the three new
review tables (ADR-010's stricter rule for review records). Discarding a
`draft` session is the only removal path that exists, and it MUST NOT be
reachable for any other status.

#### Scenario: No deletedAt exists on the review tables
- GIVEN the migrated schema
- WHEN the three review tables are inspected
- THEN none MUST carry a `deletedAt` column

#### Scenario: No delete operation is exposed
- GIVEN the API surface, use cases and repository ports after this change
- WHEN they are inspected
- THEN none MUST delete an element's review record or an individual answer

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent;
none of them ships here. The system MUST NOT introduce any of the
following in this slice.

| Deferred to | Must not exist |
|---|---|
| FR-008 | Per-element or per-community review history route, page, use case or cross-session query; `MANAGER` / `MAINTENANCE_COMPANY_MANAGER` visibility rules |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any code path transitioning a session to `signed`; any document, PDF or export generation |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

#### Scenario: No review history surface exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for cross-session or per-element review history
- THEN none MUST be found

#### Scenario: No scheduling or due-date logic exists
- GIVEN the shipped code after this change
- WHEN it is searched for due dates, overdue detection, cadence or reminders
- THEN none MUST be found

#### Scenario: No path reaches a signed session
- GIVEN the session status transitions implemented after this change
- WHEN they are enumerated
- THEN no reachable code path MUST transition a session to `signed`, and no export or document generation MUST exist

#### Scenario: No per-answer attachments or notes exist
- GIVEN the answer contract after this change
- WHEN it is inspected
- THEN it MUST carry an answer value only, with no photo, attachment or free-text note field
