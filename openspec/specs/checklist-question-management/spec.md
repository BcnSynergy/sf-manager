# Checklist Question Management

## Purpose

Admin-only CRUD over the **global** `ChecklistQuestion` pool — the set of
questions an admin can later draw from when building a `ReviewTemplate`.
Questions are global admin content scoped by `elementType`, not
per-community: routes are flat (`/checklist-questions`), with no
community parent. Entity shape is `id` (UUIDv7), `elementType`,
`frequencies` (non-empty set of `ReviewFrequency`), `text`, `deletedAt`
— no help text, no RIPCI clause reference, no required/optional flag, no
pool-level `order` (ordering belongs to `ReviewTemplateQuestion`), and no
separate `active` retire flag (deferred; `deletedAt` is the sole off
state, ADR-010). No pagination, search, bulk edit, restore, or audit
logging. This spec also introduces `ReviewFrequency`, the enumeration
both this capability and `review-template-management` depend on. Access
control is owned by the `authorization` spec.

## Requirements

### Requirement: Review Frequency Enumeration

The system MUST define `ReviewFrequency` with exactly four values:
`MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`. Following ADR-008 and
the `ElementType` precedent, the value set MUST be declared three ways —
an authoritative TypeScript union, a PostgreSQL enum, and a shared Zod
schema — and those three declarations MUST be proven to agree, not
assumed to. No fifth value, and no free-text frequency, is accepted
anywhere.

#### Scenario: The three declarations agree
- GIVEN the TypeScript union, the PostgreSQL enum, and the Zod schema for `ReviewFrequency`
- WHEN their value sets are compared at test time
- THEN all three MUST contain exactly `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`, with no member present in one and absent from another

#### Scenario: An unknown frequency value is rejected
- GIVEN a request carrying a frequency value outside the four declared values
- WHEN it is validated
- THEN the response MUST be a 4xx validation error and no record MUST be written

### Requirement: Create Checklist Question

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a
`ChecklistQuestion` by providing `elementType`, a **non-empty** set of
`frequencies`, and `text`. The system MUST generate the `id` (UUIDv7)
and initialize `deletedAt` to `null`. `text` MUST be stored and returned
verbatim as admin-authored free text — it is runtime content, NOT an
i18n key, and MUST NOT require a code change or deploy to add or alter.
Duplicate `text` values MUST NOT be rejected: no uniqueness is enforced
on any field.

#### Scenario: Admin creates a question
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a valid `elementType`, a non-empty `frequencies` set, and `text`
- THEN the response MUST be 2xx and MUST include the generated `id`

#### Scenario: Empty frequencies set rejected
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a question with an empty `frequencies` set
- THEN the response MUST be a 4xx validation error and no question MUST be created

#### Scenario: Missing or blank required field rejected
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a request missing `elementType`, `frequencies`, or `text`, or with blank `text`
- THEN the response MUST be a 4xx validation error and no question MUST be created

#### Scenario: A question may carry several frequencies
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit `frequencies` containing both `QUARTERLY` and `ANNUAL`
- THEN the response MUST be 2xx and both values MUST be persisted

#### Scenario: Duplicate text is allowed
- GIVEN an active question already exists with a given `text`
- WHEN a `SYSTEM_ADMIN` creates another question with the identical `text`
- THEN the response MUST be 2xx and both questions MUST coexist

### Requirement: List Checklist Questions

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
non-soft-deleted `ChecklistQuestion` records, each with its
`elementType`, `frequencies` and `text`. Soft-deleted questions MUST NOT
appear. The pool MAY legitimately be empty.

#### Scenario: Admin lists the pool
- GIVEN one or more active questions exist
- WHEN a `SYSTEM_ADMIN` calls the list endpoint
- THEN the response MUST be 2xx with an array of the active questions and their fields

#### Scenario: Soft-deleted questions excluded
- GIVEN a soft-deleted question exists alongside active ones
- WHEN a `SYSTEM_ADMIN` lists the pool
- THEN the soft-deleted question MUST NOT appear

#### Scenario: Empty pool is a valid response
- GIVEN no questions have ever been created
- WHEN a `SYSTEM_ADMIN` lists the pool
- THEN the response MUST be 2xx with an empty array, not an error

### Requirement: Update Checklist Question

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing question's `text` and/or `frequencies`. `elementType` is NOT
updatable — a question never changes type in this slice. `frequencies`
MUST remain non-empty. A non-existent or soft-deleted question id MUST
be rejected with 404 `code: CHECKLIST_QUESTION_NOT_FOUND`.

#### Scenario: Admin edits a question's text at runtime
- GIVEN an active question exists
- WHEN a `SYSTEM_ADMIN` submits new `text` for it
- THEN the response MUST be 2xx and subsequent reads MUST return the new `text`, with no code change or redeploy involved

#### Scenario: Update to an empty frequencies set rejected
- GIVEN an active question exists
- WHEN a `SYSTEM_ADMIN` submits an update with an empty `frequencies` set
- THEN the response MUST be a 4xx validation error and the question MUST be unchanged

#### Scenario: Update targets a missing or soft-deleted question
- GIVEN a question id that does not exist or is soft-deleted
- WHEN an admin attempts to update it
- THEN the response MUST be 404 with `code: CHECKLIST_QUESTION_NOT_FOUND`

### Requirement: Soft-Delete Checklist Question Is Never Blocked

The system MUST allow an authenticated `SYSTEM_ADMIN` to soft-delete a
question via `deletedAt`, and MUST NOT block that deletion for any
reason related to template references. Deleting a question MUST remove
it from the ordered selection of every `draft` template that had
selected it. Frozen (`active` or `retired`) templates MUST NOT be
modified and MUST continue to display the question from their own
snapshot (see `review-template-management`). This is deliberately the
inverse of the `community` / `maintenance-company` delete guards: a
frozen template is an audit snapshot, not a live dependency. A
non-existent or already-soft-deleted question id MUST be rejected with
404 `code: CHECKLIST_QUESTION_NOT_FOUND`.

#### Scenario: Admin soft-deletes an unreferenced question
- GIVEN an active question that no template references
- WHEN a `SYSTEM_ADMIN` soft-deletes it
- THEN the response MUST be 2xx and its `deletedAt` MUST be set

#### Scenario: Deletion succeeds even when frozen templates reference the question
- GIVEN an `active` template whose frozen selection includes question Q
- WHEN a `SYSTEM_ADMIN` soft-deletes Q
- THEN the response MUST be 2xx, Q MUST be soft-deleted, and no reference to a delete guard or blocking error code MUST occur

#### Scenario: Deletion removes the question from drafts
- GIVEN a `draft` template whose selection includes question Q
- WHEN a `SYSTEM_ADMIN` soft-deletes Q
- THEN reading that draft afterwards MUST NOT include Q in its selection

#### Scenario: Delete targets a missing or already-deleted question
- GIVEN a question id that does not exist or is already soft-deleted
- WHEN an admin attempts to soft-delete it
- THEN the response MUST be 404 with `code: CHECKLIST_QUESTION_NOT_FOUND`

### Requirement: The Pool Ships Empty

The system MUST ship with no pre-populated checklist questions. There
MUST be no seeded RIPCI question set, no fixture migration, no import
path, and no "starter set" action. The first question in any
environment MUST be authored by an admin through the product's own
create path.

#### Scenario: A freshly migrated database has no questions
- GIVEN a database provisioned by running the migrations only
- WHEN the question pool is read
- THEN it MUST be empty
