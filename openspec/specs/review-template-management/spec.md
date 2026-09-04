# Review Template Management

## Purpose

Versioned, admin-authored review templates: a `ReviewTemplate` is a
named, ordered selection of `ChecklistQuestion`s for one
`(elementType, frequency)` **lineage**. A template is created as a
mutable `draft`, and **activation freezes it permanently** while
retiring whichever version was previously `active` for that lineage.
Entity shape is `id` (UUIDv7), `elementType`, `frequency`, `name`,
`version`, `status` (`draft` | `active` | `retired`), `createdAt`,
`deletedAt`; its ordered selection is held by `ReviewTemplateQuestion`
(`templateId`, `questionId`, `order`, **plus the question wording
snapshotted at activation**). Routes are flat and global
(`/review-templates`), not community-nested. Nothing here reads or
writes a `ReviewSession` — consumption is FR-007. No template
duplication, no "clone as new draft", no cross-lineage copy, no restore
of soft-deleted drafts, no pagination, no search, no audit logging.
Access control is owned by the `authorization` spec.

## Requirements

### Requirement: Create Draft Template

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a
`ReviewTemplate` for an `(elementType, frequency)` pair with a `name`.
The template MUST be created with `status: draft`, an empty question
selection, and `deletedAt: null`. At most **one** `draft` MUST exist per
`(elementType, frequency)` lineage at any time; a second create attempt
while a draft exists MUST be rejected with 409 `code:
REVIEW_TEMPLATE_DRAFT_EXISTS` and no row created. Soft-deleting or
activating the existing draft MUST free the lineage for a new one.

#### Scenario: Admin creates the first draft for a lineage
- GIVEN no `draft` exists for `(EXTINGUISHER, QUARTERLY)`
- WHEN a `SYSTEM_ADMIN` creates a template for that pair with a valid `name`
- THEN the response MUST be 2xx, `status` MUST be `draft`, and its selection MUST be empty

