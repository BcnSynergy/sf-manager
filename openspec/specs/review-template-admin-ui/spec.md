# Review Template Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for versioned review templates: a
list grouped by `elementType` + `frequency` showing each version and
status, a builder view where a `draft`'s question selection and order
are edited against the live pool, a read-only view of frozen versions
rendering **their own snapshotted wording**, and an Activate action
behind a confirmation that names the version being retired. Reached by
URL — no global nav bar exists (pre-existing gap, carried forward). No
template duplication or "clone as new draft", no restore of soft-deleted
drafts, no session/run surface, no search or pagination (proposal Out of
Scope — minimal per ADR-006).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict all review-template routes to authenticated
users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches any such route MUST see an explicit "not
authorized" message, not a silent redirect. An unauthenticated visitor
MUST be redirected to `/login`.

#### Scenario: Admin reaches the templates surface
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to a review-template route
- THEN the templates surface MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to any review-template route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any review-template route
- THEN they MUST be redirected to `/login`

### Requirement: List Templates With Version and Status

The system MUST display all non-soft-deleted templates to a
`SYSTEM_ADMIN`, organized by `elementType` and `frequency`, each showing
its `name`, `version` and a `status` badge, with distinct loading, empty
and error states. Soft-deleted drafts MUST NOT appear.

#### Scenario: Admin views templates across lineages
- GIVEN templates exist in `draft`, `active` and `retired` status
- WHEN the `SYSTEM_ADMIN` opens the templates list
- THEN all three MUST be shown, grouped by element type and frequency, each with its version and status badge

#### Scenario: Empty state
- GIVEN no templates exist
- WHEN the `SYSTEM_ADMIN` opens the templates list
- THEN a distinct empty-state message MUST be shown, not a blank screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens the templates list
- THEN a distinct error state MUST be shown, not a blank or loading screen

### Requirement: Create Draft Template

The system MUST let a `SYSTEM_ADMIN` create a `draft` template by
submitting `elementType`, `frequency` and `name`, validated
client-side against the shared create schema before any network
request. A rejection with `code: REVIEW_TEMPLATE_DRAFT_EXISTS` MUST be
surfaced as a specific message explaining a draft already exists for
that element type and frequency.

#### Scenario: Valid submission creates the draft
- GIVEN the `SYSTEM_ADMIN` submits a valid element type, frequency and name
- WHEN the request succeeds
- THEN the new draft MUST be reachable without a manual reload

#### Scenario: Existing draft conflict is explained, not generic
- GIVEN a draft already exists for the chosen element type and frequency
- WHEN the create request fails with 409 `code: REVIEW_TEMPLATE_DRAFT_EXISTS`
- THEN a specific localized message naming that cause MUST be shown

### Requirement: Draft Builder Selects and Orders Questions

The system MUST let a `SYSTEM_ADMIN` pick questions from the live pool
into a `draft` and set their order, saving the whole ordered selection.
The selectable set MUST be **pre-filtered** by the template's own
frequency as a suggestion, while still letting the admin reveal and
select questions tagged only for other frequencies. Soft-deleted
questions MUST never be selectable. A draft MUST render the **current**
pool text, so a question edited after selection shows its new wording.

#### Scenario: Admin builds and reorders a draft
- GIVEN a `draft` and several active pool questions
- WHEN the `SYSTEM_ADMIN` selects questions, reorders them, and saves
- THEN the saved order MUST be shown on reload, without a manual page refresh

#### Scenario: Frequency pre-filter is a default, not a lock
- GIVEN a `draft` for `ANNUAL` and a question tagged only `QUARTERLY`
- WHEN the `SYSTEM_ADMIN` opens the question picker
- THEN the `ANNUAL`-tagged questions MUST be offered by default
- AND the `QUARTERLY`-only question MUST still be reachable and selectable

#### Scenario: Empty-pool state in the builder
- GIVEN the question pool is empty
- WHEN the `SYSTEM_ADMIN` opens the builder for a draft
- THEN a distinct empty-state message pointing to the question pool MUST be shown, not an empty picker with no explanation

#### Scenario: Soft-deleted questions are not selectable
- GIVEN a soft-deleted question exists
- WHEN the `SYSTEM_ADMIN` opens the question picker
- THEN it MUST NOT be offered

#### Scenario: Draft shows live wording
- GIVEN a `draft` includes question Q, and Q's text is then edited
- WHEN the `SYSTEM_ADMIN` reopens the draft
- THEN Q's new text MUST be shown

### Requirement: Frozen Versions Are Read-Only and Show Their Snapshot

The system MUST render an `active` or `retired` template as read-only:
no question picker, no reorder control, no rename, no re-activate. Its
questions MUST be displayed from the version's own frozen wording
snapshot, never from the current pool text.

#### Scenario: No editing controls on a frozen version
- GIVEN the `SYSTEM_ADMIN` opens an `active` or `retired` template
- WHEN the view is rendered
- THEN no control to add, remove, reorder, rename or re-activate MUST be present

#### Scenario: Frozen wording survives a later pool edit
- GIVEN an `active` template froze question Q with text "Original", and Q's text is then edited to "Changed"
- WHEN the `SYSTEM_ADMIN` opens that `active` template
- THEN "Original" MUST be displayed
- AND the pool list MUST show "Changed"

