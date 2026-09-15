# Delta for Review Session Management

> This capability's own routes, use cases, pages and repository reads are
> **byte-unchanged** by this slice. The only reason it appears here is its
> FR-008 deferral guard, whose *"no `ManagerCapability` /
> `managerCapabilities` / `VIEW_ALL_REVIEWS` mechanism MUST exist"*
> scenario goes false the moment the capability ships. It is narrowed —
> not deleted — to what it actually protects: this capability stays the
> write flow, and no capability-gated or cross-session read MUST appear
> inside it.

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions ships in the separate `review-history`
capability — now for the per-performer, per-community, per-company,
installation-wide **and capability-gated manager** scopes — and is
therefore no longer deferred wholesale. Everything below still MUST NOT
be introduced, and none of it MUST be introduced by **this** capability,
which still owns the write flow only and whose own reads MUST stay
byte-unchanged.
(Previously: the FR-008 row deferred global review visibility for
`MANAGER` — any `ManagerCapability` / `User.managerCapabilities` /
`VIEW_ALL_REVIEWS` mechanism and any `MANAGER` review visibility rule —
which `review-history` now implements, leaving only per-element history
deferred.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (remaining half) | Per-element history — any query, route, page or use case returning one inspectable element's past reviews. Any cross-session query in **this** capability's own routes, use cases or repository reads, including any company-scoped, installation-wide or capability-gated one. Any `managerCapabilities` or `VIEW_ALL_REVIEWS` reference inside this capability: the manager capability MUST affect the `review-history` read only, and MUST grant nothing on this capability's write flow |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any code path transitioning a session to `signed`; any document, PDF or export generation |
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

#### Scenario: No per-element review history surface exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single inspectable element
- THEN none MUST be found

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
- THEN no reachable code path MUST transition a session to `signed`, and no export or document generation MUST exist

#### Scenario: No per-answer attachments or notes exist
- GIVEN the answer contract after this change
- WHEN it is inspected
- THEN it MUST carry an answer value only, with no photo, attachment or free-text note field
