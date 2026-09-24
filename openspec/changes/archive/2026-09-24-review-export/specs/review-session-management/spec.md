# Delta for Review Session Management

> **Purpose amendment (for archive):** in the Purpose's out-of-scope list,
> replace "signing and export (FR-010)" with: "signing is completion
> itself (see *Completion Is the Signing Act*); the printable review
> document is owned by `review-document` and `review-document-ui`, not by
> this capability; a signature image and signer full name are FR-010
> slice 2". Nothing else in the Purpose changes.

## ADDED Requirements

### Requirement: Completion Is the Signing Act

Completing a session MUST be the act of signing it. The signer of a
`completed` session MUST be its performer (`performedById`) and the
signing date MUST be its `completedAt`. Signing MUST NOT introduce a new
operation, status, field, column or write: the completion write path,
its preconditions (*Complete a Session With Explained Gaps Only*) and its
resulting `completed` status MUST be unchanged, and no `signed` status
MUST exist.

Every `completed` session — including every session completed before
this change — MUST count as signed by its performer at its
`completedAt`, with no backfill and no data migration.

Signing MUST NOT open any path to reopen, unsign, re-sign or amend a
completed session, for any role, `SYSTEM_ADMIN` included. *Completed
Sessions Are Immutable* MUST hold unchanged; a correction is a new
session.

#### Scenario: The performer signs at completion time
- GIVEN technician U completes a session at instant T
- WHEN the session is read afterwards
- THEN its signer MUST be U and its signing date MUST be T, its `completedAt`

#### Scenario: A session completed before this change counts as signed
- GIVEN a session completed before this change was deployed
- WHEN its signer and signing date are resolved
- THEN they MUST be its performer and its `completedAt`, with no backfill having run

#### Scenario: The completion contract is unchanged
- GIVEN the completion request, its preconditions and its response before and after this change
- WHEN they are compared
- THEN they MUST be identical, and the resulting status MUST be `completed`

#### Scenario: No signed status or signature field exists
- GIVEN the schema, the domain entity and the status enum after this change
- WHEN they are inspected
- THEN no `signed` status, no `signedAt`/`signedById` field and no signature column MUST exist

#### Scenario: Not even an admin can reopen a signed session
- GIVEN a `completed` session
- WHEN a `SYSTEM_ADMIN` attempts to reopen, unsign or re-sign it by any available means
- THEN no such operation MUST exist or succeed, and the session MUST remain `completed` and unchanged

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions ships in the separate `review-history`
capability — now for the per-performer, per-community, per-company,
installation-wide **and capability-gated manager** scopes — and is
therefore no longer deferred wholesale. Signing now ships as completion
itself (*Completion Is the Signing Act*), and the printable review
document ships in the separate `review-document` and
`review-document-ui` capabilities. Everything below still MUST NOT be
introduced, and none of it MUST be introduced by **this** capability,
which still owns the write flow only and whose own reads MUST stay
byte-unchanged.
(Previously: the FR-010 row forbade any code path to `signed` and **any**
document, PDF or export generation anywhere. It is narrowed, not
deleted: a `signed` status stays forbidden, and document generation is
forbidden **in this capability** only, the review document now being a
read-only data request owned by `review-document`, itself barred from
producing any PDF, file or email.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (closed — per-element history shipped in `review-history` / `review-history-ui`) | Per-element history — any query, route, page or use case in **this** capability's own routes, use cases or repository reads returning one inspectable element's past reviews; that surface belongs to `review-history` and `review-history-ui` instead. Any cross-session query in **this** capability's own routes, use cases or repository reads, including any company-scoped, installation-wide or capability-gated one. Any `managerCapabilities` or `VIEW_ALL_REVIEWS` reference inside this capability: the manager capability MUST affect the `review-history` read only, and MUST grant nothing on this capability's write flow |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any `signed` status or any code path transitioning a session to it; any signing operation other than completion; any document read, PDF, file or export generation in **this** capability's own routes, use cases or repository reads — the review document belongs to `review-document`; any email or sending path; a signature image or signer name (slice 2) |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

#### Scenario: The one installation-wide read lives in review-history, not here
- GIVEN this capability's own routes, pages, use cases and repository reads after this change
- WHEN they are inspected
- THEN none MUST contain a review read unscoped across the installation — the single such read MUST belong to `review-history` and MUST be reachable only by a `SYSTEM_ADMIN` or a `MANAGER` whose `VIEW_ALL_REVIEWS` capability resolved affirmatively

#### Scenario: No capability mechanism reaches this capability
- GIVEN the routes, pages, use cases and repository queries of this capability after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST be found — the capability MUST live in the users and review-history capabilities only, and `MANAGER` MUST hold no write access here, granted or not

#### Scenario: This capability's two GET routes widen to MANAGER as an accepted, unrelated consequence
- GIVEN `GET /review-sessions` (the draft-resume list) and `GET /review-sessions/:sessionId` (the performer-scoped read), both gated by `reviewSession:read` and both belonging to this capability, not to `review-history`
- WHEN an authenticated `MANAGER` — granted or ungranted, since neither route consults `VIEW_ALL_REVIEWS` — calls either route
- THEN the response MUST be `200`/`404` rather than `403`; this is an accepted, named consequence of `authorization`'s unconditional `reviewSession:read` grant to `MANAGER` (see the `authorization` delta's *The Manager Becomes Operational…* requirement), not a capability-gated read, and it MUST NOT be treated as license to add a capability check, a company scope, or any cross-session query to either route — they remain performer-scoped and status-agnostic exactly as shipped

