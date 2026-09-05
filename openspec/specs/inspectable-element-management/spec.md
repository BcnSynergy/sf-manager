# Inspectable Element Management

## Purpose

Admin-only CRUD over `InspectableElement` records, each scoped to a
parent `Community`: create, list-by-community, update, soft-delete.
Entity shape is `id` (UUIDv7), `communityId`, `elementType`
(`EXTINGUISHER` only in v1), `name`, `description?`, `location`,
`serialNumber?`, `installedAt`, `code` (10 characters, `NOT NULL
UNIQUE`, immutable), `deletedAt` — no `createdAt`/`updatedAt`,
`imageUrl`, `active`, `lastHydrostaticTestAt`, or
`hydrostaticTestCount` (all deferred, proposal Out of Scope). No
uniqueness on `name`/`location`; `serialNumber` is optional,
non-unique, and informational only. Soft-delete is the sole lifecycle
action — no separate `active`/decommission state. No pagination,
filtering, or audit logging. Access control (who may call these
endpoints) is owned by the `authorization` spec.

## Requirements

### Requirement: Create Inspectable Element Under a Community

The system MUST allow an authenticated `SYSTEM_ADMIN` to create an
`InspectableElement` under a given `communityId`, providing
`elementType`, `name`, `location`, and `installedAt`, with optional
`description` and `serialNumber`. The system MUST verify the parent
community exists and is not soft-deleted before creating the element;
otherwise the request MUST be rejected with 404 `code:
COMMUNITY_NOT_FOUND` and no element row created. The system MUST
generate the `id` (UUIDv7), generate the `code` (see *Element Code*),
and initialize `deletedAt` to `null`.

`code` MUST NOT be part of the create request contract: it MUST NOT be
declared, documented or accepted as a valid input field. WHEN a create
request body nevertheless carries a `code` key, the request MUST NOT be
rejected — the element MUST still be created with the
application-generated `code`, and the success response MUST additionally
carry a `warning` payload reporting that the supplied value was
discarded and a `code` was generated. That warning MUST be a coded
object with `code: SUPPLIED_CODE_IGNORED` (following the existing
`warning?` response convention), MUST be informational only — never a
4xx validation error — and MUST be **absent** from the response when no
`code` key was supplied, never `null` and never `false`.

#### Scenario: Admin creates an element under an existing community
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and community C is active
- WHEN they submit a valid `elementType`, `name`, `location`, and `installedAt` under C
- THEN the response MUST be 2xx and MUST include the generated `id` and the generated `code`
- AND the response MUST NOT include a `warning` field

#### Scenario: The create contract does not accept a code
- GIVEN the create request schema and its published documentation after this change
- WHEN they are inspected
- THEN `code` MUST NOT appear as an accepted or documented create input field

#### Scenario: A supplied code is ignored and warned about
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and community C is active
- WHEN they submit a valid create payload whose raw body also carries a `code` key
- THEN the response MUST be 2xx and the stored element's `code` MUST be the application-generated one, not the submitted value
- AND the response MUST include a `warning` whose code is `SUPPLIED_CODE_IGNORED`

#### Scenario: A supplied code is never a validation failure
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and community C is active
- WHEN they submit an otherwise valid create payload carrying a `code` key
- THEN the response MUST NOT be a 4xx validation error and the element MUST have been created

#### Scenario: Missing required field rejected
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and community C is active
- WHEN they submit a request missing `elementType`, `name`, `location`, or `installedAt`
- THEN the response MUST be a 4xx validation error and no element MUST be created

#### Scenario: Non-existent community rejected
- GIVEN a `communityId` that does not correspond to any community
- WHEN an admin attempts to create an element under it
- THEN the response MUST be 404 with `code: COMMUNITY_NOT_FOUND` and no element MUST be created

#### Scenario: Soft-deleted community rejected
- GIVEN a `communityId` that corresponds to a soft-deleted community
- WHEN an admin attempts to create an element under it
- THEN the response MUST be 404 with `code: COMMUNITY_NOT_FOUND` and no element MUST be created

### Requirement: List Elements By Community

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
non-soft-deleted `InspectableElement` records for a given
`communityId`, after verifying that community exists and is not
soft-deleted (otherwise 404 `code: COMMUNITY_NOT_FOUND`). An element
created under one community MUST NOT appear in another community's
list.

#### Scenario: Admin lists elements for an existing community
- GIVEN community C is active and has one or more elements
- WHEN a `SYSTEM_ADMIN` calls the list endpoint for C
- THEN the response MUST be 2xx with an array of C's active elements

#### Scenario: Elements are scoped strictly per community
- GIVEN element E was created under community A
- WHEN a `SYSTEM_ADMIN` lists elements for community B
- THEN E MUST NOT appear in B's list

#### Scenario: Soft-deleted elements excluded from the list
- GIVEN community C has a soft-deleted element alongside active ones
- WHEN a `SYSTEM_ADMIN` lists elements for C
- THEN the response MUST NOT include the soft-deleted element

