# Delta for User Admin UI

> **Purpose amendment (for archive):** this surface gains its first
> **privilege-granting** control: a role-conditional `VIEW_ALL_REVIEWS`
> toggle on the **edit** form only. It follows the shipped
> role-conditional-field pattern of the maintenance-company selector, with
> one deliberate asymmetry — the selector appears on both the create and
> edit forms, while the capability toggle appears on **edit only**: a
> `MANAGER` is always created inert, and granting is a deliberate second
> act by a `SYSTEM_ADMIN`. The server remains the sole authority; the
> toggle is an affordance over the invariants owned by `user-management`.

## ADDED Requirements

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

## MODIFIED Requirements

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
