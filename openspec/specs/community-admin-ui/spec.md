# Community Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for managing communities: route
gating, active-community list, create/edit forms, confirmed
soft-delete, the community detail view with both assignment sections
(representatives, technicians), the assignment lifecycle actions
(assign by pasted `userId`, deactivate, reactivate), and the
`ApiError` → localized-message contract. Validates the existing
`community` API against a real consumer (ADR-006 course-correction
slice, second and final retrofit). No user search/autocomplete,
cross-community assignment views, community-scoped authorization,
pagination/filtering/sorting, restore of soft-deleted communities,
audit-log UI, or a global nav bar (proposal Out of Scope).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict all `/communities` routes to authenticated
users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches any `/communities` route MUST see an
explicit "not authorized" message, not a silent redirect. An
unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: Admin reaches the communities section
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to `/communities`
- THEN the active-community list MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to any `/communities` route
- THEN an explicit "not authorized" message MUST be shown, not a
  silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any `/communities` route
- THEN they MUST be redirected to `/login`

### Requirement: List Active Communities

The system MUST display active communities (`name`, `address`,
`locale`) to a `SYSTEM_ADMIN`, with distinct loading, empty, and
error states. Soft-deleted communities MUST NOT appear.

#### Scenario: Admin views a populated list
- GIVEN one or more active communities exist
- WHEN the `SYSTEM_ADMIN` opens the communities list
- THEN each community's `name`, `address`, and `locale` MUST be shown

#### Scenario: Empty state
- GIVEN no active communities exist
- WHEN the `SYSTEM_ADMIN` opens the communities list
- THEN a distinct empty-state message MUST be shown, not a blank
  screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens the communities list
- THEN a distinct error state MUST be shown, not a blank or loading
  screen

#### Scenario: Soft-deleted communities never shown
- GIVEN a soft-deleted community exists alongside active ones
- WHEN the `SYSTEM_ADMIN` opens the communities list
- THEN the soft-deleted community MUST NOT appear

### Requirement: Create Community

The system MUST let a `SYSTEM_ADMIN` create a community by submitting
`name`, `address`, and `locale`. Client-side validation against
`createCommunitySchema` MUST run before any network request. On
success, the new community MUST appear in the list without a manual
page reload.

#### Scenario: Valid submission creates and lists the community
- GIVEN the `SYSTEM_ADMIN` submits a valid `name`, `address`, and
  `locale`
- WHEN the request succeeds
- THEN the new community MUST appear in the list without a manual
  reload

#### Scenario: Invalid submission rejected before any network call
- GIVEN the `SYSTEM_ADMIN` submits a field that fails
  `createCommunitySchema`
- WHEN they submit the create form
- THEN the form MUST show a validation error
- AND no network request MUST be sent

### Requirement: Edit Community

The system MUST let a `SYSTEM_ADMIN` edit an existing community's
`name`, `address`, and/or `locale`, validated with
`updateCommunitySchema`, prefilled from already-known community data.
On success, the change MUST be visible on return to the list.

#### Scenario: Admin edits a community's fields
- GIVEN the `SYSTEM_ADMIN` opens the edit form for an existing
  community
- WHEN the form is shown
- THEN it MUST be prefilled with that community's current `name`,
  `address`, and `locale`

#### Scenario: Saved edit is visible without a manual reload
- GIVEN the `SYSTEM_ADMIN` submits a valid change to `name`,
  `address`, and/or `locale`
- WHEN the request succeeds
- THEN the updated value(s) MUST be visible on the communities list

### Requirement: Soft-Delete Community

The system MUST let a `SYSTEM_ADMIN` soft-delete a community only
after an explicit confirmation step. On success, the row MUST
disappear from the list without a manual page reload.

#### Scenario: Confirmed soft-delete removes the community from the list
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for an active
  community and confirms
- WHEN the soft-delete succeeds
- THEN that community MUST no longer appear in the list, without a
  manual reload

#### Scenario: Soft-delete requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for a community
- WHEN the confirmation step is shown
- THEN the deletion MUST NOT proceed until explicitly confirmed

### Requirement: Community Detail View

