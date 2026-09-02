# Community Management

## Purpose

Admin-only CRUD over `Community` records: create, list, update,
soft-delete. Entity shape is `id`, `name`, `address`, `locale`,
`deletedAt` — no `contactInfo` field. `locale` is stored verbatim;
this slice implements no i18n rendering behavior for it. No
pagination, no filtering, no audit logging (proposal Out of Scope).
Assignment behavior (representatives/technicians) is covered by the
`community-assignments` spec.

## Requirements

### Requirement: Create Community

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a
`Community` by providing `name`, `address`, and `locale`. The system
MUST generate the `id` (UUIDv7) and initialize `deletedAt` to `null`.

#### Scenario: Admin creates a community
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a valid `name`, `address`, and `locale`
- THEN the response MUST be 2xx and MUST include the generated `id`

#### Scenario: Missing required field rejected
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a request missing `name`, `address`, or `locale`
- THEN the response MUST be a 4xx validation error and no community MUST be created

### Requirement: List Communities

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
communities. Soft-deleted communities MUST be excluded by default
(ADR-010); no pagination is required in this slice.

#### Scenario: Admin lists communities
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they call the list-communities endpoint
- THEN the response MUST be 2xx with an array of active communities

#### Scenario: Soft-deleted communities excluded from the list
- GIVEN a soft-deleted community exists alongside active ones
- WHEN an admin calls the list-communities endpoint
- THEN the response MUST NOT include the soft-deleted community

### Requirement: Update Community

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing community's `name`, `address`, and/or `locale` by community
id.

#### Scenario: Admin updates a community
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target community id exists
- WHEN they submit updated `name`, `address`, and/or `locale` for that id
- THEN the response MUST be 2xx and the community's fields MUST be updated

#### Scenario: Update targets a non-existent community
- GIVEN a community id that does not correspond to an existing community
- WHEN an admin attempts to update it
- THEN the response MUST be a 4xx error (not found)

### Requirement: Soft-Delete Community

The system MUST allow an authenticated `SYSTEM_ADMIN` to soft-delete
a community via `deletedAt` (ADR-010: no row deletion, default
excluded from `findAll`/`findById` like `users`), EXCEPT the system
MUST refuse the soft-delete with 409 `code:
COMMUNITY_HAS_ACTIVE_ELEMENTS` when at least one non-soft-deleted
`InspectableElement` has a `communityId` referencing that community.
Soft-deleted elements MUST NOT count toward this block. A refused
delete attempt MUST NOT modify any element record, MUST NOT set the
community's `deletedAt`, and MUST NOT perform the
representative-deactivation side effect below. When the soft-delete
succeeds, it MUST conditionally deactivate that community's active
representative assignment (see `community-assignments`, Requirement:
Representative Deactivation on Community Soft-Delete) and MUST NOT
perform any operation on that community's technician assignments.

(Previously: soft-delete had no guard against attached inspectable
elements — it always proceeded to set `deletedAt` and run the
representative-deactivation side effect once permission and existence
checks passed.)

#### Scenario: Admin soft-deletes a community with no active elements
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`, a target active community exists, and it has no non-soft-deleted `InspectableElement` attached
- WHEN they soft-delete that community
- THEN the response MUST be 2xx and the community's `deletedAt` MUST be set

#### Scenario: Delete refused while an active element is attached
- GIVEN community C has at least one non-soft-deleted `InspectableElement` with `communityId` pointing at C
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete C
- THEN the response MUST be 409 with `code: COMMUNITY_HAS_ACTIVE_ELEMENTS`
- AND community C's `deletedAt` MUST remain `null`
- AND no `InspectableElement` record MUST be modified

#### Scenario: Soft-deleted elements do not block deletion
- GIVEN community C has only soft-deleted `InspectableElement` records attached, and no non-soft-deleted one
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete C
- THEN the response MUST be 2xx and C's `deletedAt` MUST be set

#### Scenario: Delete succeeds after soft-deleting every active element
- GIVEN community C was previously blocked from deletion by an active `InspectableElement`
- WHEN that element is soft-deleted and the admin retries the delete
- THEN the response MUST be 2xx and C's `deletedAt` MUST be set

#### Scenario: Soft-deleting a community deactivates its sole-active representative
- GIVEN community C has representative A currently active, A is not active as representative in any other community, and C has no non-soft-deleted `InspectableElement` attached
- WHEN an admin soft-deletes community C
- THEN A's representative assignment for C MUST become deactivated

#### Scenario: Soft-deleting a community leaves an active-elsewhere representative unchanged
- GIVEN community C has representative A currently active, A is also currently active as representative in another community C2, and C has no non-soft-deleted `InspectableElement` attached
- WHEN an admin soft-deletes community C
- THEN A's representative assignment for C MUST remain active and unchanged

#### Scenario: Soft-deleting a community has no effect on technician assignments
- GIVEN community C has one or more active or deactivated technician assignments and no non-soft-deleted `InspectableElement` attached
- WHEN an admin soft-deletes community C
- THEN no technician assignment for C MUST be created, modified, or deactivated as a result
