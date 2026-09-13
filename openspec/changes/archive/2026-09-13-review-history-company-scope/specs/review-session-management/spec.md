# Delta for Review Session Management

> **Purpose amendment (for archive):** the capability's Purpose lists
> "company-wide and global visibility" as out of scope here. After this
> change only **global** visibility remains out of scope everywhere;
> company-wide visibility ships, owned by `review-history`. What this
> capability gains is not a history surface but a **write-path fact**: a
> session records the maintenance company on whose behalf it was
> performed, frozen at performance time. This capability still owns the
> write flow only and still introduces no history read of its own.

## ADDED Requirements

### Requirement: A Session Records the Company on Whose Behalf It Was Performed

Every review session MUST carry the maintenance company of the user
performing it, recorded by the system **when the session is opened** and
never re-derived afterwards. The value MUST be a snapshot of the
performer's maintenance company at that moment, not a live reference to
it: once written it MUST be immutable for the life of the session, and a
later change to the performer's employment MUST NOT alter it.

*(Open question 1 in the proposal left "at creation vs. at completion"
to `sdd-design`. The working assumption — at creation — is stated here as
the requirement. If `sdd-design` chooses completion instead, this
requirement MUST be amended explicitly rather than diverged from.)*

The system MUST record it in the session's own creation path, not by
asking each caller to supply it: no route, client or use-case caller MUST
be able to set, override or omit it, and a session MUST NOT be created
carrying an attribution that differs from the performer's company at that
moment.

The value MAY be absent when the performing user has no maintenance
company, because that association is itself optional. An absent
attribution MUST be treated as "attributed to no company" by every
consumer — never as a wildcard (see `review-history`).

Pre-existing `completed` sessions MUST be attributed by a **one-time data
migration** using each performer's maintenance company at migration time.
This is explicitly best-effort: sessions whose performer had already
changed employer MUST be accepted as wrongly attributed, and the system
MUST NOT grow an employment-history mechanism, an attribution version
history or a correction path to repair them. No application code path
MUST write this column on a session whose status is not `draft`; the
backfill MUST occur as a migration only, and MUST NOT weaken *Completed
Sessions Are Immutable*.

#### Scenario: A newly opened session carries the performer's company
- GIVEN a `MAINTENANCE_TECHNICIAN` employed by company X opens a session for community C
- WHEN the created session is inspected
- THEN it MUST record X as the company on whose behalf it was performed

#### Scenario: A representative-opened session is attributed the same way
- GIVEN a `COMMUNITY_REPRESENTATIVE` opens a session through the identical flow
- WHEN the created session is inspected
- THEN it MUST record that user's maintenance company by the same rule, or no company if they have none

#### Scenario: The attribution never changes after the fact
- GIVEN a session opened by a technician employed by company X
- WHEN that technician is later reassigned to company Y, and the session is subsequently completed and read
- THEN the session MUST still record X, in `draft` and in `completed` alike

#### Scenario: No caller can supply or override the attribution
- GIVEN the request contracts, routes and use cases of the session write flow after this change
- WHEN they are inspected
- THEN none MUST accept a company identifier as input, and none MUST expose an operation that sets or changes a session's recorded performing company

#### Scenario: A performer with no company yields an absent attribution
- GIVEN a user with no maintenance company opens a session
- WHEN the created session is inspected
- THEN its recorded performing company MUST be absent, and the session MUST still be created successfully

#### Scenario: Pre-existing completed sessions are backfilled once
- GIVEN completed sessions that existed before this change
- WHEN the migration has been applied
- THEN each MUST carry its performer's maintenance company as of migration time, and no runtime code path MUST have written it

#### Scenario: Immutability of completed sessions is not weakened
- GIVEN a `completed` session after this change
- WHEN every application write path is enumerated
- THEN none MUST write, clear or change its recorded performing company, and every mutation attempt MUST still be refused by the domain layer

## MODIFIED Requirements

### Requirement: Adjacent Review Capabilities Are Not Introduced

Sessions existing makes history, scheduling and signing feel adjacent.
Reading completed sessions ships in the separate `review-history`
capability — now for the per-performer, per-community **and per-company**
scopes — and is therefore no longer deferred wholesale. Everything below
still MUST NOT be introduced, and none of it MUST be introduced by
**this** capability, which still owns the write flow only.
(Previously: the FR-008 row also deferred company-scoped review
visibility and any `MAINTENANCE_COMPANY_MANAGER` review visibility rule,
which `review-history` now implements.)

| Deferred to | Must not exist |
|---|---|
| FR-008 (remaining half) | Global review visibility — any review query, route, page or use case unscoped across the installation; any `ManagerCapability` / `User.managerCapabilities` / `VIEW_ALL_REVIEWS` mechanism; any `MANAGER` review visibility rule. Per-element history — any query, route, page or use case returning one inspectable element's past reviews. Any cross-session query in **this** capability's own routes, use cases or repository reads, including any company-scoped one |
| FR-009 | Scheduling service, due dates, overdue lists, cadence rules or reminders |
| FR-010 | Any code path transitioning a session to `signed`; any document, PDF or export generation |
| — | Photos, attachments, per-answer free-text notes, defect or incident records, corrective actions, notifications |

#### Scenario: No global review visibility exists
- GIVEN the routes, pages, use cases and repository queries after this change
- WHEN they are searched for review reads unscoped across the installation, and for `ManagerCapability`, `managerCapabilities` or `VIEW_ALL_REVIEWS`
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