The system MUST show a community's fields plus two clearly separated
sections — Representatives and Technicians — on `CommunityDetailPage`.
Each section MUST list both active and deactivated assignment rows
with a visible status, identifying the assigned person only by
`userId` — no email or name lookup is performed.

#### Scenario: Detail page shows both assignment sections
- GIVEN a community with representative and technician assignments
  exists
- WHEN the `SYSTEM_ADMIN` opens its detail page
- THEN a Representatives section and a Technicians section MUST both
  be shown, each listing that community's assignments

#### Scenario: Deactivated assignment rows remain visible
- GIVEN a community has at least one deactivated representative or
  technician assignment
- WHEN the `SYSTEM_ADMIN` views the relevant section
- THEN the deactivated row MUST still be listed, with a visible
  deactivated status, not hidden

#### Scenario: Assignment rows identify the user by raw userId
- GIVEN a community has one or more assignment rows
- WHEN the `SYSTEM_ADMIN` views a Representatives or Technicians
  section
- THEN each row MUST display the assigned user's raw `userId`
- AND the system MUST NOT perform an email or name lookup for that
  row

### Requirement: Representative Assignment Lifecycle

The system MUST let a `SYSTEM_ADMIN` assign a representative to a
community by pasting a `userId`, deactivate an active representative
behind confirmation, and reactivate a deactivated one. The UI MUST
make the server's single-active-representative exclusivity rule
observable: after an assignment or reactivation that activates one
representative, the refetched section MUST show any previously-active
representative for that same community as deactivated, not removed.
The UI MUST NOT surface the multi-community representative warning
field, even when the API response includes one.

#### Scenario: Assigning a representative by pasted userId
- GIVEN the `SYSTEM_ADMIN` pastes a valid, eligible `userId` into the
  representative assignment input
- WHEN the assignment succeeds
- THEN the new representative MUST appear active in the section
  without a manual reload

#### Scenario: Exclusivity is observable after assigning a second representative
- GIVEN community C has representative A currently active
- WHEN the `SYSTEM_ADMIN` assigns representative B to C
- THEN the refreshed Representatives section MUST show B as active
  and A as deactivated, not removed

#### Scenario: Deactivating a representative requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers deactivation for an active
  representative row
- WHEN the confirmation step is shown and confirmed
- THEN the row MUST move to deactivated status, not disappear

#### Scenario: Reactivation also makes exclusivity observable
- GIVEN community C has representative B currently active and
  representative A currently deactivated
- WHEN the `SYSTEM_ADMIN` reactivates A
- THEN the refreshed section MUST show A as active and B as
  deactivated

#### Scenario: Multi-community warning is deliberately not surfaced
- GIVEN an assignment or reactivation response includes a
  `warning: { code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES', ... }`
  field
- WHEN the `SYSTEM_ADMIN` views the result of that action
- THEN the UI MUST NOT display any banner, message, or indicator
  derived from that warning field — this is deferred by design, not a
  gap

### Requirement: Technician Assignment Lifecycle

The system MUST let a `SYSTEM_ADMIN` assign a technician to a
community by pasting a `userId`, deactivate an active technician
behind confirmation, and reactivate a deactivated one, applying no
exclusivity: multiple technicians MUST remain active simultaneously.

#### Scenario: Two technicians remain active simultaneously
- GIVEN eligible technicians A and B
- WHEN the `SYSTEM_ADMIN` assigns both to the same community
- THEN both MUST appear active in the Technicians section
  simultaneously

#### Scenario: Deactivating one technician does not affect another
- GIVEN technicians A and B are both active in the same community
- WHEN the `SYSTEM_ADMIN` deactivates A (with confirmation)
- THEN A MUST move to deactivated status and B MUST remain active,
  unaffected

#### Scenario: Reactivating a technician has no effect on others
- GIVEN a deactivated technician assignment exists alongside an
  active one in the same community
- WHEN the `SYSTEM_ADMIN` reactivates the deactivated one
- THEN it MUST become active and the other technician's status MUST
  be unaffected

### Requirement: Cause-Specific Assignment 409 Messaging

