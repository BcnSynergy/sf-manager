# Inspectable Element Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for a community's inspectable
elements: route gating, active-element list, create/edit forms,
confirmed soft-delete, element-type label rendering, and the
`ApiError` → localized-message contract for the new error codes.
Reachable only through a valid community id, via the entry point on
`CommunityDetailPage` (see `community-admin-ui`). No element detail
page beyond edit (editing reuses the list, no `GET /:id`), no
cross-community list, no pagination/filtering/search, no restore of
soft-deleted elements, no audit-log UI (proposal Out of Scope — this
slice stays minimal per ADR-006).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict all `/communities/:communityId/inspectable-elements`
routes to authenticated users holding the `SYSTEM_ADMIN` role. An
authenticated non-`SYSTEM_ADMIN` who reaches any such route MUST see
an explicit "not authorized" message, not a silent redirect. An
unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: Admin reaches a community's elements section
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to a valid community's inspectable-elements route
- THEN the active-element list MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to any inspectable-elements route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any inspectable-elements route
- THEN they MUST be redirected to `/login`

### Requirement: List Active Elements For a Community

The system MUST display a community's active elements (`elementType`,
`name`, `description`, `location`, `serialNumber`, `installedAt`) to a
`SYSTEM_ADMIN`, with distinct loading, empty, and error states.
Soft-deleted elements MUST NOT appear.

#### Scenario: Admin views a populated list
- GIVEN a community has one or more active elements
- WHEN the `SYSTEM_ADMIN` opens that community's elements list
- THEN each element's fields MUST be shown

#### Scenario: Empty state
- GIVEN a community has no active elements
- WHEN the `SYSTEM_ADMIN` opens its elements list
- THEN a distinct empty-state message MUST be shown, not a blank screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens a community's elements list
- THEN a distinct error state MUST be shown, not a blank or loading screen

#### Scenario: Soft-deleted elements never shown
- GIVEN a community has a soft-deleted element alongside active ones
- WHEN the `SYSTEM_ADMIN` opens its elements list
- THEN the soft-deleted element MUST NOT appear

### Requirement: Create Inspectable Element

The system MUST let a `SYSTEM_ADMIN` create an element under a
community by submitting `elementType`, `name`, `location`, and
`installedAt`, with optional `description` and `serialNumber`.
Client-side validation against the shared create schema MUST run
before any network request. On success, the new element MUST appear
in the list without a manual page reload.

#### Scenario: Valid submission creates and lists the element
- GIVEN the `SYSTEM_ADMIN` submits valid required fields for a community
- WHEN the request succeeds
- THEN the new element MUST appear in the list without a manual reload

#### Scenario: Invalid submission rejected before any network call
- GIVEN the `SYSTEM_ADMIN` submits a field that fails the shared create schema
- WHEN they submit the create form
- THEN the form MUST show a validation error
- AND no network request MUST be sent

### Requirement: Edit Inspectable Element

The system MUST let a `SYSTEM_ADMIN` edit an existing element's
fields, validated with the shared update schema, prefilled from
already-known list data — no dedicated single-element fetch endpoint
exists. On success, the change MUST be visible on return to the list.

#### Scenario: Admin edits an element's fields
- GIVEN the `SYSTEM_ADMIN` opens the edit form for an element already present in the list
- WHEN the form is shown
- THEN it MUST be prefilled with that element's current field values

#### Scenario: Saved edit is visible without a manual reload
- GIVEN the `SYSTEM_ADMIN` submits a valid change to one or more fields
- WHEN the request succeeds
- THEN the updated value(s) MUST be visible on the elements list

### Requirement: Soft-Delete Inspectable Element

The system MUST let a `SYSTEM_ADMIN` soft-delete an element only after
an explicit confirmation step. On success, the row MUST disappear from
the list without a manual page reload.

#### Scenario: Confirmed soft-delete removes the element from the list
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for an active element and confirms
- WHEN the soft-delete succeeds
- THEN that element MUST no longer appear in the list, without a manual reload

#### Scenario: Soft-delete requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for an element
- WHEN the confirmation step is shown
- THEN the deletion MUST NOT proceed until explicitly confirmed

### Requirement: Generic Not-Found Handling

The system MUST show one generic, honest message for a 404 on any
create, update, or soft-delete action against a community or element
that no longer exists — covering both `code: COMMUNITY_NOT_FOUND` and
`code: INSPECTABLE_ELEMENT_NOT_FOUND` — without attempting to
distinguish the two causes beyond that single message.

#### Scenario: 404 shows a generic message
- GIVEN an action fails with 404 and either `code: COMMUNITY_NOT_FOUND` or `code: INSPECTABLE_ELEMENT_NOT_FOUND`
- WHEN the failure is shown
- THEN a single generic "not found" message MUST be shown

### Requirement: No Server-Message String Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation
MUST rely only on `ApiError.status` and `.code`.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path in the inspectable element admin UI that maps an API error to a UI message
- WHEN that code selects which message or behavior to apply
- THEN it MUST NOT do so by comparing against an English message string returned by the server

### Requirement: Internationalization Coverage

The inspectable element admin UI MUST contain zero hardcoded UI
strings. All user-facing text MUST be sourced from
`inspectableElement.*`/`common.*` translation keys with real
(non-placeholder) translations present in `en`, `es`, and `ca`.

#### Scenario: All visible text is translated in every configured locale
- GIVEN the inspectable element admin UI (list, create, edit) is rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback

### Requirement: Element Type Label Mapping

No `elementType` value MUST be rendered raw anywhere in the
inspectable element admin UI. It MUST be displayed through an i18n
label map, in table cells and `<select>` option labels alike. The raw
enum value MAY only back `<option value>` attributes and API payloads.

#### Scenario: Element type rendered through a label map
- GIVEN an element with `elementType: EXTINGUISHER` is displayed in the list, a form, or a confirmation dialog
- WHEN that value is rendered as visible text
- THEN it MUST show the localized label for that type, not the raw string `EXTINGUISHER`
