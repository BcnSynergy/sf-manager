# Functional Requirements

Running list of functional requirements identified so far, tracked here as
they surface. Each references the domain model / ADR that shapes it.
Status `identified` = named but not yet detailed into acceptance criteria;
detail gets added when a requirement is about to be worked on.
`partial` = a slice shipped (API and minimal web UI, per ADR-006) but part
of the requirement — typically an actor scope such as the `MANAGER` +
`MANAGE_*` capability route — is explicitly deferred; `delivered` = shipped
and archived with every actor scope and function in the description
satisfied on the current platforms; `closed` = a `delivered` requirement
built across several slices and declared complete (FR-008). Change names
refer to `openspec/changes/archive/`.

## Management (CRUD)

| FR | Description | Scope note | Status |
|----|-------------|-------------|--------|
| FR-001 | Manage communities | `SYSTEM_ADMIN`, or `MANAGER` with `MANAGE_COMMUNITIES` | **partial** (`community` + `community-minimal-ui`) — `SYSTEM_ADMIN` only; the `MANAGER` + `MANAGE_COMMUNITIES` route is deferred |
| FR-002 | Manage maintenance companies | `SYSTEM_ADMIN`, or `MANAGER` with `MANAGE_MAINTENANCE_COMPANIES` | **partial** (`maintenance-company`) — `SYSTEM_ADMIN` only; the `MANAGER` + `MANAGE_MAINTENANCE_COMPANIES` route is deferred |
| FR-003 | Manage users and their role/scope | `SYSTEM_ADMIN` only for property-management-side users; `MAINTENANCE_COMPANY_MANAGER` may CRUD their own company's technicians only (per ADR-011) | **partial** (`user-management-roles` + `users-minimal-ui`) — `SYSTEM_ADMIN` management shipped; the company manager's scoped CRUD on their own technicians (onboarding/disabling) is deferred |
| FR-004 | Manage inspectable elements per community | `SYSTEM_ADMIN`/`MANAGER` with `MANAGE_INSPECTABLE_ELEMENTS`, or a community representative (their own community only) | **partial** (`inspectable-elements`) — `SYSTEM_ADMIN` only; the `MANAGER` + `MANAGE_INSPECTABLE_ELEMENTS` route and the community representative's own-community access are deferred |
| FR-005 | Manage the checklist question pool (available questions, scoped by element type) | `SYSTEM_ADMIN`, or `MANAGER` with `MANAGE_CHECKLIST_CONTENT` | **partial** (`checklist-management`) — `SYSTEM_ADMIN` only; the `MANAGER` + `MANAGE_CHECKLIST_CONTENT` route is deferred |
| FR-005b | Manage review templates: create a new version by selecting questions from the pool, activate it (retiring the previous version) — the actual "revisión trimestral"/"revisión anual" repository, per [domain model](../architecture/domain-model-inspections.md#reviewtemplate) | `SYSTEM_ADMIN`, or `MANAGER` with `MANAGE_CHECKLIST_CONTENT` | **partial** (`checklist-management`) — `SYSTEM_ADMIN` only; the `MANAGER` + `MANAGE_CHECKLIST_CONTENT` route is deferred |
| FR-013 | Manage the property management company's own corporate profile used on reports (name, tax ID, address, logo) — per [ADR-012](../adr/ADR-012-property-management-company-profile-entity.md) | `SYSTEM_ADMIN`, or `MANAGER` with `MANAGE_ORGANIZATION_PROFILE` | **partial** (`organization-profile`) — `SYSTEM_ADMIN` only, name/legalName/taxId/address/phone/email; the `MANAGER` + `MANAGE_ORGANIZATION_PROFILE` route and logo upload (`logoAssetId` stays null, no object storage) are deferred |

**Not a CRUD**: review types (M/T/S/A) are a fixed code-level enum per
[ADR-008](../adr/ADR-008-element-type-extensibility-typed-catalog.md), not
a managed catalog — the original "manage review types" request is satisfied
by FR-005b (template management) plus the enum being used consistently
across FR-005/FR-007, not by an admin screen to create new frequency
values.

## Element identification

| FR | Description | Status |
|----|-------------|--------|
| FR-006 | Print label(s) for an inspectable element: single element, or all elements of a community (batch sheet) — renders the element's `code` as a QR plus the code as plain text, per the [domain model](../architecture/domain-model-inspections.md) | **partial** (`label-printing`) — single-element QR label shipped; the community batch sheet is deferred until a real need appears |

## Review workflow

| FR | Description | Status |
|----|-------------|--------|
| FR-007 | Perform a review session: open a session against a community's currently `active` `ReviewTemplate` for an element type, scan/enter each element's `code`, answer its templated questions, repeat, complete the session | **delivered** (`review-session`) — web only; no camera scanning or offline mode, and mobile clients are deferred per ADR-006 |
| FR-008 | View review history, per element and per community — visibility scoped per [ADR-011](../adr/ADR-011-expanded-roles-and-auth-architecture.md): a technician sees only their own sessions, a `MAINTENANCE_COMPANY_MANAGER` sees all of their company's, a community representative sees their community's, `SYSTEM_ADMIN` sees the whole installation, `MANAGER` with `VIEW_ALL_REVIEWS` sees everything | **closed** — role-based visibility axis (technician, representative, company, `SYSTEM_ADMIN` installation-wide and `MANAGER` + `VIEW_ALL_REVIEWS`, capability-gated, resolved fresh per request) and the per-element history read (every past review of one inspectable element, across every session it was ever reviewed in, resolved through the same five scopes applied at entry level) are both live (`review-history` + `review-history-company-scope` + `review-history-admin-scope` + `review-history-manager-capability` + `review-history-per-element`) |
| FR-009 | List overdue/upcoming reviews and send reminders to responsible parties | identified |
| FR-010 | Sign and export the completed review as a document, to send to the property management company | identified |

## Access & operations

| FR | Description | Status |
|----|-------------|--------|
| FR-011 | Authentication + scoped authorization per [ADR-011](../adr/ADR-011-expanded-roles-and-auth-architecture.md) | **delivered** (`auth-minimal-skeleton`, `user-management-roles`, `nav-menu`) — only the `VIEW_ALL_REVIEWS` manager capability is active; refresh tokens, audit logging and MFA are deferred per ADR-011 |
| FR-012 | Demo mode — no login required, `SYSTEM_ADMIN` role assigned, must be strictly gated to non-production environments per ADR-011 | identified |
