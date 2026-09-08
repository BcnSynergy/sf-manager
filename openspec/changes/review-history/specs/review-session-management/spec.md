# Delta for Review Session Management

> **Purpose amendment (for archive):** the capability's Purpose lists
> "review history and cross-session queries (FR-008)" as out of scope.
> After this change that is narrower: the **per-performer** and
> **per-community** completed-session reads now exist, and are owned by
> the new `review-history` capability — not by this one. This capability
> still owns the write flow only, and still introduces no history surface
> of its own. What remains out of scope here and everywhere:
> company-wide and global visibility, per-element history filtering,
> scheduling / due dates / reminders (FR-009), signing and export
> (FR-010), offline operation, camera scanning, photos, attachments,
> per-answer notes, defect records, and notifications.

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions now ships — in the separate `review-history`
capability, for the per-performer and per-community scopes only — and is
therefore no longer deferred wholesale. Everything below still MUST NOT
be introduced, and none of it MUST be introduced by **this** capability.
(Previously: the FR-008 row deferred **all** review history, including
the per-performer and per-community reads that `review-history` now
implements.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (remaining half) | Company-scoped or global review visibility — any review query, route, page or use case scoped by maintenance company, or unscoped across the installation; any `ManagerCapability` / `User.managerCapabilities` / `VIEW_ALL_REVIEWS` mechanism; any `MANAGER` or `MAINTENANCE_COMPANY_MANAGER` review visibility rule. Per-element history — any query, route, page or use case returning one inspectable element's past reviews. Any cross-session query in **this** capability's own routes, use cases or repository reads |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any code path transitioning a session to `signed`; any document, PDF or export generation |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

#### Scenario: No company-scoped or global review visibility exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for review reads scoped by maintenance company, or unscoped across the installation, and for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
- THEN none MUST be found, and `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` MUST hold no review visibility

#### Scenario: No per-element review history surface exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single inspectable element
- THEN none MUST be found

#### Scenario: This capability's own surface adds no cross-session query
- GIVEN the routes, use cases and repository reads belonging to the field write flow after this change
- WHEN they are inspected
- THEN each MUST still read at most the caller's own session, and every completed-session read MUST live in the `review-history` capability instead

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