#### Scenario: Frozen wording survives a later soft-delete
- GIVEN an `active` template froze question Q, and Q is then soft-deleted
- WHEN the `SYSTEM_ADMIN` opens that `active` template
- THEN Q's frozen wording MUST still be displayed in its frozen position

### Requirement: Activate With a Confirmation That Names the Retirement

The system MUST let a `SYSTEM_ADMIN` activate a `draft` only after an
explicit confirmation step whose copy states that activation freezes
this template permanently and, when a version is currently `active` for
the same lineage, names that version as the one being retired. On
success, the list MUST show the new version as `active` and the
predecessor as `retired` without a manual reload. Rejections MUST be
surfaced by code: `REVIEW_TEMPLATE_EMPTY` as a specific "add at least
one question" message, `REVIEW_TEMPLATE_NOT_EDITABLE` as a specific
"this version is already frozen" message.

#### Scenario: Confirmation names the version being retired
- GIVEN `(EXTINGUISHER, QUARTERLY)` has an `active` version 1 and a `draft` with questions
- WHEN the `SYSTEM_ADMIN` triggers Activate on the draft
- THEN the confirmation MUST state that activation is permanent and MUST name version 1 as the version that will be retired

#### Scenario: Confirmation on a first activation omits any retirement claim
- GIVEN a lineage with no `active` version
- WHEN the `SYSTEM_ADMIN` triggers Activate
- THEN the confirmation MUST NOT claim any existing version will be retired

#### Scenario: Activation requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers Activate
- WHEN the confirmation step is shown
- THEN activation MUST NOT proceed until explicitly confirmed

#### Scenario: Successful activation updates both versions in the list
- GIVEN a confirmed activation succeeds over an existing `active` version
- WHEN the list is shown
- THEN the new version MUST read `active` and its predecessor `retired`, without a manual reload

#### Scenario: Empty-template rejection is explained specifically
- GIVEN a `draft` with zero questions
- WHEN the `SYSTEM_ADMIN` activates it and the request fails with 409 `code: REVIEW_TEMPLATE_EMPTY`
- THEN a specific localized message telling them to add at least one question MUST be shown

### Requirement: No Standalone Retire Control

The system MUST NOT offer any UI control that retires a template
without activating a successor. Retirement MUST be visible only as a
consequence of activation.

#### Scenario: No retire action anywhere in the surface
- GIVEN the templates list and any template view are rendered in any status
- WHEN their controls are inspected
- THEN no "retire" action MUST exist

### Requirement: Delete Control Applies to Drafts Only

The system MUST offer soft-delete only for `draft` templates, behind an
explicit confirmation. No delete control MUST be shown for `active` or
`retired` templates.

#### Scenario: Confirmed draft delete removes it from the list
- GIVEN the `SYSTEM_ADMIN` triggers delete for a `draft` and confirms
- WHEN the request succeeds
- THEN the draft MUST no longer appear in the list, without a manual reload

#### Scenario: No delete control on frozen versions
- GIVEN an `active` or `retired` template is shown
- WHEN its controls are inspected
- THEN no delete control MUST be present

### Requirement: Frequency and Status Label Mapping

No `ReviewFrequency` or template `status` value MUST be rendered raw
anywhere in this UI. Both MUST be displayed through i18n label maps, in
list groupings, badges, form controls and confirmation dialogs alike.
Raw enum values MAY only back form-control value attributes and API
payloads. These label maps MUST ship with the pages themselves, not as
a follow-up change.

#### Scenario: Frequency and status rendered through label maps
- GIVEN a template with `frequency: QUARTERLY` and `status: draft` is displayed
- WHEN those values are rendered as visible text
- THEN localized labels MUST be shown, not the raw strings `QUARTERLY` or `draft`

### Requirement: Coded Error Handling Without Server-Message Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation MUST
rely only on `ApiError.status` and `.code`, covering
`REVIEW_TEMPLATE_NOT_FOUND`, `REVIEW_TEMPLATE_NOT_EDITABLE`,
`REVIEW_TEMPLATE_EMPTY`, `REVIEW_TEMPLATE_DRAFT_EXISTS` and
`CHECKLIST_QUESTION_NOT_FOUND`.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path that maps an API error to a UI message in this surface
- WHEN it selects which message or behavior to apply
- THEN it MUST NOT compare against a server-supplied English message string

#### Scenario: Distinct codes produce distinct messages
- GIVEN two failures differing only in `code`
- WHEN each is surfaced
- THEN the messages MUST differ according to the code, not collapse into one generic string

### Requirement: Internationalization Coverage

This UI MUST contain zero hardcoded user-facing strings. All chrome
text MUST come from `reviewTemplate.*` / `common.*` translation keys
with real (non-placeholder) translations present in `en`, `es`, and
`ca`. Admin-authored template names and question wording are data, not
chrome, and are exempt.

#### Scenario: All chrome text is translated in every configured locale
- GIVEN the templates list, builder, frozen view and activate confirmation are rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible label, button, heading and message MUST come from a translation key with a real value for that locale, not a placeholder or English fallback
