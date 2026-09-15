# User Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for managing users: route
gating, active-user list, create form, edit form, confirmed
deactivation, self-action guards, and the API-error →
localized-message contract. Validates the existing `users` API
against a real consumer (ADR-006 course-correction slice). No
pagination/filtering/search, bulk actions, avatars, self-service
password flows, restore of deactivated users, or audit-log UI
(proposal Out of Scope).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict the `/users` route section to authenticated
users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches `/users` MUST see an explicit "not
authorized" message, not a silent redirect. An unauthenticated
visitor who reaches `/users` MUST be redirected to `/login`.

#### Scenario: Admin reaches the users section
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to `/users`
- THEN the active-user list MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to `/users`
- THEN an explicit "not authorized" message MUST be shown
- AND they MUST NOT be silently redirected elsewhere

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to `/users`
- THEN they MUST be redirected to `/login`

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

### Requirement: Create User

The system MUST let a `SYSTEM_ADMIN` create a user by submitting
email, role, and an initial password. Client-side validation against
the shared `createUserSchema`/`passwordSchema` MUST run before any
network request. On success, the new user MUST appear in the list
without a manual page reload.

#### Scenario: Valid submission creates and lists the user
- GIVEN the `SYSTEM_ADMIN` submits a valid email, role, and a
  password meeting the strength policy
- WHEN the request succeeds
- THEN the new user MUST appear in the list without a manual reload

#### Scenario: Weak password rejected before any network call
- GIVEN the `SYSTEM_ADMIN` enters a password that fails
  `passwordSchema`
- WHEN they submit the create form
- THEN the form MUST show a validation error
- AND no network request MUST be sent

#### Scenario: Duplicate email shows a specific message
- GIVEN the submitted email already belongs to an active user
- WHEN the create request is rejected
- THEN a specific "email already in use" message MUST be shown, not
  a generic conflict message

### Requirement: Role-Conditional Manager Capability Toggle

The edit user form MUST show a `VIEW_ALL_REVIEWS` capability toggle
**only** when the currently selected role is `MANAGER`. The **create**
user form MUST NOT show it under any role: granting at creation MUST NOT
be possible from this surface.

The toggle MUST be prefilled from the edited user's already-known
`managerCapabilities`, taken from the data the users list already
provides — no additional per-user request MUST be made to populate it.

The same toggle MUST both **grant** and **revoke**: turning it on and
saving MUST grant the capability, turning it off and saving MUST revoke
it, and no separate grant or revoke control, screen or confirmation step
MUST exist.

It MUST disappear — and stop being submitted — the moment the role
changes away from `MANAGER`, and a value carried over from before that
role change MUST NOT be submitted. While the selected role **is**
`MANAGER`, the form MUST submit the capability field on every save,
including when the toggle is off, so that a revoke is never swallowed by
the partial-`PATCH` "absent means unchanged" contract.

The toggle's show/submit behaviour is a UX convenience only: the server
remains the sole source of truth for the capability invariants, and the
client MUST perform no authorization decision of its own.

#### Scenario: The toggle appears only for the MANAGER role
- GIVEN the `SYSTEM_ADMIN` is on the edit user form
- WHEN they select role `MANAGER`
- THEN the `VIEW_ALL_REVIEWS` toggle MUST appear

#### Scenario: The toggle disappears when the role changes away
- GIVEN the toggle is shown because `MANAGER` is selected, and it is switched on
- WHEN the `SYSTEM_ADMIN` changes the role to any other value
- THEN the toggle MUST disappear and MUST NOT be submitted with the request

#### Scenario: The create form never offers the toggle
- GIVEN the `SYSTEM_ADMIN` is on the create user form
- WHEN they select role `MANAGER`
- THEN no capability toggle MUST be rendered and no capability field MUST be submitted

#### Scenario: The toggle is prefilled from known user data
- GIVEN a `MANAGER` already holding `VIEW_ALL_REVIEWS` is opened for editing
- WHEN the edit form is shown
- THEN the toggle MUST be rendered switched on, and no additional per-user request MUST have been made to learn it

#### Scenario: Granting through the toggle persists across a reload
- GIVEN the `SYSTEM_ADMIN` switches the toggle on for a `MANAGER` and saves successfully
- WHEN they reopen that user's edit form after a page reload
- THEN the toggle MUST be rendered switched on

#### Scenario: Revoking through the same toggle is submitted, not omitted
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` is opened for editing and the toggle is switched off
- WHEN the form is saved
- THEN the request MUST include the capability field carrying an empty value, and after success reopening the form MUST show the toggle switched off

#### Scenario: A stale value is never carried across a role change
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` is opened for editing
- WHEN the `SYSTEM_ADMIN` changes the role to another role and saves
- THEN the submitted request MUST NOT carry a non-empty capability value, and the save MUST NOT be rejected for it

#### Scenario: A role round trip within one unsaved session resets the toggle, not just clears it
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` is opened for editing, so the toggle starts switched on
- WHEN the `SYSTEM_ADMIN` changes the role away from `MANAGER` and then back to `MANAGER`, all within the same unsaved form session, and saves
- THEN the toggle MUST be switched off at save time and the request MUST submit an empty capability value — silently revoking the existing grant is the chosen behaviour of this form session, not an oversight, because the toggle does not remember a value across an intermediate role change

### Requirement: Edit User

The system MUST let a `SYSTEM_ADMIN` edit an existing user's email, role,
and — when the selected role is `MANAGER` — their `VIEW_ALL_REVIEWS`
capability, per *Role-Conditional Manager Capability Toggle*. No password
field MUST be present. Fields MUST be prefilled from already-known user
data, including the capability. The role field MUST be disabled when the
`SYSTEM_ADMIN` is editing their own row.
(Previously: email and role only, with no capability control.)

#### Scenario: Admin edits another user's email and role
- GIVEN the `SYSTEM_ADMIN` opens the edit form for a user other than
  themselves
- WHEN the form is shown
- THEN it MUST be prefilled with that user's current email and role
- AND it MUST NOT present a password field

#### Scenario: Role field disabled on the admin's own row
- GIVEN the `SYSTEM_ADMIN` opens the edit form for their own user row
- WHEN the form is shown
- THEN the role field MUST be disabled

#### Scenario: A manager's edit form prefills the capability
- GIVEN the `SYSTEM_ADMIN` opens the edit form for a `MANAGER`
- WHEN the form is shown
- THEN it MUST be prefilled with that user's current email, role and capability state, from already-known user data

### Requirement: Deactivate User

The system MUST let a `SYSTEM_ADMIN` deactivate a user only after an
explicit confirmation step. The deactivate action MUST be
unavailable on the `SYSTEM_ADMIN`'s own row. On success, the user
MUST be removed from the list.

#### Scenario: Confirmed deactivation removes the user from the list
- GIVEN the `SYSTEM_ADMIN` triggers deactivation for another active
  user and confirms
- WHEN the deactivation succeeds
- THEN that user MUST no longer appear in the list

#### Scenario: Deactivation unavailable on the admin's own row
- GIVEN the `SYSTEM_ADMIN` is viewing their own row in the list
- WHEN they look for the deactivate action
- THEN it MUST be unavailable (hidden or disabled) on that row

### Requirement: Cause-Specific Error Messaging

The system MUST show a distinct, cause-specific message for each of:
demoting or deactivating the last `SYSTEM_ADMIN`, a genuine
concurrency conflict on edit or deactivate, each
maintenance-company-related cause (`MAINTENANCE_COMPANY_REQUIRED`,
`MAINTENANCE_COMPANY_NOT_ALLOWED`, `MAINTENANCE_COMPANY_NOT_FOUND`), and
the capability cause `MANAGER_CAPABILITIES_NOT_ALLOWED`. All of these
messages MUST be distinguishable from each other and from the
duplicate-email message. A concurrency conflict MUST NOT trigger an
automatic retry.
(Previously: covered last-admin lockout, concurrency conflict, duplicate
email and the three maintenance-company causes.)

#### Scenario: Last-admin lockout on edit shown distinctly
- GIVEN exactly one active `SYSTEM_ADMIN` exists
- WHEN a `SYSTEM_ADMIN` attempts to change that user's role away
  from `SYSTEM_ADMIN`
- THEN a specific last-admin message MUST be shown, distinguishable
  from the duplicate-email and concurrency-conflict messages

#### Scenario: Last-admin lockout on deactivate shown distinctly
- GIVEN exactly one active `SYSTEM_ADMIN` exists
- WHEN a `SYSTEM_ADMIN` attempts to deactivate that user
- THEN a specific last-admin message MUST be shown, distinguishable
  from the duplicate-email and concurrency-conflict messages

#### Scenario: Concurrency conflict shown without automatic retry
- GIVEN an edit or deactivate request fails due to a genuine
  concurrent-write conflict (not a business-rule rejection)
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

#### Scenario: Capability-not-allowed cause shown distinctly
- GIVEN an edit request fails with `code: MANAGER_CAPABILITIES_NOT_ALLOWED`
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a specific "this capability applies only to the manager role" message MUST be shown, distinguishable from every maintenance-company cause, the last-admin message, the duplicate-email message and the concurrency-conflict message

### Requirement: No Server-Message String Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation
MUST rely on a mechanism other than string-matching prose.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path that maps an API error to a UI message
- WHEN that code selects which message or behavior to apply
- THEN it MUST NOT do so by comparing against an English message
  string returned by the server

### Requirement: Internationalization Coverage

The users admin UI MUST contain zero hardcoded UI strings. All
user-facing text — including the company selector, all
maintenance-company-related error messages, the `VIEW_ALL_REVIEWS`
capability toggle's label and any helper text, and the
`MANAGER_CAPABILITIES_NOT_ALLOWED` message — MUST be sourced from
`users.*`/`maintenanceCompany.*`/`common.*` translation keys with
real (non-placeholder) translations present in `en`, `es`, and `ca`,
enforced by the existing locale parity test.
(Previously: scoped to `users.*`/`maintenanceCompany.*`/`common.*` keys
without the capability toggle or its error message.)

#### Scenario: All visible text is translated in every configured locale
- GIVEN the users admin UI (list, create, edit, deactivate, company selector, capability toggle) is rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a
  real value for that locale, not a placeholder or English fallback

#### Scenario: The capability name is never rendered raw
- GIVEN the capability toggle is rendered
- WHEN its label is inspected
- THEN it MUST show a localized label, not the raw `VIEW_ALL_REVIEWS` enum string
