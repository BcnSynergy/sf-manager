# UI Restyle: Form Pages

Locator: `odd/tasks/ui-restyle-forms.md` (Engram mirror: `odd/ui-restyle-forms/tasks`).
Route: ODD (visual restyle only, no behavior change; the user accepted the proposal 2026-10-20). Delivery: 7-PR chain, `stacked-to-main`, branches `ui-restyle-forms/<NN>-<slug>`. Test runner: Vitest (`apps/web`).

## Specs

- S1: Add only the structural form classes the pages need to `apps/web/src/index.css`: `.sf-form` (spacing between fields), `.sf-field` (groups a label, its control and its error), `.sf-choice` (a checkbox with its label). `.sf-error` and `.sf-hint` only if a page has per-field errors or hints. Do not add `.sf-input`, `.sf-select`, the custom select chevron or `.sf-segmented`: the global control styles stay.
- S2: Every form page follows one pattern: `header.sf-page-header`; `form.sf-form` with one `div.sf-field` per label and control; the form error as `div.sf-alert.sf-alert-danger` with `role="alert"`; the submit as `sf-btn sf-btn-primary` inside `sf-actions`; edit pages that load data show `sf-empty` loading, not-found and error states.
- S3: Visual only: no change to flows, routes, permissions, data, validation or test ids.
- S4: The 14 form pages are covered by the chain below. PR 7 rechecks the `review-session-ui` "left as it is" clause (the user's 2026-10-20 reading: it forbids features, not restyles).

## Tasks

| ID  | Specs      | Pages                                                                  | Route  | Status  | Commit / PR |
| --- | ---------- | ---------------------------------------------------------------------- | ------ | ------- | ----------- |
| T1  | S1, S2, S3 | CSS classes + `CommunityCreatePage`, `CommunityEditPage`               | inline | done    | #257        |
| T2  | S2, S3     | `MaintenanceCompanyCreatePage`, `MaintenanceCompanyEditPage`           | inline | review  |             |
| T3  | S1, S2, S3 | `ReviewTemplateCreatePage`, `ChecklistQuestionCreatePage`, `…EditPage` | inline | pending |             |
| T4  | S2, S3     | `InspectableElementCreatePage`, `InspectableElementEditPage`           | inline | pending |             |
| T5  | S2, S3     | `UserCreatePage`, `UserEditPage`                                       | inline | pending |             |
| T6  | S2, S3     | `OrganizationProfilePage`                                              | inline | pending |             |
| T7  | S2, S3, S4 | `ReviewSessionNewPage`, `ReviewSessionElementPage`                     | inline | pending |             |

Route evidence: one PR per task, written inline by the parent; no writer trigger (units are sequential, not parallel).

## Log

- L1 (2026-10-20, user, verbatim): "no, queria decir que me parecia bien la propuesta" — accepting the proposal: global control styles plus structural classes only (`.sf-form`, `.sf-field`, `.sf-choice`), and the 7-PR chain by domain.
- L2 (2026-10-20): analysis. 14 form pages, none with `sf-` classes. `index.css` styles `input`, `select`, `textarea`, `fieldset`, `legend` and `button` globally with the design system tokens; the design system bundle defines `.sf-form`, `.sf-field`, `.sf-label`, `.sf-input`, `.sf-select`, `.sf-error`, `.sf-hint`, `.sf-fieldset`, `.sf-choice`, `.sf-segmented`, none in `index.css`. Next: T1.
- L3 (2026-10-20): T1 on `ui-restyle-forms/01-community`. Added `.sf-form` and `.sf-field` only; `.sf-choice` waits for T3, the first page with a checkbox (ADR-006: add what the slice needs). Community forms have no per-field errors, so no `.sf-error`. 6 RED tests observed failing, then GREEN; web suite 1284 passed, `tsc -b`, lint and `format:check` clean. Browser-verified as admin: create with the empty-submit alert, edit prefilled, not-found, light theme, 390px (no horizontal scroll), no console errors. A real save was not exercised (it would change seeded data); the submit handlers are unchanged and covered by the existing tests. EN-69 recounted to sixteen pages.
- L4 (2026-10-20): T1 merged as #257 (commits 5d25d98, d16f7fd). Pre-merge review note: EN-69 named only the community detail page as having the header once, but create-only forms also have it once; reworded in T2.
- L5 (2026-10-20): T2 on `ui-restyle-forms/02-maintenance-company`. The edit page's Delete moves into the page header as `sf-btn-danger` (the detail pages' precedent, one primary per view: Save), with its failure as a danger alert under the header. 6 RED tests observed failing, then GREEN. EN-69 reworded and recounted to eighteen pages. Browser-verified as admin: create with the empty-submit alert, edit prefilled, Delete confirmed on a seeded company with an active user (refused with `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`, shown as the danger alert under the header; the row stays undeleted per psql), light theme, 390px (no horizontal scroll), no console errors. Web suite 1290 passed, `tsc -b`, lint and `format:check` clean.
