# Inspectable Element Management

## Purpose

Admin-only CRUD over `InspectableElement` records, each scoped to a
parent `Community`: create, list-by-community, update, soft-delete.
Entity shape is `id` (UUIDv7), `communityId`, `elementType`
(`EXTINGUISHER` only in v1), `name`, `description?`, `location`,
`serialNumber?`, `installedAt`, `deletedAt` — no `createdAt`/
`updatedAt`, no `code`, `imageUrl`, `active`, `lastHydrostaticTestAt`,
or `hydrostaticTestCount` (all deferred, proposal Out of Scope). No
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
generate the `id` (UUIDv7) and initialize `deletedAt` to `null`.

#### Scenario: Admin creates an element under an existing community
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and community C is active
- WHEN they submit a valid `elementType`, `name`, `location`, and `installedAt` under C
- THEN the response MUST be 2xx and MUST include the generated `id`

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
existing element's `elementType`, `name`, `description`, `location`,
`serialNumber`, and/or `installedAt` by `communityId` and element id
together. The system MUST verify the parent community exists and is
not soft-deleted (otherwise 404 `code: COMMUNITY_NOT_FOUND`), and
that the element exists, is not soft-deleted, and belongs to that
exact `communityId` (otherwise 404 `code:
INSPECTABLE_ELEMENT_NOT_FOUND`) — the community id in the path is
enforced, not decorative.

#### Scenario: Admin updates an element's fields
- GIVEN community C is active and has an active element E
- WHEN a `SYSTEM_ADMIN` submits updated fields for E under C
- THEN the response MUST be 2xx and E's fields MUST be updated

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
