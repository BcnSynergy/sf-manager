# Functional Requirements

Running list of functional requirements identified so far, tracked here as
they surface. Each references the domain model / ADR that shapes it.
Status `identified` = named but not yet detailed into acceptance criteria;
detail gets added when a requirement is about to be worked on.

## Management (CRUD)

| FR | Description | Scope note | Status |
|----|-------------|-------------|--------|
| FR-001 | Manage communities | Admin only | identified |
| FR-002 | Manage maintenance companies | Admin only | identified |
| FR-003 | Manage users and their role/scope | Admin only | identified |
| FR-004 | Manage inspectable elements per community | Admin + community representative (their own community) | identified |
| FR-005 | Manage the checklist question pool (available questions, scoped by element type) | Admin only | identified |
| FR-005b | Manage review templates: create a new version by selecting questions from the pool, activate it (retiring the previous version) — the actual "revisión trimestral"/"revisión anual" repository, per [domain model](../architecture/domain-model-inspections.md#reviewtemplate) | Admin only | identified |

**Not a CRUD**: review types (M/T/S/A) are a fixed code-level enum per
[ADR-008](../adr/ADR-008-element-type-extensibility-typed-catalog.md), not
a managed catalog — the original "manage review types" request is satisfied
by FR-005b (template management) plus the enum being used consistently
across FR-005/FR-007, not by an admin screen to create new frequency
values.

## Element identification

| FR | Description | Status |
|----|-------------|--------|
| FR-006 | Print label(s) for an inspectable element: single element, or all elements of a community (batch sheet) — renders the element's `code` as a QR plus the code as plain text, per the [domain model](../architecture/domain-model-inspections.md) | identified |

## Review workflow

| FR | Description | Status |
|----|-------------|--------|
| FR-007 | Perform a review session: open a session against a community's currently `active` `ReviewTemplate` for an element type, scan/enter each element's `code`, answer its templated questions, repeat, complete the session | identified |
| FR-008 | View review history, per element and per community | identified |
| FR-009 | List overdue/upcoming reviews and send reminders to responsible parties | identified |
| FR-010 | Sign and export the completed review as a document, to send to the property management company | identified |

## Access & operations

| FR | Description | Status |
|----|-------------|--------|
| FR-011 | Authentication + scoped authorization per [ADR-005](../adr/ADR-005-authorization-model-scoped-rbac.md) | identified |
| FR-012 | Demo mode — no login required, highest role assigned, must be strictly gated to non-production environments per ADR-005 | identified |
