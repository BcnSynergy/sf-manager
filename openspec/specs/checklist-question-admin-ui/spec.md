# Checklist Question Admin UI

## Purpose

The `SYSTEM_ADMIN`-gated web surface for the global question pool:
route gating, a list grouped/filterable by `elementType` showing each
question's frequency tags and its verbatim text, create and edit forms,
confirmed soft-delete, an explicit empty-pool state, and the `ApiError`
→ localized-message contract for the new error codes. Reached by URL —
there is no global nav bar and no parent page to hang an entry point
from (pre-existing gap, carried forward). No question detail page beyond
edit, no search, no pagination, no restore of soft-deleted questions, no
audit-log UI (proposal Out of Scope — minimal per ADR-006).

## Requirements

### Requirement: Role-Gated Route Access

The system MUST restrict all checklist-question routes to authenticated
users holding the `SYSTEM_ADMIN` role. An authenticated
non-`SYSTEM_ADMIN` who reaches any such route MUST see an explicit "not
authorized" message, not a silent redirect. An unauthenticated visitor
MUST be redirected to `/login`.

#### Scenario: Admin reaches the pool
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to a checklist-question route
- THEN the question pool surface MUST be shown

#### Scenario: Non-admin denied with an explicit message
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they navigate to any checklist-question route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any checklist-question route
- THEN they MUST be redirected to `/login`

### Requirement: List the Question Pool

The system MUST display all active questions to a `SYSTEM_ADMIN`,
organized by `elementType` and showing each question's frequency tags
and its `text`, with distinct loading, empty, and error states.
Soft-deleted questions MUST NOT appear.

#### Scenario: Admin views a populated pool
- GIVEN one or more active questions exist
- WHEN the `SYSTEM_ADMIN` opens the pool list
- THEN each question's `elementType`, frequency tags and `text` MUST be shown

#### Scenario: Empty-pool state is first-class
- GIVEN no active questions exist
- WHEN the `SYSTEM_ADMIN` opens the pool list
- THEN a distinct empty-state message that invites creating the first question MUST be shown, not a blank screen

#### Scenario: Error state on fetch failure
- GIVEN the list request fails
- WHEN the `SYSTEM_ADMIN` opens the pool list
- THEN a distinct error state MUST be shown, not a blank or loading screen

#### Scenario: Soft-deleted questions never shown
- GIVEN a soft-deleted question exists alongside active ones
- WHEN the `SYSTEM_ADMIN` opens the pool list
- THEN it MUST NOT appear

### Requirement: Create Checklist Question

The system MUST let a `SYSTEM_ADMIN` create a question by submitting
`elementType`, at least one `ReviewFrequency`, and `text`. Client-side
validation against the shared create schema MUST run before any network
request, including rejection of an empty frequency selection. On
success, the new question MUST appear in the list without a manual page
reload.

#### Scenario: Valid submission creates and lists the question
- GIVEN the `SYSTEM_ADMIN` submits a valid `elementType`, at least one frequency, and `text`
- WHEN the request succeeds
- THEN the new question MUST appear in the list without a manual reload

#### Scenario: Empty frequency selection rejected before any network call
- GIVEN the `SYSTEM_ADMIN` fills in `text` but selects no frequency
- WHEN they submit the create form
- THEN the form MUST show a validation error
- AND no network request MUST be sent

### Requirement: Edit Checklist Question

The system MUST let a `SYSTEM_ADMIN` edit an existing question's `text`
and frequency tags, validated with the shared update schema and
prefilled from already-known list data. `elementType` MUST NOT be
editable. On success, the change MUST be visible on return to the list
without a manual reload.

#### Scenario: Edit form is prefilled
- GIVEN the `SYSTEM_ADMIN` opens the edit form for a question present in the list
- WHEN the form is shown
- THEN it MUST be prefilled with that question's current `text` and frequency tags

#### Scenario: Saved edit is visible without a manual reload
- GIVEN the `SYSTEM_ADMIN` submits a valid change
- WHEN the request succeeds
- THEN the updated value MUST be visible on the pool list

### Requirement: Confirmed Soft-Delete

The system MUST let a `SYSTEM_ADMIN` soft-delete a question only after
an explicit confirmation step. The confirmation MUST NOT warn of, or
imply, a blocking template dependency — deletion is never blocked. On
success, the row MUST disappear from the list without a manual reload.

#### Scenario: Confirmed soft-delete removes the question from the list
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for an active question and confirms
- WHEN the soft-delete succeeds
- THEN that question MUST no longer appear in the list, without a manual reload

#### Scenario: Soft-delete requires confirmation
- GIVEN the `SYSTEM_ADMIN` triggers soft-delete for a question
- WHEN the confirmation step is shown
- THEN the deletion MUST NOT proceed until explicitly confirmed

### Requirement: Question Text Is Rendered Verbatim

The system MUST render `ChecklistQuestion.text` exactly as the admin
authored it, as runtime data. It MUST NOT be passed through the
translation function, treated as a translation key, or transformed
before display — the same treatment `Community.name` already receives.

#### Scenario: Question text is not translated
- GIVEN a question whose `text` happens to resemble a translation key
- WHEN it is rendered in the list or a form
- THEN the stored string MUST be shown verbatim, identically in every locale

### Requirement: Element Type and Frequency Label Mapping

No `elementType` or `ReviewFrequency` value MUST be rendered raw
anywhere in this UI. Both MUST be displayed through i18n label maps, in
list cells, tags, form controls and confirmation dialogs alike. Raw enum
values MAY only back `<option value>` / form-control value attributes
and API payloads. These label maps MUST ship with the pages themselves,
not as a follow-up change.

#### Scenario: Frequency rendered through a label map
- GIVEN a question tagged `QUARTERLY` is displayed
- WHEN that value is rendered as visible text
- THEN it MUST show the localized label, not the raw string `QUARTERLY`

#### Scenario: Element type rendered through a label map
- GIVEN a question with `elementType: EXTINGUISHER` is displayed
- WHEN that value is rendered as visible text
- THEN it MUST show the localized label, not the raw string `EXTINGUISHER`

### Requirement: Coded Error Handling Without Server-Message Coupling

Client code MUST NOT select UI behavior or messaging by comparing a
server-supplied English error message string. Cause disambiguation MUST
rely only on `ApiError.status` and `.code`. A 404 with `code:
CHECKLIST_QUESTION_NOT_FOUND` on any action MUST surface one generic,
honest "no longer exists" message.

#### Scenario: Error handling does not branch on English message text
- GIVEN any client code path that maps an API error to a UI message in this surface
- WHEN it selects which message or behavior to apply
- THEN it MUST NOT compare against a server-supplied English message string

#### Scenario: 404 shows a generic message
- GIVEN an edit or delete action fails with 404 and `code: CHECKLIST_QUESTION_NOT_FOUND`
- WHEN the failure is shown
- THEN a single generic "not found" message MUST be shown

### Requirement: Internationalization Coverage

This UI MUST contain zero hardcoded user-facing strings. All chrome
text MUST come from `checklistQuestion.*` / `common.*` translation keys
with real (non-placeholder) translations present in `en`, `es`, and
`ca`. Admin-authored question text is data, not chrome, and is exempt.

#### Scenario: All chrome text is translated in every configured locale
- GIVEN the pool list, create form and edit form are rendered
- WHEN the active locale is `en`, `es`, or `ca`
- THEN every visible label, button, heading and message MUST come from a translation key with a real value for that locale, not a placeholder or English fallback
