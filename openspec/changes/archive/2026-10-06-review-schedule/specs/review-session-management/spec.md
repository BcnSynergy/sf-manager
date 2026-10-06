# Delta for Review Session Management

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions ships in the separate `review-history`
capability — now for the per-performer, per-community, per-company,
installation-wide **and capability-gated manager** scopes — and is
therefore no longer deferred wholesale. Signing now ships as completion
itself (*Completion Is the Signing Act*), and the printable review
document ships in the separate `review-document` and
`review-document-ui` capabilities. The read-only due and overdue list
(FR-009 slice 1) ships in the separate `review-schedule` and
`review-schedule-ui` capabilities. Everything below still MUST NOT be
introduced, and none of it MUST be introduced by **this** capability,
which still owns the write flow only and whose own reads MUST stay
byte-unchanged.
(Previously: the FR-008 row deferred global review visibility for
`MANAGER` — any `ManagerCapability` / `User.managerCapabilities` /
`VIEW_ALL_REVIEWS` mechanism and any `MANAGER` review visibility rule —
which `review-history` now implements, leaving only per-element history
deferred. The FR-010 row forbade any code path to `signed` and **any**
document, PDF or export generation anywhere. It is narrowed, not
deleted: a `signed` status stays forbidden, and document generation is
forbidden **in this capability** only, the review document now being a
read-only data request owned by `review-document`, itself barred from
producing any PDF, file or email. The FR-008 row's capability clause and
the FR-009 row are now narrowed in the same way, see below.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (closed — per-element history shipped in `review-history` / `review-history-ui`) | Per-element history — any query, route, page or use case in **this** capability's own routes, use cases or repository reads returning one inspectable element's past reviews; that surface belongs to `review-history` and `review-history-ui` instead. Any cross-session query in **this** capability's own routes, use cases or repository reads, including any company-scoped, installation-wide or capability-gated one. Any `managerCapabilities` or `VIEW_ALL_REVIEWS` reference inside this capability: the manager capability MUST affect the `review-history` read and the `review-schedule` read only, and MUST grant nothing on this capability's write flow |
| FR-009 | Within **this** capability's own routes, use cases and repository reads: scheduling service, due dates, overdue lists, cadence rules or reminders. The read-only due and overdue list belongs to `review-schedule`; reminders, notifications and any scheduled job remain deferred everywhere |
| FR-010 | Any `signed` status or any code path transitioning a session to it; any signing operation other than completion; any document read, PDF, file or export generation in **this** capability's own routes, use cases or repository reads — the review document belongs to `review-document`; any email or sending path; a signature image or signer name (slice 2) |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

(Previously, FR-008 row: "the manager capability MUST affect the
`review-history` read only". FR-009 row: "Scheduling service, due dates,
overdue lists, cadence rules or reminders", unqualified, forbidding them
anywhere.)

#### Scenario: The one installation-wide read lives in review-history, not here
- GIVEN this capability's own routes, pages, use cases and repository reads after this change
- WHEN they are inspected
- THEN none MUST contain a review read unscoped across the installation — the single such read MUST belong to `review-history` and MUST be reachable only by a `SYSTEM_ADMIN` or a `MANAGER` whose `VIEW_ALL_REVIEWS` capability resolved affirmatively

#### Scenario: No capability mechanism reaches this capability
- GIVEN the routes, pages, use cases and repository queries of this capability after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST be found — the capability MUST live in the users, review-history and review-schedule capabilities only, and `MANAGER` MUST hold no write access here, granted or not
(Previously: "the users and review-history capabilities only".)

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

#### Scenario: No scheduling or due-date logic exists in this capability
- GIVEN this capability's own routes, use cases and repository reads after this change
- WHEN they are searched for due dates, overdue detection, cadence or reminders
- THEN none MUST be found — the due and overdue computation MUST belong to `review-schedule`, and no reminder, notification or scheduled job MUST exist anywhere
(Previously: "the shipped code", anywhere, with no qualifier; the title read "No scheduling or due-date logic exists".)

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
