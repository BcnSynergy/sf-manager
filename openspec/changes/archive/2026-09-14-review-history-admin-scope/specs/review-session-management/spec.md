# Delta for Review Session Management

> **Purpose amendment (for archive):** the capability's Purpose lists
> global visibility as out of scope here. That stays true **of this
> capability**, which still owns the write flow only and still introduces
> no history read of its own. What changes is the wording of its FR-008
> deferral guard: an installation-wide review read now exists in the
> system, owned by `review-history` and reachable only by a
> `SYSTEM_ADMIN`. This capability introduces none of it, and its own
> reads stay exactly as shipped.
>
> This delta exists only because the shipped guard scenario asserts "no
> review read unscoped across the installation exists" **globally**, not
> merely within this capability — an assertion this change makes false.
> No behaviour of this capability changes.

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions ships in the separate `review-history`
capability — now for the per-performer, per-community, per-company
**and installation-wide** scopes — and is therefore no longer deferred
wholesale. Everything below still MUST NOT be introduced, and none of it
MUST be introduced by **this** capability, which still owns the write
flow only and whose own reads MUST stay byte-unchanged.
(Previously: the FR-008 row deferred **all** global review visibility —
any review query, route, page or use case unscoped across the
installation — which `review-history` now implements for `SYSTEM_ADMIN`
only.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (remaining half) | Global review visibility for `MANAGER` — any `ManagerCapability` / `User.managerCapabilities` / `VIEW_ALL_REVIEWS` mechanism; any `MANAGER` review visibility rule. Per-element history — any query, route, page or use case returning one inspectable element's past reviews. Any cross-session query in **this** capability's own routes, use cases or repository reads, including any company-scoped or installation-wide one |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any code path transitioning a session to `signed`; any document, PDF or export generation |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

#### Scenario: The one installation-wide read lives in review-history, not here
- GIVEN this capability's own routes, pages, use cases and repository reads after this change
- WHEN they are inspected
- THEN none MUST contain a review read unscoped across the installation — the single such read MUST belong to `review-history` and MUST be reachable only by a `SYSTEM_ADMIN`

#### Scenario: No MANAGER capability mechanism exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST be found, and `MANAGER` MUST hold no review visibility

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