The system MUST show a distinct message for each of the three
assignment 409 causes — already assigned (active or deactivated),
ineligible global role, and transaction conflict — read from the
response's `code` field. These three messages MUST be distinguishable
from each other. A transaction-conflict message MUST NOT trigger an
automatic retry anywhere in the web app.

#### Scenario: Already-assigned shown distinctly, telling the admin to reactivate
- GIVEN the `SYSTEM_ADMIN` assigns a `userId` that already has an
  assignment (active or deactivated) for that role in that community
- WHEN the request fails with 409
- THEN a message telling the admin to reactivate the existing record
  MUST be shown, distinguishable from the ineligible-role and
  transaction-conflict messages

#### Scenario: Ineligible role shown distinctly
- GIVEN the `SYSTEM_ADMIN` assigns a `userId` whose current global
  role does not match the target assignment type
- WHEN the request fails with 409
- THEN a specific ineligible-role message MUST be shown,
  distinguishable from the already-assigned and transaction-conflict
  messages

#### Scenario: Transaction conflict shown without automatic retry
- GIVEN a representative assign or reactivate request fails with 409
  due to a transaction conflict
- WHEN the failure is shown to the `SYSTEM_ADMIN`
- THEN a distinct "please try again" message MUST be shown
- AND no automatic retry MUST occur

### Requirement: Generic Not-Found Handling on Assignment Actions

The system MUST show one generic, honest message for a 404 on any
assign, deactivate, or reactivate action — covering an unknown
community, an unknown or ineligible pasted `userId`, or a stale
assignment reference — without attempting to distinguish the cause.

#### Scenario: 404 on assign shows a generic message
- GIVEN the `SYSTEM_ADMIN` submits an assignment action that fails
  with 404
- WHEN the failure is shown
- THEN a single generic "not found" message MUST be shown, not a
  cause-specific one

### Requirement: No Server-Message String Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation
MUST rely only on `ApiError.status` and `.code`.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path in the community admin UI that maps an
  API error to a UI message
- WHEN that code selects which message or behavior to apply
- THEN it MUST NOT do so by comparing against an English message
  string returned by the server

### Requirement: Internationalization Coverage

The community admin UI MUST contain zero hardcoded UI strings. All
user-facing text MUST be sourced from `community.*`/`common.*`
translation keys with real (non-placeholder) translations present in
`en`, `es`, and `ca`.

#### Scenario: All visible text is translated in every configured locale
- GIVEN the community admin UI (list, create, edit, detail, both
  assignment sections) is rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a
  real value for that locale, not a placeholder or English fallback

### Requirement: Enum Value Label Mapping

No enum-like value MUST be rendered raw anywhere in the community
admin UI. The community's `locale` field and each assignment row's
status (`active`/`deactivated`) MUST be displayed through an i18n
label map, in table cells and `<select>` option labels alike. The raw
enum value MAY only back `<option value>` attributes and API payloads.

#### Scenario: Locale value rendered through a label map
- GIVEN a community with a `locale` value is displayed in the list, a
  form, or the detail view
- WHEN that value is rendered as visible text
- THEN it MUST show the localized label for that `locale`, not the
  raw stored value

#### Scenario: Assignment status rendered through a label map
- GIVEN an assignment row with status `active` or `deactivated`
- WHEN that status is rendered as visible text
- THEN it MUST show the localized label for that status, not the raw
  enum value

### Requirement: Navigation to Inspectable Elements

The system MUST show a link from `CommunityDetailPage` to that
community's inspectable elements. The inspectable-elements pages MUST
be reachable only through a valid community id carried from that link
— not by a standalone, community-independent URL.

#### Scenario: Admin navigates to a community's elements from its detail page
- GIVEN the `SYSTEM_ADMIN` is viewing an existing community's detail page
- WHEN they follow the inspectable-elements link
- THEN they MUST land on that community's elements list, scoped to its id

#### Scenario: Elements pages require a valid community id
- GIVEN no valid community id backs the current inspectable-elements route
- WHEN the `SYSTEM_ADMIN` reaches that route
- THEN the system MUST NOT render an elements list for an unresolved or invalid community
