# Review Schedule Specification

## Purpose

A read-only, scoped list that tells a caller **where a review is needed**.
For every `(community, elementType)` pair in the caller's scope it returns
one combined status: `OVERDUE`, `NEVER_REVIEWED`, `UPCOMING` or
`UP_TO_DATE`. It is computed on every read from completed review sessions.
It stores nothing, sends nothing and adds no schema.

Terms used below:

| Term | Meaning |
|---|---|
| Pair | A community plus an element type, per *A Pair Exists Only While the Community Has a Live Element of the Type* |
| Quarter | A calendar quarter (Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec). Every date, quarter and deadline is judged on `Europe/Madrid` calendar dates, including "today" |
| Covering session | A session in status `completed` whose frozen template frequency is `QUARTERLY` or `ANNUAL` |
| Session date | The `Europe/Madrid` calendar date on which the session was completed |
| Current quarter / previous quarter | The quarter containing today / the one immediately before it |
| Annual deadline | The date of the pair's most recent `ANNUAL` covering session plus 12 months, inclusive: a review dated exactly on the anniversary is on time. An anniversary of 29 Feb in a non-leap year is 28 Feb |

Scenarios assume today is **15 November 2026** (current quarter Q4 2026,
previous quarter Q3 2026) unless stated. Dates and deadlines are calendar
dates.

## Requirements

### Requirement: A Pair Exists Only While the Community Has a Live Element of the Type

The schedule MUST contain one entry per `(community, elementType)` for which
the community has at least one element of that type that is active and not
deactivated or soft-deleted. Coverage MUST be computed per pair, never per
element. A soft-deleted community MUST contribute no pair.

#### Scenario: One live element creates one pair

- GIVEN a community with two active extinguishers
- WHEN the schedule is read in scope
- THEN exactly one entry exists for that community and `EXTINGUISHER`

#### Scenario: Only deactivated or deleted elements produce no pair

- GIVEN a community whose only extinguishers are deactivated or soft-deleted
- WHEN the schedule is read in scope
- THEN no entry exists for that community and `EXTINGUISHER`

#### Scenario: Soft-deleted community produces no pair

- GIVEN a soft-deleted community that has active elements
- WHEN a `SYSTEM_ADMIN` reads the schedule
- THEN no entry exists for that community

#### Scenario: Pairs are per element type

- GIVEN a community with a live extinguisher and a live element of another type
- WHEN the schedule is read in scope
- THEN two entries exist for that community, one per element type

### Requirement: What Covers a Quarter

A quarter MUST be covered for a pair only by a covering session of that pair
dated inside that quarter. A covering session whose frequency is `ANNUAL`
MUST cover the quarter in which it falls, as a `QUARTERLY` one does. Sessions
whose frequency is `MONTHLY` or `SEMIANNUAL`, and sessions in status `draft`,
MUST NOT cover any quarter and MUST NOT count as history. Coverage MUST NOT
depend on who performed the session. The frequency MUST be read from the
template the session was frozen against, so later template versions MUST NOT
reset coverage.

#### Scenario: QUARTERLY session covers its quarter

- GIVEN a completed `QUARTERLY` session for the pair dated 10 Oct 2026
- WHEN the schedule is read
- THEN Q4 2026 is covered for the pair

#### Scenario: ANNUAL session substitutes the QUARTERLY one

- GIVEN a completed `ANNUAL` session dated 10 Aug 2026 and no `QUARTERLY` session in Q3 2026
- WHEN the schedule is read
- THEN Q3 2026 is covered for the pair

#### Scenario: MONTHLY and SEMIANNUAL sessions never cover

- GIVEN a pair whose only completed sessions use `MONTHLY` or `SEMIANNUAL` templates, including one dated 10 Nov 2026
- WHEN the schedule is read
- THEN the pair is `NEVER_REVIEWED`

#### Scenario: A draft never covers

- GIVEN a pair with an open draft session on a `QUARTERLY` template and no completed covering session
- WHEN the schedule is read
- THEN the pair is `NEVER_REVIEWED`

#### Scenario: Quarter edges

