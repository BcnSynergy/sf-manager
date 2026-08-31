# Maintenance Company Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for managing maintenance
companies: route gating, active-company list, create/edit forms,
confirmed soft-delete, and the `ApiError` → localized-message
contract for the new error codes. No company detail page, no
technician roster view, no pagination/filtering/search, restore of
soft-deleted companies, or audit-log UI (proposal Out of Scope — this
slice stays minimal per ADR-006).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict all `/maintenance-companies` routes to
authenticated users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches any `/maintenance-companies` route
MUST see an explicit "not authorized" message, not a silent redirect.
An unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: Admin reaches the maintenance companies section
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to `/maintenance-companies`
- THEN the active-company list MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to any `/maintenance-companies` route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any `/maintenance-companies` route
- THEN they MUST be redirected to `/login`

### Requirement: List Active Maintenance Companies

The system MUST display active companies (`name`, `taxId`,
`contactInfo`) to a `SYSTEM_ADMIN`, with distinct loading, empty, and
error states. Soft-deleted companies MUST NOT appear.

#### Scenario: Admin views a populated list
- GIVEN one or more active companies exist
- WHEN the `SYSTEM_ADMIN` opens the maintenance companies list
- THEN each company's `name`, `taxId`, and `contactInfo` MUST be shown

#### Scenario: Empty state
- GIVEN no active companies exist
- WHEN the `SYSTEM_ADMIN` opens the maintenance companies list
- THEN a distinct empty-state message MUST be shown, not a blank screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens the maintenance companies list
- THEN a distinct error state MUST be shown, not a blank or loading screen

#### Scenario: Soft-deleted companies never shown
- GIVEN a soft-deleted company exists alongside active ones
- WHEN the `SYSTEM_ADMIN` opens the maintenance companies list
- THEN the soft-deleted company MUST NOT appear

### Requirement: Create Maintenance Company

The system MUST let a `SYSTEM_ADMIN` create a company by submitting
`name`, `taxId`, and `contactInfo`. Client-side validation against
`createMaintenanceCompanySchema` MUST run before any network request.
On success, the new company MUST appear in the list without a manual
page reload.

#### Scenario: Valid submission creates and lists the company
- GIVEN the `SYSTEM_ADMIN` submits a valid `name`, `taxId`, and `contactInfo`
- WHEN the request succeeds
- THEN the new company MUST appear in the list without a manual reload

#### Scenario: Invalid submission rejected before any network call
- GIVEN the `SYSTEM_ADMIN` submits a field that fails `createMaintenanceCompanySchema`
- WHEN they submit the create form
- THEN the form MUST show a validation error
- AND no network request MUST be sent

#### Scenario: Duplicate taxId shows a specific message
- GIVEN the submitted `taxId` already belongs to another active company
- WHEN the create request is rejected with `code: TAX_ID_ALREADY_IN_USE`
- THEN a specific "tax id already in use" message MUST be shown, not a generic conflict message

### Requirement: Edit Maintenance Company

The system MUST let a `SYSTEM_ADMIN` edit an existing company's
`name`, `taxId`, and/or `contactInfo`, validated with
`updateMaintenanceCompanySchema`, prefilled from already-known
company data. On success, the change MUST be visible on return to
the list.

#### Scenario: Admin edits a company's fields
- GIVEN the `SYSTEM_ADMIN` opens the edit form for an existing company
- WHEN the form is shown
- THEN it MUST be prefilled with that company's current `name`, `taxId`, and `contactInfo`

#### Scenario: Saved edit is visible without a manual reload
- GIVEN the `SYSTEM_ADMIN` submits a valid change to `name`, `taxId`, and/or `contactInfo`
- WHEN the request succeeds
- THEN the updated value(s) MUST be visible on the maintenance companies list

### Requirement: Soft-Delete Maintenance Company

The system MUST let a `SYSTEM_ADMIN` soft-delete a company only after
an explicit confirmation step. On success, the row MUST disappear
from the list without a manual page reload.

#### Scenario: Confirmed soft-delete removes the company from the list
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for an active company and confirms
- WHEN the soft-delete succeeds
- THEN that company MUST no longer appear in the list, without a manual reload

#### Scenario: Soft-delete requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for a company
- WHEN the confirmation step is shown
- THEN the deletion MUST NOT proceed until explicitly confirmed

### Requirement: Cause-Specific Delete-Block Messaging

The system MUST show a distinct message when a soft-delete is refused
because active users are still attached, read from
`code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`, telling the admin to
reassign or remove those users first. This message MUST be
distinguishable from the duplicate-taxId message.

#### Scenario: Delete-block shown distinctly
- GIVEN a `SYSTEM_ADMIN` attempts to soft-delete a company that still has an active user attached
- WHEN the request fails with 409 `code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`
- THEN a message MUST be shown instructing the admin to reassign or remove those users first
- AND it MUST be distinguishable from the duplicate-taxId message

### Requirement: No Server-Message String Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation
MUST rely only on `ApiError.status` and `.code`.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path in the maintenance company admin UI that maps an API error to a UI message
- WHEN that code selects which message or behavior to apply
- THEN it MUST NOT do so by comparing against an English message string returned by the server

### Requirement: Internationalization Coverage

The maintenance company admin UI MUST contain zero hardcoded UI
strings. All user-facing text MUST be sourced from
`maintenanceCompany.*`/`common.*` translation keys with real
(non-placeholder) translations present in `en`, `es`, and `ca`.

#### Scenario: All visible text is translated in every configured locale
- GIVEN the maintenance company admin UI (list, create, edit) is rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback
