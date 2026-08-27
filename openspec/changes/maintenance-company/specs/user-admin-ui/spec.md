# Delta for User Admin UI

## ADDED Requirements

### Requirement: Role-Conditional Company Selector

The create and edit user forms MUST show a maintenance-company
`<select>`, populated from `GET /maintenance-companies`, only when
the currently selected role is `MAINTENANCE_COMPANY_MANAGER` or
`MAINTENANCE_TECHNICIAN`. The field MUST be required client-side
whenever shown, and MUST disappear (and stop being submitted) the
moment the role changes away from those two values. The UI's
show/require behavior is a UX convenience only — the server remains
the sole source of truth for the invariant (per proposal, the client
performs no company-liveness check and no client-side validation
authority).

#### Scenario: Selector appears for a maintenance role
- GIVEN the `SYSTEM_ADMIN` is on the create or edit user form
- WHEN they select role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN`
- THEN the company selector MUST appear and become required

#### Scenario: Selector disappears when role changes away
- GIVEN the company selector is shown because a maintenance role is selected
- WHEN the `SYSTEM_ADMIN` changes the role to `SYSTEM_ADMIN`, `MANAGER`, or `COMMUNITY_REPRESENTATIVE`
- THEN the selector MUST disappear and MUST NOT be submitted with the request

#### Scenario: Selector is populated from live companies
- GIVEN one or more active maintenance companies exist
- WHEN the company selector is shown
- THEN it MUST offer those companies as options, sourced from `GET /maintenance-companies`

### Requirement: Maintenance Company Rendered By Name

Every surface that displays a user's maintenance company (users list,
user detail, edit form prefill) MUST render the company's `name`,
never the raw `maintenanceCompanyId` UUID.

#### Scenario: Users list shows the company name, not the id
- GIVEN a user with a set `maintenanceCompanyId` is shown in the users list
- WHEN that user's row is rendered
- THEN it MUST display the associated company's `name`
- AND it MUST NOT display the raw `maintenanceCompanyId` value anywhere in that row

#### Scenario: Edit form prefill shows the company name in the selector
- GIVEN a maintenance-role user with a set `maintenanceCompanyId` is opened for editing
- WHEN the edit form is shown
- THEN the company selector MUST be preselected to that company, displayed by its `name`

## MODIFIED Requirements

### Requirement: List Active Users

The system MUST display active users (`id`, `email`, `role`, and —
when applicable — the associated maintenance company's `name`) to a
`SYSTEM_ADMIN`, with distinct loading, empty, and error states.
Deactivated users MUST NOT appear in the list.
(Previously: displayed only `id`, `email`, and `role`.)

#### Scenario: Admin views a populated list
- GIVEN one or more active users exist
- WHEN the `SYSTEM_ADMIN` opens the users list
- THEN each active user's `id`, `email`, and `role` MUST be shown

#### Scenario: Empty state
- GIVEN no active users exist
- WHEN the `SYSTEM_ADMIN` opens the users list
- THEN a distinct empty-state message MUST be shown, not a blank screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens the users list
- THEN a distinct error state MUST be shown, not a blank or loading screen

#### Scenario: Deactivated users never shown
- GIVEN a deactivated user exists alongside active users
- WHEN the `SYSTEM_ADMIN` opens the users list
- THEN the deactivated user MUST NOT appear

#### Scenario: Maintenance-role user's company name is shown in the list
- GIVEN an active user has role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` with a set `maintenanceCompanyId`
- WHEN the `SYSTEM_ADMIN` opens the users list
- THEN that user's row MUST show the associated company's `name`

### Requirement: Cause-Specific Error Messaging

The system MUST show a distinct, cause-specific message for each of:
demoting or deactivating the last `SYSTEM_ADMIN`, a genuine
concurrency conflict on edit or deactivate, and each
maintenance-company-related cause (`MAINTENANCE_COMPANY_REQUIRED`,
`MAINTENANCE_COMPANY_NOT_ALLOWED`, `MAINTENANCE_COMPANY_NOT_FOUND`).
All of these messages MUST be distinguishable from each other and
from the duplicate-email message. A concurrency conflict MUST NOT
trigger an automatic retry.
(Previously: covered only last-admin lockout, concurrency conflict,
and duplicate email.)

#### Scenario: Last-admin lockout on edit shown distinctly
- GIVEN exactly one active `SYSTEM_ADMIN` exists
- WHEN a `SYSTEM_ADMIN` attempts to change that user's role away from `SYSTEM_ADMIN`
- THEN a specific last-admin message MUST be shown, distinguishable from the duplicate-email and concurrency-conflict messages

#### Scenario: Last-admin lockout on deactivate shown distinctly
- GIVEN exactly one active `SYSTEM_ADMIN` exists
- WHEN a `SYSTEM_ADMIN` attempts to deactivate that user
- THEN a specific last-admin message MUST be shown, distinguishable from the duplicate-email and concurrency-conflict messages

#### Scenario: Concurrency conflict shown without automatic retry
- GIVEN an edit or deactivate request fails due to a genuine concurrent-write conflict (not a business-rule rejection)
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a "please try again" message MUST be shown
- AND no automatic retry MUST occur

#### Scenario: Missing-company cause shown distinctly
- GIVEN a create or edit request fails with `code: MAINTENANCE_COMPANY_REQUIRED`
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a specific "company required for this role" message MUST be shown, distinguishable from the other maintenance-company causes

#### Scenario: Company-not-allowed cause shown distinctly
- GIVEN a create or edit request fails with `code: MAINTENANCE_COMPANY_NOT_ALLOWED`
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a specific "company not applicable to this role" message MUST be shown, distinguishable from the other maintenance-company causes

#### Scenario: Company-not-found cause shown distinctly
- GIVEN a create or edit request fails with `code: MAINTENANCE_COMPANY_NOT_FOUND`
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a specific "selected company no longer exists" message MUST be shown, distinguishable from the other maintenance-company causes

### Requirement: Internationalization Coverage

The users admin UI MUST contain zero hardcoded UI strings. All
user-facing text — including the company selector and all
maintenance-company-related error messages — MUST be sourced from
`users.*`/`maintenanceCompany.*`/`common.*` translation keys with
real (non-placeholder) translations present in `en`, `es`, and `ca`.
(Previously: scoped to `users.*`/`common.*` only.)

#### Scenario: All visible text is translated in every configured locale
- GIVEN the users admin UI (list, create, edit, deactivate, company selector) is rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback
