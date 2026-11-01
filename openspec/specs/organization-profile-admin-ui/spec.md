# Organization Profile Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated settings surface for the organization profile
(ADR-006's 2026-08-25 addendum: a domain slice ships its own minimal UI
in the same change, not as a later retrofit).

**One** page, combining view and edit, plus a page of its own for the
logo (EN-127): the profile page shows the logo and links to it, so the
profile keeps to its data and its save button. There is no list page, no
create page and no delete control for the profile, because there is
nothing to list, create or delete — this is settings about ourselves, not a managed catalog
parallel to `/maintenance-companies`.

Its one non-obvious job is the **not-completed-yet** state: the seeded
profile is blank, and an admin must be able to tell "nobody has entered
this yet" apart from "the page is loading" and "the request failed".

Out of scope: an edit history or audit view,
a completeness gate on anything, and any surface for a non-`SYSTEM_ADMIN`
role. The navigation entry itself is owned by `app-navigation`; the API
contract is owned by `organization-profile-management`.

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict the organization-profile route and the logo
route, `/organization-profile/logo`, to authenticated users holding the
`SYSTEM_ADMIN` role. An authenticated non-`SYSTEM_ADMIN` who reaches
either MUST see the explicit "not authorized"
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

#### Scenario: Admin reaches the logo page

- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to `/organization-profile/logo`
- THEN the logo page MUST be shown

#### Scenario: Non-admin reaching the logo route by URL is denied explicitly

- GIVEN the caller is authenticated as any role other than `SYSTEM_ADMIN`
- WHEN they type `/organization-profile/logo` directly into the address bar
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

### Requirement: The Profile Page Shows the Logo and Links to Its Page

The profile page MUST show a logo section above the profile form. It MUST
preview the current logo from `GET /organization-profile/logo` when the
profile has one, and MUST otherwise say that no logo has been uploaded.
If the preview fails to load, it MUST be replaced by a message, never
shown as a broken image. The section MUST offer no upload or remove
control; it MUST offer a visible "Change logo" control, styled as a button
like the page's other actions, that opens the logo page, whether or not a
logo exists. (Previously: the profile page held the upload and the
removal itself, until EN-127.)

#### Scenario: The profile previews the logo

- GIVEN a profile with a logo
- WHEN a `SYSTEM_ADMIN` opens the profile page
- THEN the logo MUST be previewed above the profile form, and no upload or remove control MUST be shown

#### Scenario: The profile has no logo

- GIVEN a profile with no logo
- WHEN a `SYSTEM_ADMIN` opens the profile page
- THEN the logo section MUST say that no logo has been uploaded, and no logo image MUST be shown

#### Scenario: Change logo opens the logo page

- GIVEN the profile page rendered for a `SYSTEM_ADMIN`
- WHEN they activate "Change logo"
- THEN the logo page MUST be shown

### Requirement: The Logo Page

The logo page MUST show a page title, a control styled as a button that
returns to the profile page, and the logo section where the logo is
uploaded and removed. It MUST read the profile to know whether a logo
exists, and MUST show distinct loading and error states while it cannot;
the control back to the profile MUST be available in every state. The
page MUST stay put after an upload or a removal.

#### Scenario: Back to the profile

- GIVEN the logo page rendered for a `SYSTEM_ADMIN`
- WHEN they activate the control back to the profile
- THEN the profile page MUST be shown

#### Scenario: The logo page cannot read the profile

- GIVEN a `SYSTEM_ADMIN` opens the logo page and the profile request is in flight or fails
- WHEN the page renders
- THEN a loading or an error state MUST be shown instead of the logo section, and the control back to the profile MUST be available

#### Scenario: The logo page stays put after an upload

- GIVEN the logo page rendered for a `SYSTEM_ADMIN`
- WHEN they upload a logo
- THEN the logo page MUST still be shown, with the upload confirmed

#### Scenario: Coming back shows the current logo

