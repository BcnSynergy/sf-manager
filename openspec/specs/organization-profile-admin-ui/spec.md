# Organization Profile Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated settings surface for the organization profile
(ADR-006's 2026-08-25 addendum: a domain slice ships its own minimal UI
in the same change, not as a later retrofit).

**One** page, combining view and edit. There is no list page, no create
page and no delete control, because there is nothing to list, create or
delete — this is settings about ourselves, not a managed catalog
parallel to `/maintenance-companies`.

Its one non-obvious job is the **not-completed-yet** state: the seeded
profile is blank, and an admin must be able to tell "nobody has entered
this yet" apart from "the page is loading" and "the request failed".

Out of scope: a logo control of any kind, an edit history or audit view,
a completeness gate on anything, and any surface for a non-`SYSTEM_ADMIN`
role. The navigation entry itself is owned by `app-navigation`; the API
contract is owned by `organization-profile-management`.

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict the organization-profile route to
authenticated users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches it MUST see the explicit "not authorized"
surface, not a silent redirect and not a blank page. An unauthenticated
visitor MUST be redirected to `/login`.

#### Scenario: Admin reaches the organization profile page
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to the organization profile route
- THEN the profile page MUST be shown

#### Scenario: Non-admin reaching the route by URL is denied explicitly
- GIVEN the caller is authenticated as any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
- WHEN they type the organization profile route directly into the address bar
- THEN the explicit "not authorized" surface MUST be shown, not a redirect and not a blank page

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to the organization profile route
- THEN they MUST be redirected to `/login`

### Requirement: One Combined View and Edit Page

The system MUST present the organization profile on a **single** page
that both shows the current values and allows editing them. It MUST
render exactly the six editable fields — `name`, `legalName`, `taxId`,
`address`, `phone`, `email` — prefilled from the loaded profile, and
MUST offer no create control, no delete control, no list view and no
row-per-record table.

#### Scenario: The page shows and edits in one place
- GIVEN a `SYSTEM_ADMIN` opens the organization profile page and the profile loads
- WHEN the page renders
- THEN the six fields MUST be shown prefilled with their current values and editable in place, with no separate "edit" page or route

#### Scenario: No create, delete or list affordance exists
- GIVEN the organization profile page rendered for a `SYSTEM_ADMIN`
- WHEN its controls and the application's routes are enumerated
- THEN no create control, no delete control and no list route MUST exist for the organization profile

### Requirement: The Not-Completed-Yet State Is Distinct From Loading and Error

The page MUST display an explicit "profile not completed yet"
indication whenever at least one of the six fields is blank, and MUST
NOT display it once all six hold a value. That indication MUST be
distinguishable from the loading state and from the error state — a
silently empty form MUST NOT be the only signal, since the admin could
not then tell "nothing entered yet" from "loading failed".

The page MUST render three mutually exclusive non-success states as
well as the success state: loading, load failure, and the loaded
profile (which may itself carry the not-completed indication). The
profile read never returns "not found", so the page MUST NOT implement
a "no profile exists" state.

#### Scenario: The blank seeded profile shows the not-completed state
- GIVEN the profile has never been edited and all six fields are blank
- WHEN a `SYSTEM_ADMIN` opens the page
- THEN an explicit not-completed-yet indication MUST be shown, visibly distinct from the loading and error states

#### Scenario: A partially filled profile still shows the not-completed state
- GIVEN some of the six fields hold values and at least one is still blank
- WHEN a `SYSTEM_ADMIN` opens the page
- THEN the not-completed-yet indication MUST still be shown

#### Scenario: A fully filled profile shows no not-completed state
- GIVEN all six fields hold values
- WHEN a `SYSTEM_ADMIN` opens the page
- THEN no not-completed-yet indication MUST be shown

#### Scenario: Loading and error states are distinct
- GIVEN the profile request is in flight, and separately that it has failed
- WHEN the page renders in each case
- THEN each MUST render its own distinct state, and neither MUST be mistakable for the not-completed-yet state or for a blank form

### Requirement: Saving the Profile

The system MUST let a `SYSTEM_ADMIN` save changes to any subset of the
six fields. Client-side validation against the shared update schema
MUST run before any network request, so a blank or whitespace-only
field MUST surface a form error with no request sent. On success the
saved values MUST be visible without a manual page reload, and MUST
still be present after one.

#### Scenario: A valid save persists and is visible on reload
- GIVEN a `SYSTEM_ADMIN` fills all six fields with valid values and saves
- WHEN the request succeeds and they reload the page
- THEN the saved values MUST be shown, and the not-completed-yet indication MUST be gone

#### Scenario: A blank field is rejected before any network call
- GIVEN a `SYSTEM_ADMIN` clears a field to empty or whitespace and submits
- WHEN the form is validated
- THEN a validation error MUST be shown for that field and no network request MUST be sent

#### Scenario: A save failure is surfaced without losing the entered values
- GIVEN a `SYSTEM_ADMIN` submits a valid change and the request fails
- WHEN the failure is handled
- THEN an error MUST be shown and the values they entered MUST remain in the form

### Requirement: No Logo Control

The page MUST offer no logo affordance of any kind: no file input, no
upload button, no image preview, no placeholder and no "coming soon"
control. `logoAssetId` is reserved on the entity and absent from the
API this slice ships, so the UI MUST have nothing to bind to.

#### Scenario: No logo affordance is rendered
- GIVEN the organization profile page rendered for a `SYSTEM_ADMIN`
- WHEN every control and image it renders is enumerated
- THEN none MUST relate to a logo, and no file-upload control MUST exist anywhere in this surface

### Requirement: No Server-Message String Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation MUST
rely only on `ApiError.status` and `.code`.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path in the organization profile UI that maps an API error to a UI message
- WHEN that code selects which message or behavior to apply
- THEN it MUST NOT do so by comparing against an English message string returned by the server

### Requirement: Internationalization Coverage

The organization profile UI MUST contain zero hardcoded user-facing
strings. Every label, the not-completed-yet indication, every
validation and error message and the save control's label MUST come
from `organizationProfile.*`/`common.*` translation keys with real
(non-placeholder) values in `en`, `es` and `ca`, enforced by the
existing locale parity test.

#### Scenario: All visible text is translated in every configured locale
- GIVEN the organization profile page is rendered
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or an English fallback

#### Scenario: The locale parity test covers the new namespace
- GIVEN the locale files after this change
- WHEN the parity test runs
- THEN it MUST pass over the added `organizationProfile.*` and navigation keys in all three locales