- GIVEN completed `QUARTERLY` sessions dated 30 Sep 2026 12:00 and 1 Oct 2026 12:00
- WHEN coverage is evaluated
- THEN the first covers only Q3 2026 and the second covers only Q4 2026

#### Scenario: Quarter edges are judged in Europe/Madrid

- GIVEN a completed `QUARTERLY` session completed at 22:30 UTC on 30 Sep 2026 (00:30 on 1 Oct in Madrid) and another at 21:30 UTC on 30 Sep 2026 (23:30 on 30 Sep in Madrid)
- WHEN coverage is evaluated
- THEN the first covers Q4 2026 and the second covers Q3 2026
- AND a session completed at 23:30 UTC on 31 Dec 2026 (00:30 on 1 Jan in Madrid) covers Q1 2027

#### Scenario: Sessions by other users count

- GIVEN a covering session in the current quarter performed by a user other than the caller
- WHEN a technician assigned to the community reads the schedule
- THEN the current quarter is covered for the pair

#### Scenario: A replaced template version does not reset coverage

- GIVEN a covering session dated 10 Oct 2026 frozen against template version 1, and a newer active version 2
- WHEN the schedule is read
- THEN Q4 2026 is still covered

### Requirement: The Quarterly Obligation

A pair that has at least one covering session MUST be judged for the quarter
rules as follows.

| Condition | Quarterly result |
|---|---|
| The previous quarter is uncovered, **and** the pair has a covering session dated before the previous quarter, **and** the current quarter is not yet covered | `OVERDUE`; deadline is the last day of the previous quarter |
| Not overdue and the current quarter is uncovered | `UPCOMING`; deadline is the last day of the current quarter |
| Otherwise | satisfied |

Known history starts at the first covering session. Quarters before it
MUST NOT be judged, and quarters two or more back MUST NOT be judged at all.
Once the current quarter is covered, a missed previous quarter MUST no longer
be reported: the list shows actionable work only.
(Previously, per literal decision 4: a missed previous quarter stayed
`OVERDUE` for the whole current quarter. Refined by the product owner on
2026-10-05.)

#### Scenario: First session two quarters back, previous quarter missed

- GIVEN the only covering session is a `QUARTERLY` one in Q2 2026
- WHEN the schedule is read
- THEN the pair is `OVERDUE` for Q3 2026 with deadline 30 Sep 2026

#### Scenario: First session in the previous quarter

- GIVEN the only covering session is a `QUARTERLY` one in Q3 2026
- WHEN the schedule is read
- THEN Q3 2026 is covered and the pair is not `OVERDUE`
- AND the current quarter is uncovered, so the quarterly result is `UPCOMING` with deadline 31 Dec 2026

#### Scenario: First session in the current quarter

- GIVEN the only covering session is a `QUARTERLY` one in Q4 2026
- WHEN the schedule is read
- THEN the pair is not `OVERDUE`
- AND its status is `UPCOMING` because of the annual obligation, not the quarterly one

#### Scenario: Earlier gaps are not judged

- GIVEN covering sessions in Q1 2026 (an `ANNUAL` session dated 20 Mar 2026) and in Q3 2026, none in Q2 2026 and none in Q4 2026, and today is 15 Nov 2026
- WHEN the schedule is read
- THEN the missed Q2 2026 is not reported: the quarterly result is `UPCOMING` for Q4 2026 with deadline 31 Dec 2026, not `OVERDUE`
- AND the annual deadline (20 Mar 2027) is after the end of Q4 2026, so the annual obligation is satisfied and the pair's combined status is `UPCOMING`

#### Scenario: Missed previous quarter, current quarter still open

- GIVEN the first covering session is a `QUARTERLY` one in Q2 2026, none in Q3 2026 and none in Q4 2026
- WHEN the schedule is read
- THEN the pair is `OVERDUE` for Q3 2026

#### Scenario: Missed previous quarter clears once the current quarter is covered

- GIVEN the first covering session is a `QUARTERLY` one in Q2 2026, none in Q3 2026, and a `QUARTERLY` one in Q4 2026
- WHEN the schedule is read
- THEN the quarterly obligation is satisfied and no quarterly overdue is reported
- AND with no `ANNUAL` session on record, the pair's status is `UPCOMING` because of the annual obligation

#### Scenario: The previous quarter crosses a year boundary

- GIVEN today is 10 Jan 2027, a covering session in Q3 2026 and none in Q4 2026
- WHEN the schedule is read
- THEN the pair is `OVERDUE` for Q4 2026 with deadline 31 Dec 2026

### Requirement: The Annual Obligation

For a pair that has at least one covering session, the annual deadline MUST
be computed from the date of the most recent `ANNUAL` covering session only;
`QUARTERLY` sessions MUST NOT move it, and earlier `ANNUAL` sessions MUST be
ignored. The annual result MUST be:

| Condition | Annual result |
|---|---|
| The annual deadline is before today | `OVERDUE` with that deadline |
| The deadline is today or later but not after the last day of the current quarter | `UPCOMING` with that deadline |
| The deadline is after the last day of the current quarter | satisfied |
| No `ANNUAL` session exists | `UPCOMING` with the last day of the current quarter as deadline |

#### Scenario: Deadline already passed

- GIVEN an `ANNUAL` session dated 10 Oct 2025 and covered Q3 and Q4 2026
- WHEN the schedule is read
- THEN the pair is `OVERDUE` for the annual obligation with deadline 10 Oct 2026

#### Scenario: Deadline falls inside the current quarter

- GIVEN an `ANNUAL` session dated 1 Dec 2025 and covered Q3 and Q4 2026
- WHEN the schedule is read
- THEN the pair is `UPCOMING` for the annual obligation with deadline 1 Dec 2026

#### Scenario: Deadline later than the current quarter

- GIVEN an `ANNUAL` session dated 20 Mar 2026 and covered Q3 and Q4 2026
- WHEN the schedule is read
- THEN the pair is `UP_TO_DATE`

#### Scenario: Deadline exactly today is not overdue (inclusive)

- GIVEN an `ANNUAL` session dated 15 Nov 2025 and covered Q3 and Q4 2026
- WHEN the schedule is read today (15 Nov 2026)
- THEN the pair is `UPCOMING`, not `OVERDUE`, with deadline 15 Nov 2026
- AND read on 16 Nov 2026 it is `OVERDUE` with deadline 15 Nov 2026

#### Scenario: A 29 February anniversary falls on 28 February

- GIVEN an `ANNUAL` session dated 29 Feb 2024 and today is 28 Feb 2025
- WHEN the annual deadline is evaluated
- THEN the deadline is 28 Feb 2025 and the pair is not `OVERDUE` for the annual obligation
- AND read on 1 Mar 2025 the annual obligation is `OVERDUE`

#### Scenario: Deadline on the last day of the current quarter versus the day after

- GIVEN pair A with an `ANNUAL` session dated 31 Dec 2025 and pair B with one dated 1 Jan 2026, both covered Q3 and Q4 2026
- WHEN the schedule is read
- THEN pair A is `UPCOMING` and pair B is `UP_TO_DATE`

#### Scenario: Quarterly sessions and older annuals do not move the deadline

- GIVEN `ANNUAL` sessions dated 10 Oct 2024 and 20 Mar 2026, and a `QUARTERLY` session dated 5 Nov 2026
- WHEN the annual deadline is evaluated
- THEN it is 20 Mar 2027

#### Scenario: No annual on record

- GIVEN covering `QUARTERLY` sessions in Q3 and Q4 2026 and no `ANNUAL` session
- WHEN the schedule is read
- THEN the pair is `UPCOMING` with annual deadline 31 Dec 2026

#### Scenario: An element type with no ANNUAL template never reaches UP_TO_DATE

- GIVEN an element type that has a `QUARTERLY` template and no `ANNUAL` template, and a pair of that type with a covering `QUARTERLY` session in every quarter up to the current one
- WHEN the schedule is read in any quarter
- THEN the pair is `UPCOMING` for the annual obligation with the last day of the current quarter as deadline, and never `UP_TO_DATE`, because no `ANNUAL` session can ever exist for it
- AND this is an accepted consequence of the annual rule, not a defect: an `ANNUAL` template for that element type is what lets the pair reach `UP_TO_DATE`

