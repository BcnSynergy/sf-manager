# Delta for Inspectable Element Management

> **Purpose amendment (for archive):** the capability's Purpose lists
> `active` among the deferred fields and states that "soft-delete is the
> sole lifecycle action — no separate `active`/decommission state". After
> this change an element carries an **active/decommissioned** state
> alongside `deletedAt`, settable by a `SYSTEM_ADMIN`; `imageUrl`,
> `lastHydrostaticTestAt` and `hydrostaticTestCount` remain deferred. The
> capability also gains **scope-constrained resolution of an element by
> `code`**, consumed by `review-session-management`.

## ADDED Requirements

### Requirement: Element Active State

Every `InspectableElement` MUST carry a state distinguishing an **active**
element from a **decommissioned** one. An element MUST be created active.
Decommissioning MUST be reversible and MUST NOT delete, soft-delete,
anonymize or alter any other field: the row, its `code`, and every review
record referencing it MUST survive intact.

A decommissioned element MUST NOT be expected in new review sessions —
it MUST NOT be resolvable by `code` within a session, and it MUST NOT be
required to be reviewed or explained for a session to complete.
Reactivating MUST restore both behaviours.

This state MUST be independent of `deletedAt`: decommissioned is not
deleted, and deleted is not merely decommissioned. Its exact persisted
shape is a `sdd-design` decision.

#### Scenario: A newly created element is active
- GIVEN a `SYSTEM_ADMIN` creates an element under an active community
- WHEN the creation succeeds
- THEN the element MUST be active

#### Scenario: Decommissioning preserves the row, the code and the history
- GIVEN active element E with `code` X, referenced by an existing review record
- WHEN a `SYSTEM_ADMIN` decommissions E
- THEN E MUST still exist with `code` X, its `deletedAt` MUST still be null, and the review record MUST still reference it

#### Scenario: Decommissioning is reversible
- GIVEN element E is decommissioned
- WHEN a `SYSTEM_ADMIN` reactivates it
- THEN E MUST be active again, with `code` X unchanged

#### Scenario: Decommissioned and deleted are distinct states
- GIVEN one decommissioned element and one soft-deleted element
- WHEN their states are inspected
- THEN the decommissioned one MUST NOT have `deletedAt` set, and neither state MUST be inferable from the other

#### Scenario: A decommissioned element is not expected in a new session
- GIVEN element E of community C and element type T is decommissioned, and all of C's active elements of type T are reviewed
- WHEN a user completes a session for C and T
- THEN completion MUST succeed and MUST NOT require a reason for E

### Requirement: Decommission and Reactivate an Element

The system MUST allow an authenticated `SYSTEM_ADMIN` to decommission and
reactivate an element, subject to the same community-and-element guard
chain as Update: a non-existent or soft-deleted parent community returns
404 `code: COMMUNITY_NOT_FOUND`; a non-existent, soft-deleted, or
wrong-community element id returns 404 `code:
INSPECTABLE_ELEMENT_NOT_FOUND`. Both operations MUST reuse the existing
`inspectableElement:update` permission. This slice MUST NOT add a bulk
decommission action, a decommission reason field, or a decommission
history.

#### Scenario: Admin decommissions and reactivates an element
- GIVEN community C is active and has an active element E
- WHEN a `SYSTEM_ADMIN` decommissions E and then reactivates it
- THEN both responses MUST be 2xx and E's state MUST follow each action

#### Scenario: Decommission targets a missing, soft-deleted or wrong-community element
- GIVEN an element id that does not exist, is soft-deleted, or belongs to a different community than the one in the path
- WHEN an admin attempts to decommission or reactivate it
- THEN the response MUST be 404 with `code: INSPECTABLE_ELEMENT_NOT_FOUND`

#### Scenario: Repeating the same transition is not an error path with side effects
- GIVEN element E is already decommissioned
- WHEN a `SYSTEM_ADMIN` decommissions it again
- THEN E MUST remain decommissioned with every other field unchanged