#### Scenario: Non-existent or soft-deleted community rejected
- GIVEN a `communityId` that does not exist or is soft-deleted
- WHEN an admin attempts to list its elements
- THEN the response MUST be 404 with `code: COMMUNITY_NOT_FOUND`

### Requirement: Update Inspectable Element

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing element's `name`, `description`, `location`, `serialNumber`,
and/or `installedAt` by `communityId` and element id together.
`elementType`, `communityId` and `code` are NOT updatable — an element
never moves between communities, never changes type, and never changes
its `code` in this slice. The system MUST verify the parent community
exists and is not soft-deleted (otherwise 404 `code:
COMMUNITY_NOT_FOUND`), and that the element exists, is not
soft-deleted, and belongs to that exact `communityId` (otherwise 404
`code: INSPECTABLE_ELEMENT_NOT_FOUND`) — the community id in the path
is enforced, not decorative.

#### Scenario: Admin updates an element's fields
- GIVEN community C is active and has an active element E
- WHEN a `SYSTEM_ADMIN` submits updated fields for E under C
- THEN the response MUST be 2xx and E's fields MUST be updated

#### Scenario: Code is not updatable
- GIVEN community C is active and has an active element E with `code` X
- WHEN a `SYSTEM_ADMIN` submits an update for E under C whose payload includes a different `code`
- THEN E's stored `code` MUST still be X

#### Scenario: Update targets a non-existent element id
- GIVEN an element id that does not correspond to any element
- WHEN an admin attempts to update it under an existing community
- THEN the response MUST be 404 with `code: INSPECTABLE_ELEMENT_NOT_FOUND`

#### Scenario: Update targets a soft-deleted element
- GIVEN element E under community C is soft-deleted
- WHEN an admin attempts to update E under C
- THEN the response MUST be 404 with `code: INSPECTABLE_ELEMENT_NOT_FOUND`

#### Scenario: Update targets an element belonging to a different community
- GIVEN element E was created under community A
- WHEN an admin attempts to update E using community B's id in the path
- THEN the response MUST be 404 with `code: INSPECTABLE_ELEMENT_NOT_FOUND`

### Requirement: Soft-Delete Inspectable Element

The system MUST allow an authenticated `SYSTEM_ADMIN` to soft-delete
an element via `deletedAt`, subject to the same community-and-element
guard chain as Update: a non-existent or soft-deleted parent community
returns 404 `code: COMMUNITY_NOT_FOUND`; a non-existent, soft-deleted,
or wrong-community element id returns 404 `code:
INSPECTABLE_ELEMENT_NOT_FOUND`.

#### Scenario: Admin soft-deletes an element
- GIVEN community C is active and has an active element E
- WHEN a `SYSTEM_ADMIN` soft-deletes E under C
- THEN the response MUST be 2xx and E's `deletedAt` MUST be set

#### Scenario: Delete targets an element that is missing, soft-deleted, or in a different community
- GIVEN an element id that either does not exist, is already soft-deleted, or belongs to a different community than the one in the path
- WHEN an admin attempts to soft-delete it
- THEN the response MUST be 404 with `code: INSPECTABLE_ELEMENT_NOT_FOUND`

### Requirement: No Uniqueness Constraints on Name, Location, or Serial Number

The system MUST NOT enforce uniqueness on `name`, `location`, or
`serialNumber` within a community or across communities.
`serialNumber` MUST be usable purely as informational free text, never
as a lookup key.

#### Scenario: Two elements share the same name and location
- GIVEN community C has an active element with `name` "Extintor pasillo" and `location` "Planta baja"
- WHEN a `SYSTEM_ADMIN` creates a second element under C with the identical `name` and `location`
- THEN the response MUST be 2xx and both elements MUST coexist

#### Scenario: serialNumber may be omitted or duplicated
- GIVEN one active element under community C already has `serialNumber` "SN-001"
- WHEN a `SYSTEM_ADMIN` creates or updates another element under C with `serialNumber` "SN-001" or with no `serialNumber` at all
- THEN the response MUST be 2xx and no uniqueness error MUST occur

### Requirement: Element Code

Every `InspectableElement` MUST carry a `code`: an application-generated
public identifier of exactly 10 characters, drawn only from an alphabet
that excludes the visually ambiguous characters `0`, `O`, `1`, `I` and
`L`. A `code` MUST be unique across the entire installation — globally,
not per community — and MUST NOT be derived from the element's `id`.
The persisted column MUST be `NOT NULL` and `UNIQUE`.

#### Scenario: A created element carries a well-formed code
- GIVEN a `SYSTEM_ADMIN` creates an element under an active community
- WHEN the creation succeeds
- THEN the element MUST have a `code` of exactly 10 characters
- AND every character MUST belong to the unambiguous alphabet

#### Scenario: Generated codes never contain ambiguous characters
- GIVEN a large sample of generated codes
- WHEN each code is inspected
- THEN no code MUST contain `0`, `O`, `1`, `I` or `L`

#### Scenario: Codes are globally unique across communities
- GIVEN elements exist under two different communities
- WHEN their codes are compared
- THEN no two elements MUST share the same `code`