### Requirement: NEVER_REVIEWED Is Exclusive and Makes No Overdue Claim

A pair with no covering session ever MUST have status `NEVER_REVIEWED`, with
no deadline, no driving obligation and no last covering session date. A pair with any covering
session MUST NOT have this status. This includes a pair whose element type
has no `QUARTERLY` or `ANNUAL` template at all.

#### Scenario: No covering session ever

- GIVEN a pair with live elements and no completed covering session
- WHEN the schedule is read
- THEN its status is `NEVER_REVIEWED`
- AND it carries no deadline and no last covering session date

#### Scenario: Element type without a usable template

- GIVEN a pair whose element type has only a `MONTHLY` template
- WHEN the schedule is read
- THEN its status is `NEVER_REVIEWED`

#### Scenario: Any covering session removes the status

- GIVEN a pair with one covering session dated 2025
- WHEN the schedule is read
- THEN its status is not `NEVER_REVIEWED`

### Requirement: One Combined Status per Pair

Each pair MUST have exactly one status, the worse of its quarterly and annual
results, ordered `OVERDUE` worse than `UPCOMING` worse than satisfied
(`UP_TO_DATE`). Each entry MUST carry the community name, the element type
and the status. Each entry except `NEVER_REVIEWED` MUST also carry the date of
the pair's most recent covering session, as a `Europe/Madrid` calendar date
(the session date), never as an instant. For `OVERDUE` and `UPCOMING` it MUST
also carry the driving obligation (quarterly or annual), with its quarter when
quarterly, and that obligation's deadline.
When both obligations have the same result, the one with the earlier deadline
MUST drive, and on equal deadlines the quarterly one MUST drive. An
`UP_TO_DATE` entry and a `NEVER_REVIEWED` entry carry no driving obligation
and no deadline.

#### Scenario: Quarterly overdue beats annual upcoming

- GIVEN a pair with its only covering session in Q2 2026 (annual upcoming, quarterly overdue)
- WHEN the schedule is read
- THEN the status is `OVERDUE`, the driver is quarterly for Q3 2026, the deadline is 30 Sep 2026
- AND the last covering session date is that Q2 session's date

#### Scenario: Annual overdue beats quarterly upcoming

- GIVEN an `ANNUAL` session dated 10 Oct 2025, Q3 2026 covered and Q4 2026 uncovered
- WHEN the schedule is read
- THEN the status is `OVERDUE`, the driver is annual, the deadline is 10 Oct 2026

#### Scenario: Both obligations overdue, the quarterly deadline is earlier

- GIVEN an `ANNUAL` session dated 20 Oct 2025 as the only covering session, none in Q3 2026 and none in Q4 2026
- WHEN the schedule is read
- THEN both obligations are `OVERDUE`: quarterly for Q3 2026 with deadline 30 Sep 2026, annual with deadline 20 Oct 2026
- AND the status is `OVERDUE`, the driver is quarterly for Q3 2026 and the deadline is 30 Sep 2026

#### Scenario: Both obligations overdue, the annual deadline is earlier

- GIVEN an `ANNUAL` session dated 10 Aug 2025 as the only covering session, none in Q3 2026 and none in Q4 2026
- WHEN the schedule is read
- THEN both obligations are `OVERDUE`: quarterly for Q3 2026 with deadline 30 Sep 2026, annual with deadline 10 Aug 2026
- AND the status is `OVERDUE`, the driver is annual and the deadline is 10 Aug 2026

#### Scenario: Equal statuses are driven by the earlier deadline

- GIVEN Q3 2026 covered, Q4 2026 uncovered, and an `ANNUAL` session dated 1 Dec 2025
- WHEN the schedule is read
- THEN the status is `UPCOMING` and the driver is annual with deadline 1 Dec 2026, earlier than the quarterly deadline 31 Dec 2026