#### Scenario: No bulk action, reason or history ships
- GIVEN the API surface, schema and use cases after this change
- WHEN they are inspected
- THEN no bulk decommission operation, decommission reason field, or decommission history record MUST exist

### Requirement: Pre-Existing Elements Are Active After the Migration

The schema change MUST leave **every** `InspectableElement` row that
existed before it in the active state, deterministically, at deploy time.
No row MUST be left indeterminate, and no read path MUST infer or lazily
assign the state after deploy. The migration MUST be safe against a
database holding representative existing rows and MUST also succeed
against an empty one.

#### Scenario: Every pre-existing row is active
- GIVEN a database holding several `InspectableElement` rows created before this change
- WHEN the migration has run
- THEN every one of those rows MUST be active

#### Scenario: No row is left indeterminate
- GIVEN the schema after the migration
- WHEN the state column is inspected
- THEN no row MUST hold a value from which the element's active state cannot be determined

#### Scenario: Migration succeeds against an empty database
- GIVEN a database with no `InspectableElement` rows
- WHEN the migration runs
- THEN it MUST complete successfully and produce the same final schema

#### Scenario: No lazy state assignment path exists
- GIVEN any element that existed before the change
- WHEN it is read immediately after deploy
- THEN it MUST already carry its state, and no read path MUST assign one

### Requirement: Element State Exposed on Element Responses

Every response that returns an `InspectableElement` MUST include its
active/decommissioned state. Decommissioned elements MUST continue to
appear in a community's element list — they are not soft-deleted, and an
admin must be able to see and reactivate them. Soft-deleted elements MUST
still be excluded.

#### Scenario: Listing a community's elements returns each element's state
- GIVEN community C has active and decommissioned elements
- WHEN a `SYSTEM_ADMIN` lists C's elements
- THEN the response MUST include both, each carrying its state

#### Scenario: Soft-deleted elements remain excluded
- GIVEN community C has a soft-deleted element alongside active and decommissioned ones
- WHEN a `SYSTEM_ADMIN` lists C's elements
- THEN the soft-deleted element MUST NOT appear

### Requirement: Resolving an Element by Code Is Always Scope-Constrained

`code` is globally unique across the installation, so any lookup keyed on
`code` alone crosses every community boundary in the system by
construction. The system MUST NOT expose such a lookup: resolving an
element by `code` MUST be constrained by a community and an element type,
and MUST return an element only when that element is active and not
soft-deleted. A resolution that fails any of those constraints MUST be
rejected identically to a `code` that matches no element at all — see
`review-session-management` → *Rejected Codes Are Indistinguishable*.

#### Scenario: An in-scope code resolves
- GIVEN active element E of community C and element type T has `code` X
- WHEN a by-code resolution constrained to C and T is performed for X
- THEN it MUST return E

#### Scenario: An out-of-scope code does not resolve
- GIVEN element E has `code` X but belongs to another community, is of another element type, is decommissioned, or is soft-deleted
- WHEN a by-code resolution constrained to community C and element type T is performed for X
- THEN it MUST NOT return E

#### Scenario: No unconstrained by-code operation is exposed
- GIVEN the API surface and application use cases after this change
- WHEN they are inspected
- THEN none MUST accept a `code` alone and return an element without a community-and-element-type constraint

## REMOVED Requirements

### Requirement: Element Lifecycle Filtering Unchanged

(Reason: this requirement forbade an `active` field on
`InspectableElement` because, at the time, "keeps its history but stops
appearing in new reviews" had no referent — `ReviewSession` did not
exist. FR-007 creates that referent, and the requirement now contradicts
*Element Active State*.)

(Migration: replaced by *Element Active State*, *Decommission and
Reactivate an Element*, and *Pre-Existing Elements Are Active After the
Migration*. Listing and printing continue to exclude soft-deleted
elements via `deletedAt`; the new state additionally excludes
decommissioned elements from **review sessions** only, and any test
asserting that no `active` concept exists must be replaced by the
scenarios above.)
