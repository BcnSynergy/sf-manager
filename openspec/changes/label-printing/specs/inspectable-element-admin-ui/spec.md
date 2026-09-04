# Delta for Inspectable Element Admin UI

> **Purpose amendment (for archive):** the elements list now also shows
> each element's `code` and offers a per-element print entry point into
> the `element-label-printing` surface. Everything else about the
> capability's scope is unchanged.

## ADDED Requirements

### Requirement: Element Code Shown in the List

The system MUST display each active element's `code` in the community's
elements list, as readable text matching the stored value exactly. The
`code` MUST be presented as read-only information — no control in the
list MUST offer to change, regenerate or clear it.

#### Scenario: Admin sees each element's code
- GIVEN community C has active elements
- WHEN a `SYSTEM_ADMIN` opens C's elements list
- THEN each row MUST show that element's `code` exactly as stored

#### Scenario: The code is read-only in the list
- GIVEN the `SYSTEM_ADMIN` is viewing an element's row
- WHEN the available controls are inspected
- THEN none MUST edit, regenerate or clear the `code`

### Requirement: Per-Element Print Entry Point

The system MUST offer a print action on each active element's row,
leading to that element's label. The action MUST target exactly one
element. No list-level action that prints several or all elements MUST
be offered.

#### Scenario: Print action opens that element's label
- GIVEN a `SYSTEM_ADMIN` is viewing community C's elements list containing active element E
- WHEN they trigger the print action on E's row
- THEN the label for E — and no other element — MUST be reached

#### Scenario: No list-level print-all action
- GIVEN the `SYSTEM_ADMIN` is viewing a community's elements list
- WHEN the list-level actions are inspected
- THEN no action that prints more than one element MUST be offered

## MODIFIED Requirements

### Requirement: List Active Elements For a Community

The system MUST display a community's active elements (`code`,
`elementType`, `name`, `description`, `location`, `serialNumber`,
`installedAt`) to a `SYSTEM_ADMIN`, with distinct loading, empty, and
error states. Soft-deleted elements MUST NOT appear.
(Previously: the same list without `code`.)

#### Scenario: Admin views a populated list
- GIVEN a community has one or more active elements
- WHEN the `SYSTEM_ADMIN` opens that community's elements list
- THEN each element's fields, including its `code`, MUST be shown

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

### Requirement: Edit Inspectable Element

The system MUST let a `SYSTEM_ADMIN` edit an existing element's
fields, validated with the shared update schema, prefilled from
already-known list data — no dedicated single-element fetch endpoint
exists. The edit form MUST NOT expose `code` as an editable control:
`code` MAY be displayed read-only or omitted, but MUST never be
submitted as a change. On success, the change MUST be visible on
return to the list.
(Previously: had no `code` field and therefore no immutability rule.)

#### Scenario: Admin edits an element's fields
- GIVEN the `SYSTEM_ADMIN` opens the edit form for an element already present in the list
- WHEN the form is shown
- THEN it MUST be prefilled with that element's current field values

#### Scenario: The edit form has no code input
- GIVEN the `SYSTEM_ADMIN` opens the edit form for an element
- WHEN the form's inputs are inspected
- THEN no editable input MUST bind to `code`, and no submitted update payload MUST carry a changed `code`

#### Scenario: Saved edit is visible without a manual reload
- GIVEN the `SYSTEM_ADMIN` submits a valid change to one or more fields
- WHEN the request succeeds
- THEN the updated value(s) MUST be visible on the elements list