#### Scenario: Second draft for the same lineage rejected
- GIVEN a `draft` already exists for `(EXTINGUISHER, QUARTERLY)`
- WHEN a `SYSTEM_ADMIN` attempts to create another for the same pair
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_DRAFT_EXISTS` and no template MUST be created

#### Scenario: A draft may coexist with an active version in the same lineage
- GIVEN `(EXTINGUISHER, QUARTERLY)` already has an `active` version
- WHEN a `SYSTEM_ADMIN` creates a draft for that same pair
- THEN the response MUST be 2xx — an `active` version MUST NOT block drafting its successor

#### Scenario: A draft for a different lineage is unaffected
- GIVEN a `draft` exists for `(EXTINGUISHER, QUARTERLY)`
- WHEN a `SYSTEM_ADMIN` creates a draft for `(EXTINGUISHER, ANNUAL)`
- THEN the response MUST be 2xx

### Requirement: Replace a Draft's Ordered Question Selection

The system MUST allow an authenticated `SYSTEM_ADMIN` to replace, in
one idempotent operation, the whole ordered selection of a `draft`
template with a list of pool question ids. The submitted order MUST be
preserved as each entry's `order`. The operation MUST be repeatable any
number of times while the template is a `draft`. Every submitted id
MUST refer to an existing, non-soft-deleted question; otherwise the
request MUST be rejected with 404 `code: CHECKLIST_QUESTION_NOT_FOUND`
and the selection left unchanged. A question tagged only for a
different `ReviewFrequency` MUST be selectable — `frequencies` is a
suggestion, not a constraint.

#### Scenario: Admin sets and reorders a draft's questions
- GIVEN a `draft` template and three active pool questions
- WHEN a `SYSTEM_ADMIN` submits the three ids in a given order, then resubmits them in a different order
- THEN each request MUST be 2xx and reading the draft MUST return the most recently submitted order

#### Scenario: Replacing the selection is a full replace, not a merge
- GIVEN a `draft` whose selection is questions A, B and C
- WHEN a `SYSTEM_ADMIN` submits a selection containing only B
- THEN reading the draft MUST return exactly B, with A and C removed

#### Scenario: Cross-frequency question may be selected
- GIVEN a `draft` for `(EXTINGUISHER, ANNUAL)` and a question tagged only `QUARTERLY`
- WHEN a `SYSTEM_ADMIN` includes that question in the selection
- THEN the response MUST be 2xx and the question MUST be part of the draft's selection

#### Scenario: Unknown or soft-deleted question id rejected
- GIVEN a `draft` template
- WHEN a `SYSTEM_ADMIN` submits a selection containing an id that does not exist or is soft-deleted
- THEN the response MUST be 404 with `code: CHECKLIST_QUESTION_NOT_FOUND` and the draft's selection MUST be unchanged

#### Scenario: Unknown template id rejected
- GIVEN a template id that does not exist or is soft-deleted
- WHEN a `SYSTEM_ADMIN` attempts to set its questions
- THEN the response MUST be 404 with `code: REVIEW_TEMPLATE_NOT_FOUND`

### Requirement: Activation Freezes the Template and Retires Its Predecessor Atomically

The system MUST allow an authenticated `SYSTEM_ADMIN` to activate a
`draft` template. Activation MUST, as **one atomic operation**:
transition the draft to `active`; assign its `version`; persist the
frozen wording snapshot of every selected question (see the snapshot
requirement); and transition whichever version was previously `active`
for the same `(elementType, frequency)` to `retired`. Either all of
these MUST take effect or none MUST. After any set of activations —
including concurrent ones — a lineage MUST hold **exactly one** `active`
version. Activating a template whose selection is empty MUST be
rejected with 409 `code: REVIEW_TEMPLATE_EMPTY`, with no state change
and no version number consumed. Activating a template that is not a
`draft` MUST be rejected with 409 `code:
REVIEW_TEMPLATE_NOT_EDITABLE`. If two activations for the same lineage
are attempted concurrently, the request that loses the race MUST be
rejected with 409 `code: REVIEW_TEMPLATE_ACTIVATION_CONFLICT` — distinct
from `REVIEW_TEMPLATE_NOT_EDITABLE`, since the losing draft was valid
and editable at request time; the conflict is with the other request's
outcome, not with the template's own state.

#### Scenario: Admin activates the first version of a lineage
- GIVEN a `draft` for `(EXTINGUISHER, QUARTERLY)` with at least one selected question and no prior `active` version
- WHEN a `SYSTEM_ADMIN` activates it
- THEN the response MUST be 2xx, its `status` MUST be `active`, and its `version` MUST be 1

#### Scenario: Activation retires the previous active version
- GIVEN `(EXTINGUISHER, QUARTERLY)` has an `active` version V1 and a `draft` with at least one question
- WHEN a `SYSTEM_ADMIN` activates the draft
- THEN the draft MUST become `active` with `version` 2
- AND V1 MUST become `retired` in the same operation

#### Scenario: Concurrent activations leave exactly one active version
- GIVEN two activation requests for the same `(elementType, frequency)` lineage are issued concurrently
- WHEN both are processed
- THEN after both complete the lineage MUST contain exactly one `active` version, and the losing request MUST fail with 409 `code: REVIEW_TEMPLATE_ACTIVATION_CONFLICT` rather than produce a second `active` version

#### Scenario: Activating an empty template rejected without consuming a version
- GIVEN a `draft` with zero selected questions
- WHEN a `SYSTEM_ADMIN` attempts to activate it
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_EMPTY`, the template MUST remain a `draft`, and no version number MUST be consumed

