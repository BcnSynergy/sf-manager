# Element Label Printing

## Purpose

The `SYSTEM_ADMIN`-facing surface that turns a registered
`InspectableElement` into a physical label: what one label contains (a
QR encoding the element's bare `code`, that same `code` as readable
plain text, plus the minimum identifying context), the per-element
print trigger, and browser-print behaviour (`window.print()` against a
`@media print` stylesheet that suppresses application chrome). Scope is
**one element per printed label**. FR-006's community batch sheet is a
named, deliberate follow-up — no multi-element page, no page-break
layout, no "print all". No server-generated PDF, no download or email
artifact, and no code-lookup/scan-handling route (a scanned QR yields a
text string; resolving it to an element is FR-007). Access control is
**unchanged** and owned by the `authorization` spec: printing reuses the
existing `inspectableElement:read` permission and introduces none.

## Requirements

### Requirement: Print a Label For a Single Element

The system MUST let a `SYSTEM_ADMIN` print a label for exactly one
`InspectableElement`, triggered from that element's row in its
community's elements list. A label view MUST represent one element and
one element only. Soft-deleted elements MUST NOT be printable.

#### Scenario: Admin prints a label for one element
- GIVEN a `SYSTEM_ADMIN` is viewing community C's elements list containing active element E
- WHEN they trigger the print action for E
- THEN a label for E MUST be shown and MUST be printable via the browser's print flow

#### Scenario: A label view carries exactly one element
- GIVEN any label view reachable in the application
- WHEN it is rendered
- THEN it MUST contain the data of exactly one element, never a set or list of elements

#### Scenario: Soft-deleted elements are not printable
- GIVEN element E under community C is soft-deleted
- WHEN a `SYSTEM_ADMIN` attempts to reach a label for E
- THEN no label for E MUST be rendered, and E MUST NOT appear in the list the print action is reached from

### Requirement: Label Content

A printed label MUST render, for its element: a QR code, the element's
`code` as human-readable plain text, and the minimum identifying
context — the element's `name`, its `location`, and its `community`.
The plain-text `code`, the QR payload, and the element's stored `code`
MUST all be the same string. The label MUST NOT rely on `serialNumber`
or on the element's `id` to identify the unit.

#### Scenario: Label shows QR, readable code, and context
- GIVEN a `SYSTEM_ADMIN` opens the label for active element E
- WHEN the label is rendered
- THEN it MUST show a QR code, E's `code` as readable plain text, and E's `name`, `location` and community

#### Scenario: Readable code and QR payload agree with the stored code
- GIVEN element E has stored `code` X
- WHEN E's label is rendered
- THEN the plain-text code on the label MUST be exactly X
- AND the QR payload MUST be exactly X

#### Scenario: Identification does not depend on serial number
- GIVEN element E has no `serialNumber`
- WHEN E's label is rendered
- THEN the label MUST still fully identify E via its `code` and context, with no missing-value placeholder standing in for identification

### Requirement: QR Payload Is the Bare Code

The QR MUST encode **exactly** the element's 10-character `code` as
plain text. It MUST NOT encode a URL, deep link, path prefix or suffix,
surrounding whitespace, or any structured wrapper (JSON, key/value,
separator-delimited). Conformance MUST be established by decoding the
rendered QR output, not by inspecting the value handed to the renderer.

#### Scenario: Decoding the rendered QR yields the bare code
- GIVEN element E has stored `code` X
- WHEN E's rendered QR output is decoded
- THEN the decoded payload MUST equal X exactly, with no prefix, suffix, scheme, host, path or whitespace

#### Scenario: No URL payload anywhere in the label path
- GIVEN any label rendered by the system
- WHEN its QR payload is decoded
- THEN the payload MUST NOT be a URL or contain a route such as `/elements/{code}`

### Requirement: Print Output Suppresses Application Chrome

When a label is printed, the printed output MUST contain only the label
content. Application chrome — navigation, buttons, action controls and
surrounding page layout — MUST NOT appear in the printed output. The QR
and the plain-text `code` MUST both be fully rendered in the printed
output, not clipped by the page margins.

#### Scenario: Printed output excludes app chrome
- GIVEN a `SYSTEM_ADMIN` prints a label
- WHEN the print output is produced
- THEN navigation, buttons and surrounding page layout MUST NOT appear in it

#### Scenario: QR and code survive the print layout
- GIVEN a `SYSTEM_ADMIN` previews the print output for a label
- WHEN the preview is inspected
- THEN the QR and the plain-text `code` MUST both be fully visible and uncropped

### Requirement: Printing Reuses the Existing Element Read Permission

Access to the label surface MUST be governed by the permission that
already gates reading inspectable elements. The change MUST NOT
introduce a new permission, MUST NOT add a value to the `Permission`
union, and MUST NOT grant any permission to a role that previously had
none. An authenticated non-`SYSTEM_ADMIN` reaching the label surface
MUST see an explicit "not authorized" message, not a silent redirect;
an unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: Admin may print
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they reach the label surface for an active element
- THEN the label MUST be shown

#### Scenario: Authenticated non-admin denied explicitly
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to the label surface
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to the label surface
- THEN they MUST be redirected to `/login`

#### Scenario: No new permission is introduced
- GIVEN the permission catalogue and role-permission mapping as they stood before this change
- WHEN they are compared with their post-change state
- THEN they MUST be identical: no new permission value, no role newly granted a permission, and every previously empty role mapping still empty

### Requirement: No Batch or Multi-Element Printing

The system MUST NOT provide any route, page or action that prints or
lays out more than one element's label at a time. There MUST be no
"print all" or bulk-print control, and no multi-label page-break
layout.

#### Scenario: No print-all control exists
- GIVEN a `SYSTEM_ADMIN` is viewing a community's elements list
- WHEN the available actions are inspected
- THEN no action that prints more than one element MUST be offered

#### Scenario: No multi-label layout exists
- GIVEN the application's print behaviour
- WHEN its print surfaces are inspected
- THEN no multi-element sheet or page-break layout for repeated labels MUST exist

### Requirement: No Server-Generated Label Artifact

Printing MUST be initiated by the browser against a print stylesheet.
The system MUST NOT expose an endpoint that returns a label as a PDF,
image or other downloadable file, MUST NOT email a label, and MUST NOT
introduce a PDF or headless-browser dependency.

#### Scenario: No label download or export endpoint
- GIVEN the application's API surface after this change
- WHEN it is inspected
- THEN no endpoint returning a label document, file or image MUST exist

#### Scenario: No PDF or headless-browser dependency added
- GIVEN the project's dependency manifests before and after this change
- WHEN they are compared
- THEN no PDF-generation or headless-browser dependency MUST have been added

### Requirement: No Code-Lookup or Scan-Handling Surface

Because the QR payload is a bare `code`, this change MUST NOT introduce
any way to resolve a `code` back to an element: no lookup route, no
lookup use case, no repository lookup-by-code method, and no scan or
deep-link handler.

#### Scenario: No by-code lookup exists
- GIVEN the application's routes, use cases and repository methods after this change
- WHEN they are inspected
- THEN none MUST accept an element `code` in order to resolve it to an element

### Requirement: Documented QR Payload Matches the Implemented One

`docs/architecture/domain-model-inspections.md` §InspectableElement MUST
describe the QR payload as the bare `code`. It MUST NOT continue to
specify a URL payload such as `.../elements/{code}`. It MUST also record
that `code` is immutable and that the community batch sheet is deferred.

#### Scenario: Documentation no longer specifies a URL payload
- GIVEN `docs/architecture/domain-model-inspections.md` after this change
- WHEN §InspectableElement is read
- THEN it MUST state that the QR encodes the bare `code`
- AND it MUST NOT describe the QR as encoding a URL or deep link

#### Scenario: Documentation records immutability and the batch deferral
- GIVEN `docs/architecture/domain-model-inspections.md` after this change
- WHEN §InspectableElement is read
- THEN it MUST record that `code` is assigned once and never regenerated
- AND it MUST record that batch/community label sheets are deferred

### Requirement: Internationalization Coverage

The label and print surface MUST contain zero hardcoded UI strings. All
user-facing text MUST come from translation keys with real
(non-placeholder) values in `en`, `es` and `ca`.

#### Scenario: All label UI text is translated in every configured locale
- GIVEN the label view and the print entry point are rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback
