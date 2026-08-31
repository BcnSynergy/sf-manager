# Maintenance Company Management

## Purpose

Admin-only CRUD over `MaintenanceCompany` records: create, list,
update, soft-delete. Entity shape is `id`, `name`, `taxId`,
`contactInfo`, `deletedAt` — `contactInfo` is a single free-text
field this slice (ADR-006: no structured `ContactInfo` entity yet).
`taxId` is free text, non-empty, trimmed, unique among active
(non-soft-deleted) companies. Deleting a company with active users
still attached is refused, not cascaded. No pagination, filtering,
or audit logging (proposal Out of Scope). Access control (who may
call these endpoints) is owned by the `authorization` spec.

## Requirements

### Requirement: Create Maintenance Company

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a
`MaintenanceCompany` by providing `name`, `taxId`, and `contactInfo`.
`taxId` MUST be non-empty after trimming. The system MUST generate
the `id` (UUIDv7) and initialize `deletedAt` to `null`.

#### Scenario: Admin creates a maintenance company
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a valid `name`, non-empty `taxId`, and `contactInfo`
- THEN the response MUST be 2xx and MUST include the generated `id`

#### Scenario: Blank taxId rejected
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a `taxId` that is empty or whitespace-only after trimming
- THEN the response MUST be a 4xx validation error and no company MUST be created

### Requirement: taxId Uniqueness Among Active Companies

The system MUST reject creating or updating a `MaintenanceCompany`
with a `taxId` already held by another non-soft-deleted company, via
a 409 carrying `code: TAX_ID_ALREADY_IN_USE`. A soft-deleted
company's `taxId` MUST become available for reuse by a new or
updated company (partial-unique-index semantics), because
re-onboarding the same real-world company after a removal must not
be permanently blocked.

#### Scenario: Duplicate active taxId rejected
- GIVEN an active company already exists with `taxId` "B12345678"
- WHEN an admin attempts to create or update another company to that same `taxId`
- THEN the response MUST be 409 with `code: TAX_ID_ALREADY_IN_USE`

#### Scenario: Soft-deleted company's taxId becomes reusable
- GIVEN a company was created with `taxId` "B12345678" and has since been soft-deleted
- WHEN a `SYSTEM_ADMIN` creates a new company with `taxId` "B12345678"
- THEN the response MUST be 2xx and the new company MUST be created

### Requirement: List Maintenance Companies

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
maintenance companies. Soft-deleted companies MUST be excluded by
default (ADR-010); no pagination is required in this slice.

#### Scenario: Admin lists maintenance companies
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they call the list-maintenance-companies endpoint
- THEN the response MUST be 2xx with an array of active companies

#### Scenario: Soft-deleted companies excluded from the list
- GIVEN a soft-deleted company exists alongside active ones
- WHEN an admin calls the list-maintenance-companies endpoint
- THEN the response MUST NOT include the soft-deleted company

### Requirement: Update Maintenance Company

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing company's `name`, `taxId`, and/or `contactInfo` by company
id, subject to the taxId Uniqueness requirement above.

#### Scenario: Admin updates a maintenance company
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target company id exists
- WHEN they submit updated `name`, `taxId`, and/or `contactInfo` for that id
- THEN the response MUST be 2xx and the company's fields MUST be updated

#### Scenario: Update targets a non-existent company
- GIVEN a company id that does not correspond to an existing company
- WHEN an admin attempts to update it
- THEN the response MUST be a 4xx error (not found)

### Requirement: Refuse Delete While Active Users Attached

The system MUST allow a `SYSTEM_ADMIN` to soft-delete a
`MaintenanceCompany` via `deletedAt`, EXCEPT the system MUST refuse
the soft-delete with 409 `code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`
when at least one non-soft-deleted `User` has a `maintenanceCompanyId`
referencing that company. Soft-deleted users MUST NOT count toward
this block. A refused delete attempt MUST NOT modify any user record.

#### Scenario: Delete refused while an active user is attached
- GIVEN company C has at least one non-soft-deleted user with `maintenanceCompanyId` pointing at C
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete C
- THEN the response MUST be 409 with `code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`
- AND company C's `deletedAt` MUST remain `null`

#### Scenario: Soft-deleted users do not block deletion
- GIVEN company C has only soft-deleted users pointing at it, and no non-soft-deleted user pointing at it
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete C
- THEN the response MUST be 2xx and C's `deletedAt` MUST be set

#### Scenario: Delete succeeds after reassigning or removing every active user
- GIVEN company C was previously blocked from deletion by an active user
- WHEN that user is reassigned to a different company or soft-deleted, and the admin retries the delete
- THEN the response MUST be 2xx and C's `deletedAt` MUST be set