#### Scenario: Equal statuses and equal deadlines are driven by the quarterly obligation

- GIVEN Q3 2026 covered, Q4 2026 uncovered, and an `ANNUAL` session dated 31 Dec 2025
- WHEN the schedule is read
- THEN the status is `UPCOMING` and the driver is quarterly with deadline 31 Dec 2026

#### Scenario: Up to date shows the last session only

- GIVEN a pair that is `UP_TO_DATE`
- WHEN its entry is read
- THEN it carries the last covering session date and no driving obligation and no deadline

#### Scenario: The last covering session date is a Madrid calendar date

- GIVEN a pair whose most recent covering session was completed at 22:30 UTC on 14 Nov 2026 (23:30 on 14 Nov in Madrid) and another pair whose most recent one was completed at 23:30 UTC on 14 Nov 2026 (00:30 on 15 Nov in Madrid)
- WHEN the schedule is read
- THEN the first entry carries 14 Nov 2026 and the second carries 15 Nov 2026, each as a calendar date and not as an instant

#### Scenario: Never reviewed carries nothing

- GIVEN a pair that is `NEVER_REVIEWED`
- WHEN its entry is read
- THEN it carries no driving obligation, no deadline and no last covering session date

### Requirement: Every Pair in Scope Is Listed, Worst First

The read MUST return every pair in the caller's scope, `UP_TO_DATE` pairs
included, ordered `OVERDUE`, then `NEVER_REVIEWED`, then `UPCOMING`, then
`UP_TO_DATE`. Inside one status group the order MUST be community name,
compared with the fixed-locale collation `Intl.Collator('es', { sensitivity:
'base' })` (case- and accent-insensitive, independent of the server's
default locale), then element type, then community id as the deterministic
tie-break. The ordering MUST be applied by the server, never by the client.
When the scope holds no pair the result MUST be an empty list with a
success response.

#### Scenario: Status order

- GIVEN in-scope pairs with statuses `UP_TO_DATE`, `UPCOMING`, `NEVER_REVIEWED` and `OVERDUE`
- WHEN the schedule is read
- THEN the entries come in the order `OVERDUE`, `NEVER_REVIEWED`, `UPCOMING`, `UP_TO_DATE`

#### Scenario: Nothing is hidden

- GIVEN four in-scope pairs, all `UP_TO_DATE`
- WHEN the schedule is read
- THEN all four are returned

#### Scenario: Order within a group

- GIVEN several in-scope `UPCOMING` pairs, including two communities with the same name and one community with two element types
- WHEN the schedule is read
- THEN they are ordered by community name, then element type, then community id

#### Scenario: Community names are collated, not compared by code point

- GIVEN three in-scope `UPCOMING` pairs whose communities are named "alpha", "Àgora" and "Zeta"
- WHEN the schedule is read
- THEN the entries come in the order "Àgora", "alpha", "Zeta"
- AND names that differ only by case or accent are ordered by element type, then community id

#### Scenario: Empty scope

- GIVEN a caller whose scope contains no pair
- WHEN they read the schedule
- THEN the response is a success with an empty list

### Requirement: Scope Follows the Caller's Role

| Caller | Scope |
|---|---|
| `SYSTEM_ADMIN` | every pair |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | every pair |
| `MANAGER` without it | none: success with an empty list, never `403` |
| `COMMUNITY_REPRESENTATIVE` | pairs of communities they are actively assigned to |
| `MAINTENANCE_TECHNICIAN` | pairs of communities they are actively assigned to, whether or not they performed any session there |
| `MAINTENANCE_COMPANY_MANAGER` | refused with `403` |

An unauthenticated caller MUST be refused with `401` before any role or scope
check. The capability MUST be resolved on every request. A capability that
cannot be affirmatively established because it is absent, or because the user
has been soft-deleted, MUST fail closed to an empty scope. A genuine
infrastructure fault while resolving it (a database connection error, for
example) MUST surface as an error response and MUST NOT be swallowed into an
empty list. A role or scope check MUST complete before any schedule data is
read. Which permission implements the
role gate is not part of this requirement.