#### Scenario: Activating an already-active or retired template rejected
- GIVEN a template whose `status` is `active` or `retired`
- WHEN a `SYSTEM_ADMIN` attempts to activate it
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_NOT_EDITABLE`

### Requirement: Activation Snapshots Each Question's Wording

The system MUST persist, as part of the activation operation itself, a
copy of the **exact text** of every selected question as it read at that
moment, stored with the frozen version's own selection rows. A frozen
(`active` or `retired`) version MUST render its questions from that
persisted copy and MUST NOT resolve wording by dereferencing the live
`ChecklistQuestion` row. `questionId` MUST be retained as a provenance
link only — traceability back to the pool and the future join key for
FR-007 answers — and MUST NOT be the source of displayed wording. No
`active` or `retired` version MUST be able to exist with a missing or
empty snapshot, and there MUST be no path that re-snapshots, back-fills,
repairs or "syncs" a frozen version's wording after activation.

#### Scenario: Editing a question after activation does not change the frozen template
- GIVEN an `active` template that froze question Q with text "Original"
- WHEN a `SYSTEM_ADMIN` edits Q's `text` to "Changed"
- THEN reading the `active` template MUST still show "Original", byte for byte
- AND the pool list MUST show "Changed"

#### Scenario: Soft-deleting a question does not change the frozen template
- GIVEN an `active` template that froze question Q
- WHEN a `SYSTEM_ADMIN` soft-deletes Q
- THEN reading the `active` template MUST still show Q's frozen wording and order
- AND that read MUST NOT bypass the pool repository's default exclusion of soft-deleted questions — it MUST NOT read the pool row at all

#### Scenario: A frozen version always has its wording
- GIVEN any template whose `status` is `active` or `retired`
- WHEN its selection is inspected
- THEN every entry MUST carry a non-empty persisted wording snapshot

### Requirement: Drafts Track the Live Pool

The system MUST render a `draft` template's questions from the
**current** pool text, so that an edit to a question is immediately
reflected in every draft that selected it. The snapshot MUST be taken
once, at activation, and never while the template is a draft. Read
responses MUST make it unambiguous whether the wording being returned is
live draft text or a frozen snapshot; a client MUST NOT have to guess.

#### Scenario: A draft reflects a later question edit
- GIVEN a `draft` whose selection includes question Q with text "Original"
- WHEN a `SYSTEM_ADMIN` edits Q's `text` to "Changed"
- THEN reading the draft MUST show "Changed"

#### Scenario: Draft and frozen reads are distinguishable
- GIVEN the same question is selected by a `draft` and frozen into an `active` version with different wording
- WHEN each template is read
- THEN each response MUST identify its own `status`, so the consumer can tell live text from frozen text

### Requirement: Frozen Templates Are Immutable

The system MUST reject, at the domain layer and therefore at the API —
not only in the UI — every attempt to mutate an `active` or `retired`
template: replacing or reordering its question selection, renaming it,
or re-activating it. Each MUST return 409 `code:
REVIEW_TEMPLATE_NOT_EDITABLE`. `retired` is terminal: a retired version
MUST NOT return to `active` by any path.

#### Scenario: Setting questions on an active template rejected by the API
- GIVEN an `active` template
- WHEN a client sends a request replacing its question selection
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_NOT_EDITABLE` and the selection MUST be unchanged