#### Scenario: Code is not derived from the element id
- GIVEN an element with a generated `id` and `code`
- WHEN the two values are compared
- THEN the `code` MUST NOT be the `id`, a substring of it, or a deterministic transformation of it

### Requirement: Code Collisions Resolved Deterministically

Uniqueness MUST be enforced by the persistence layer's unique
constraint, not by reading existing codes before writing. When a
generated `code` collides with an existing one, creation MUST retry
with a newly generated `code`, up to a bounded number of attempts, and
MUST succeed if any attempt yields a free code. Exhausting the bound
MUST surface a deterministic, identifiable failure with no element row
created — never a silently duplicated code and never an unhandled
error on the first collision.

#### Scenario: A collision on insert is retried and resolved
- GIVEN code generation is forced to produce a code that already exists, then a free one
- WHEN a `SYSTEM_ADMIN` creates an element
- THEN the response MUST be 2xx and the stored element MUST carry the free code

#### Scenario: Exhausted retries fail deterministically
- GIVEN code generation is forced to always produce an already-existing code
- WHEN a `SYSTEM_ADMIN` creates an element
- THEN the request MUST fail with a deterministic, identifiable error
- AND no element row MUST be created

#### Scenario: Uniqueness is not established by a pre-read
- GIVEN the element creation path
- WHEN its persistence interaction is inspected
- THEN uniqueness MUST NOT depend on reading existing codes before the write; the database constraint MUST be the authority

### Requirement: Element Code Is Immutable

A `code` MUST be assigned once, at element registration, and never
change afterwards. It MUST NOT be regenerated, reassigned, or accepted
as an updatable field. An update request carrying a `code` MUST leave
the stored value untouched. Soft-deleting an element MUST NOT alter or
release its `code`. A lost or damaged label MUST be answered by
reprinting the same `code`.

#### Scenario: An update request carrying a code does not change it
- GIVEN active element E has stored `code` X
- WHEN a `SYSTEM_ADMIN` submits an update for E whose payload includes a different `code`
- THEN E's stored `code` MUST still be X after the request

#### Scenario: No regeneration or reassignment operation exists
- GIVEN the application's API surface and use cases after this change
- WHEN they are inspected
- THEN none MUST regenerate, reissue or reassign an existing element's `code`

#### Scenario: Soft-delete leaves the code intact
- GIVEN active element E has stored `code` X
- WHEN a `SYSTEM_ADMIN` soft-deletes E
- THEN E's stored `code` MUST still be X

#### Scenario: Reprinting yields the same code
- GIVEN element E has been printed once
- WHEN E is printed again at any later time
- THEN the printed `code` MUST be identical to the one printed before

### Requirement: Pre-Existing Elements Are Backfilled With Codes

The schema change MUST assign a valid, unique `code` to **every**
`InspectableElement` row that existed before it, at deploy time. The
change MUST NOT leave a permanent nullable window, MUST NOT generate
codes lazily on first read or first print, and MUST end with the column
`NOT NULL` and `UNIQUE` and its unique index present in the final
schema. The migration MUST be safe to run against a database holding
representative existing rows, and MUST also succeed against an empty
one.

#### Scenario: Every pre-existing row ends with a valid unique code
- GIVEN a database holding several `InspectableElement` rows created before this change
- WHEN the migration has run
- THEN every one of those rows MUST have a 10-character `code` over the unambiguous alphabet
- AND no two rows MUST share a `code`

#### Scenario: No row is left without a code
- GIVEN the schema after the migration
- WHEN the `code` column is inspected
- THEN it MUST be `NOT NULL` and MUST carry a unique constraint, and no row MUST hold a null `code`

#### Scenario: The unique index survives the migration
- GIVEN the migrated database
- WHEN its indexes and constraints are inspected
- THEN the unique index on `code` MUST be present

#### Scenario: Migration succeeds against an empty database
- GIVEN a database with no `InspectableElement` rows
- WHEN the migration runs
- THEN it MUST complete successfully and produce the same final schema

#### Scenario: No lazy generation path exists
- GIVEN any element that existed before the change
- WHEN it is read immediately after deploy, before any print
- THEN it MUST already carry its `code`, and no read or print path MUST generate one

### Requirement: Element Code Exposed on Element Responses

Every response that returns an `InspectableElement` MUST include its
`code`. No new endpoint MUST be introduced to obtain it — the existing
list-by-community response is the source.

#### Scenario: Listing a community's elements returns each code
- GIVEN community C has active elements
- WHEN a `SYSTEM_ADMIN` lists C's elements
- THEN every returned element MUST include its `code`

#### Scenario: No new endpoint is added for codes
- GIVEN the API surface before and after this change
- WHEN the routes are compared
- THEN no route MUST have been added

### Requirement: Element Lifecycle Filtering Unchanged

This change MUST NOT introduce an `active` field or column on
`InspectableElement`. Excluding an element from listing and printing
MUST continue to rely solely on `deletedAt`.

#### Scenario: No active field is introduced
- GIVEN the `InspectableElement` entity, schema and responses after this change
- WHEN they are inspected
- THEN no `active` field or column MUST exist