#### Scenario: Admin and granted manager see everything

- GIVEN pairs in three communities
- WHEN a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS` each read the schedule
- THEN both receive all pairs in the same order

#### Scenario: Ungranted manager sees an empty list

- GIVEN pairs exist and a `MANAGER` holds no capability
- WHEN they read the schedule
- THEN the response is a success with an empty list

#### Scenario: Revoking the capability takes effect on the next read

- GIVEN a `MANAGER` who read the full schedule and whose capability is then revoked
- WHEN they read again
- THEN the list is empty

#### Scenario: A failure to resolve the capability is an error, not an empty list

- GIVEN a `MANAGER` and an infrastructure fault (for example a database connection error) while the capability is resolved
- WHEN they read the schedule
- THEN the response is an error response, not a success with an empty list, and no schedule data has been read

#### Scenario: A soft-deleted manager resolves to an empty scope

- GIVEN a `MANAGER` whose record holds `VIEW_ALL_REVIEWS` and who has since been soft-deleted
- WHEN a schedule read is made on their behalf
- THEN the scope is empty and no schedule data has been read

#### Scenario: Representative sees assigned communities only

- GIVEN a representative actively assigned to community A but not B
- WHEN they read the schedule
- THEN only A's pairs are returned

#### Scenario: Technician scope is assignment-based

- GIVEN technician T actively assigned to A who performed nothing there, and who performed a session in B without an active assignment
- WHEN T reads the schedule
- THEN A's pairs are returned and B's are not

#### Scenario: Deactivated assignment removes scope

- GIVEN a technician whose assignment to A has been deactivated
- WHEN they read the schedule
- THEN A's pairs are not returned

#### Scenario: Company manager is refused

- GIVEN a `MAINTENANCE_COMPANY_MANAGER`
- WHEN they read the schedule
- THEN the response is `403` and no data is returned

#### Scenario: Unauthenticated caller

- GIVEN no valid session
- WHEN the schedule is requested
- THEN the response is `401`

### Requirement: The Schedule Is Read-Only and Computed on Read

The schedule MUST be exposed through reads only, and a read MUST change no
stored data. Status MUST be derived at request time from completed sessions
and today's date, with no stored status, deadline or last-inspected value.
This slice MUST add no schema change, no migration, no reminder, email,
queue or scheduled job. The read MUST accept no filter, sort, pagination or
search parameter.

#### Scenario: Status changes with time alone

- GIVEN unchanged data in which the pair's only covering session is an `ANNUAL` one dated 10 Oct 2026, so the pair is `UP_TO_DATE` on 15 Nov 2026
- WHEN the schedule is read on 2 Jan 2027
- THEN the pair is `UPCOMING`, driven by the quarterly obligation for Q1 2027 with deadline 31 Mar 2027 (the annual deadline, 10 Oct 2027, is later), with no write having occurred

#### Scenario: A read writes nothing

- GIVEN the data before and after any number of schedule reads
- WHEN the two states are compared
- THEN they are identical

#### Scenario: No write route and no list controls

- GIVEN the routes and request contract of the schedule after this change
- WHEN they are inspected
- THEN no write route exists and no filter, sort, page or search parameter is accepted

#### Scenario: No schema, reminder or projection

- GIVEN the migration directory, schema and code after this change
- WHEN they are inspected
- THEN no table, column, enum, stored projection, reminder, email, queue or scheduled job was added by this slice

### Requirement: Community Names Are Resolved Without Per-Row Lookups

The number of data-access calls issued by the schedule reader MUST NOT grow
with the number of communities or pairs in scope. The count covers the
reader's pair read only; resolving the caller's scope through the community
and capability checkers is a separate step and is excluded from it.

#### Scenario: Constant lookup count

- GIVEN two reads of the reader's pair read, one over 2 communities and one over 20
- WHEN the Prisma client operations each read issues are counted by an integration test, through a Prisma client extension (`$extends` with a `query.$allOperations` hook) set up in the test
- THEN the counts are equal, and equal to the reader's fixed number of queries