#### Scenario: The company scope lives in review-history, not here
- GIVEN this capability's own routes, use cases and repository reads after this change
- WHEN they are inspected
- THEN none MUST contain a company-scoped review query — this capability's only contact with the performing company MUST be writing the attribution when a session is opened

#### Scenario: The per-element review history read lives in review-history, not here
- GIVEN this capability's own routes, pages, use cases and repository queries after this change
- WHEN they are searched for a query, route, page or use case returning the past reviews of a single inspectable element
- THEN none MUST be found there — the per-element read MUST belong to `review-history` and `review-history-ui` instead, reached through the routes and page shipped there
(Previously: *No per-element review history surface exists* — unqualified, forbidding the feature outright. Per-element history shipped as part of `review-history-per-element`, deliberately outside this capability's own surface, which is what this scenario now asserts.)

#### Scenario: This capability's own surface adds no cross-session query
- GIVEN the routes, use cases and repository reads belonging to the field write flow after this change
- WHEN they are inspected
- THEN each MUST still read at most the caller's own session — the shipped performer-scoped, status-agnostic by-id read stays exactly as it is — and every read of a session the caller did not perform, and every cross-session list of completed sessions, MUST live in the `review-history` capability instead

#### Scenario: No scheduling or due-date logic exists
- GIVEN the shipped code after this change
- WHEN it is searched for due dates, overdue detection, cadence or reminders
- THEN none MUST be found

#### Scenario: No path reaches a signed session
- GIVEN the session status transitions implemented after this change
- WHEN they are enumerated
- THEN no reachable code path MUST transition a session to `signed`, and this capability's own routes, use cases and repository reads MUST contain no document read, export or document generation
(Previously: also required that no export or document generation exist anywhere; the review document now exists, owned by `review-document`.)

#### Scenario: The review document lives in review-document, not here
- GIVEN this capability's own routes, use cases and repository reads after this change
- WHEN they are searched for a read returning a review document, letterhead or organization-profile data
- THEN none MUST be found — that read MUST belong to `review-document`

#### Scenario: No per-answer attachments or notes exist
- GIVEN the answer contract after this change
- WHEN it is inspected
- THEN it MUST carry an answer value only, with no photo, attachment or free-text note field