- GIVEN a `SYSTEM_ADMIN` replaced the logo on the logo page
- WHEN they go back to the profile page, or open the logo page again, without reloading the application
- THEN the new logo MUST be previewed, not the one shown before

### Requirement: Uploading the Logo

The logo page's section MUST have its own upload, outside the profile
form: choosing a file and uploading it MUST NOT save or change the
profile's text fields. The section MUST preview the current logo from
`GET /organization-profile/logo` when the profile has one, and MUST
otherwise say that no logo has been uploaded. If the preview fails to
load, it MUST be replaced by a message, never shown as a broken image.

The file picker MUST offer PNG, JPEG, WebP and SVG only. An upload of a file
over 2 MB, or whose type is not PNG, JPEG, WebP or SVG, MUST be rejected with
a message and no request sent. The upload control MUST be disabled until a
file is chosen and while an upload is in flight. On success the section
MUST confirm the upload in its own status region, next to its controls
(`web-alert-announcements`), and MUST show the new logo without a page
reload; choosing another file withdraws the confirmation. A
failed upload MUST show a message chosen by the response's status and
code (413: too large; `LOGO_UNSUPPORTED_FORMAT`: wrong format; anything
else: a generic failure) and MUST keep the previous logo.

#### Scenario: A profile without a logo

- GIVEN a profile with no logo
- WHEN a `SYSTEM_ADMIN` opens the logo page
- THEN the logo section MUST say that no logo has been uploaded, and no logo image MUST be shown

#### Scenario: A logo is uploaded and previewed

- GIVEN a `SYSTEM_ADMIN` chooses a PNG, JPEG, WebP or SVG file of at most 2 MB
- WHEN they upload it
- THEN the upload MUST be confirmed and the new logo MUST be previewed, without a page reload and without saving the profile form

#### Scenario: A wrong file is rejected before any network call

- GIVEN a `SYSTEM_ADMIN` chooses a file over 2 MB, or a GIF or other non-PNG/JPEG/WebP/SVG file
- WHEN they try to upload it
- THEN a message MUST be shown and no request MUST be sent

#### Scenario: A rejected upload keeps the previous logo

- GIVEN a profile with a logo, and an upload the API rejects or that fails
- WHEN the failure is handled
- THEN a message chosen by status and code MUST be shown, and the previous logo MUST still be previewed

#### Scenario: A logo that cannot be loaded

- GIVEN a profile whose logo image fails to load
- WHEN the page renders it
- THEN a message MUST replace the image

### Requirement: Removing the Logo

When the profile has a logo, the logo page's section MUST offer a control
to remove it, also when the logo image fails to load. It MUST ask for
confirmation first in a dialog that says the logo will no longer appear
on the profile or on review documents; cancelling MUST send no request
and keep the logo. On success the section MUST say that no logo has been
uploaded, MUST no longer offer the remove control, and MUST confirm the
removal in its own status region (`web-alert-announcements`), without a
page reload, and keyboard focus MUST move to the logo section's heading. A failed removal MUST show a message, keep the logo and give
keyboard focus back to the remove control. Upload and remove MUST be
disabled while an upload or a removal is in flight, and removing MUST NOT
save or change the text fields.

#### Scenario: No logo, no remove control

- GIVEN a profile with no logo
- WHEN a `SYSTEM_ADMIN` opens the logo page
- THEN no remove control MUST be shown

#### Scenario: Cancelling keeps the logo

- GIVEN a profile with a logo
- WHEN a `SYSTEM_ADMIN` chooses to remove it and cancels the confirmation
- THEN no request MUST be sent and the logo MUST still be previewed

#### Scenario: The logo is removed

- GIVEN a profile with a logo
- WHEN a `SYSTEM_ADMIN` confirms its removal
- THEN the removal MUST be confirmed, the section MUST say that no logo has been uploaded, and no remove control MUST be shown

#### Scenario: A failed removal keeps the logo

- GIVEN a profile with a logo, and a removal that fails
- WHEN the failure is handled
- THEN a message MUST be shown, the logo MUST still be previewed, and focus MUST be on the remove control

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