#### Scenario: Setting questions on a retired template rejected
- GIVEN a `retired` template
- WHEN a client sends a request replacing its question selection
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_NOT_EDITABLE`

#### Scenario: Retired is terminal
- GIVEN a `retired` template
- WHEN any request attempts to return it to `active`
- THEN the request MUST be rejected and the template MUST remain `retired`

### Requirement: Retirement Only Ever Follows Activation of a Successor

The system MUST NOT expose any standalone way to retire a template:
no API route, no use case, no permission, and no UI control. A version
MUST leave `active` if and only if a successor for the same
`(elementType, frequency)` is activated. Consequently a lineage that has
ever had an `active` version MUST always have exactly one.

#### Scenario: No standalone retire surface exists
- GIVEN the shipped API routes, use cases, `Permission` union and UI controls are inspected
- WHEN they are searched for a retire action
- THEN none MUST exist that transitions a template to `retired` without activating a successor

#### Scenario: A lineage cannot be emptied
- GIVEN `(EXTINGUISHER, QUARTERLY)` has an `active` version
- WHEN any sequence of supported operations is performed on that lineage
- THEN it MUST still have exactly one `active` version

### Requirement: Version Numbers Are Gapless Audit Facts

The system MUST assign `version` per `(elementType, frequency)` lineage,
starting at 1 and incrementing by 1 for each activation. A version
number MUST be meaningful only once activated: a draft that is
soft-deleted or that fails activation MUST NOT consume a number, so an
activated lineage's version sequence MUST have no gaps.

#### Scenario: Discarded draft leaves no gap
- GIVEN `(EXTINGUISHER, QUARTERLY)` has an `active` version 1
- WHEN a `SYSTEM_ADMIN` creates a draft, soft-deletes it, then creates and activates another draft
- THEN the newly activated version MUST be 2, not 3

#### Scenario: Versions increment per lineage, independently
- GIVEN `(EXTINGUISHER, QUARTERLY)` is at version 2
- WHEN a `SYSTEM_ADMIN` activates the first template for `(EXTINGUISHER, ANNUAL)`
- THEN that template's `version` MUST be 1

### Requirement: List and Read Templates

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
non-soft-deleted templates with their `elementType`, `frequency`,
`name`, `version` and `status`, and to read a single template together
with its ordered questions. A non-existent or soft-deleted template id
MUST be rejected with 404 `code: REVIEW_TEMPLATE_NOT_FOUND`.

#### Scenario: Admin lists templates across lineages and statuses
- GIVEN templates exist in `draft`, `active` and `retired` status
- WHEN a `SYSTEM_ADMIN` lists templates
- THEN the response MUST be 2xx and MUST include all three, each with its `version` and `status`

#### Scenario: Admin reads a template with its ordered questions
- GIVEN a template with a non-empty selection
- WHEN a `SYSTEM_ADMIN` reads it
- THEN the response MUST include its questions in their stored `order`

#### Scenario: Soft-deleted drafts excluded
- GIVEN a soft-deleted draft exists
- WHEN a `SYSTEM_ADMIN` lists templates
- THEN it MUST NOT appear

#### Scenario: Unknown template id rejected
- GIVEN a template id that does not exist or is soft-deleted
- WHEN a `SYSTEM_ADMIN` reads it
- THEN the response MUST be 404 with `code: REVIEW_TEMPLATE_NOT_FOUND`

### Requirement: Only Drafts May Be Soft-Deleted

The system MUST allow an authenticated `SYSTEM_ADMIN` to soft-delete a
`draft` template via `deletedAt`, and MUST reject soft-deleting an
`active` or `retired` template with 409 `code:
REVIEW_TEMPLATE_NOT_EDITABLE` — frozen versions stay fully visible as
historical records (ADR-010). Restoring a soft-deleted draft is out of
scope.

#### Scenario: Admin soft-deletes a draft
- GIVEN a `draft` template
- WHEN a `SYSTEM_ADMIN` soft-deletes it
- THEN the response MUST be 2xx, its `deletedAt` MUST be set, and the lineage MUST accept a new draft

#### Scenario: Soft-deleting a frozen template rejected
- GIVEN an `active` or `retired` template
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete it
- THEN the response MUST be 409 with `code: REVIEW_TEMPLATE_NOT_EDITABLE` and the template MUST remain visible

### Requirement: No Review Session Surface

The system MUST NOT introduce any `ReviewSession`, `ElementReviewEntry`
or `QuestionAnswer` table, model, route, use case or page in this
slice. Templates are authored here and consumed in the FR-007 slice.

#### Scenario: No session artifacts exist
- GIVEN the shipped schema, routes and pages are inspected
- WHEN they are searched for `ReviewSession`, `ElementReviewEntry` or `QuestionAnswer`
- THEN none MUST be found
