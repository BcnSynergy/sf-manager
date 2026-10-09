# Design: Accessible web tables

## Technical Approach

Edit the markup of the 9 table pages in place, add one CSS utility, and add no new component and no new string. Each `<table>` gets a first-child `<caption className="visually-hidden">` that renders the same `t()` expression as its nearest heading. Every `<thead>` `<th>` gets `scope="col"`. A grep of `apps/web/src/**/*.tsx` finds exactly 9 `<table>` elements and no `<th>` outside a `<thead>`, which confirms the proposal's inventory.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|----------|----------|-----------|
| D1 | `.visually-hidden` in `apps/web/src/index.css`, declared at top level after the `.app-nav` screen rule (`index.css:134-137`) and before `@media print` (`:148`). It uses the standard clip pattern: `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; border: 0;`. It has no `!important`, because no rule in the file targets `caption`. | `display: none` / `hidden` (this removes the caption from the accessibility tree); declaring it inside `@media print`; `!important` | A top-level rule applies on screen and in print, so the caption stays hidden in both. No print rule in `index.css` matches `caption` or `.visually-hidden`. The `.label-print` and `.review-document-print` scopes (`:162-223`) contain no table, so the review document print flow is untouched. |
| D2 | Single-table pages repeat the h1's literal key inline: `<caption className="visually-hidden">{t('users.list.title')}</caption>`. Every page already repeats that key 3 times (for example `UsersListPage.tsx:124,133,141`). | A shared `<TableCaption>` component; `aria-label`; `aria-labelledby` pointing at the heading | A one-line literal key is the thinnest option, and a component would add a file and a test for nothing. `<caption>` is the native table name, as the product decision requires. `aria-labelledby` would need `useId` wiring for the grouped pages. |
| D3 | ReviewTemplatesList computes `const groupTitle = \`${t(mapElementTypeToLabelKey(elementType))} — ${t(mapReviewFrequencyToLabelKey(frequency))}\`` inside the existing block-bodied map callback (`ReviewTemplatesListPage.tsx:95-99`). Both the `<h2>` (`:101-103`) and the caption render `{groupTitle}`. | Duplicating the two-call JSX expression | The h2 and the caption can then never drift. The h2's `textContent` stays the same string. |
| D4 | ChecklistQuestionsList repeats `{t(mapElementTypeToLabelKey(elementType))}` (`ChecklistQuestionsListPage.tsx:132`) inline in the caption. The expression-bodied map at `:130` stays as it is. | Converting the map to a block body to hold a const | It is a single call. Converting the map to a block body costs more lines than repeating it. |
| D5 | `scope="col"` goes on every thead `<th>`, including the empty action headers. See the table below. | `scope="row"` | No tbody `<th>` exists. |

### `<table>` / `<th>` inventory (`apps/web/src/pages/`)

| File | `<table>` | thead `<th>` lines | Caption source |
|------|-----------|--------------------|----------------|
| ChecklistQuestionsListPage.tsx | 133 | 136-138 | group h2 `:132` |
| CommunitiesListPage.tsx | 101 | 104-107 (107 empty) | h1 `community.list.title` `:91` |
| CommunityElementsListPage.tsx | 103 | 106-114 | h1 `inspectableElement.list.title` `:91` |
| MaintenanceCompaniesListPage.tsx | 87 | 90-93 (93 empty) | h1 `maintenanceCompany.list.title` `:80` |
| ReviewHistoryPage.tsx | 67 | 70-73 (73 empty) | h1 `reviewHistory.list.title` `:63` |
| ReviewSchedulePage.tsx | 59 | 62-66 | h1 `reviewSchedule.title` `:55` |
| ReviewTemplatesListPage.tsx | 104 | 107-110 | group h2 `:101-103` (D3) |
| ReviewSessionsPage.tsx | 74 | 77-78 (78 empty) | h1 `reviewSession.entry.title` `:64` |
| UsersListPage.tsx | 151 | 154-158 (158 empty) | h1 `users.list.title` `:141` |

## Data Flow

    t(heading key) ──┬──> <h1>/<h2> (visible)
                     └──> <caption class="visually-hidden"> ──> table accessible name

## File Changes

| File | Action | Est. changed lines |
|------|--------|--------------------|
| `apps/web/src/index.css` | Add the utility and its comment | ~16 |
| The 9 pages above | Add a caption and change 40 `<th>` lines | ~95 (40 lines changed in place, each counted as -1/+1, plus 9 captions and the D3 const) |
| The 9 matching `*.test.tsx` files | Add assertions | ~120-170 |

Totals: about 110 lines of code, 120-170 of tests and 0 of docs, roughly 230-280 in all, which is under the 400-line budget.

## Testing Strategy (Strict TDD, RED first)

| Page | Assertion (add to the existing rows-render test, or one new `it`) |
|------|------------------------------------------------------------------|
| 7 single-table pages | `const table = screen.getByRole('table', { name: i18n.t('<h1 key>') })`. Every `within(table).getAllByRole('columnheader')` has `toHaveAttribute('scope', 'col')`. `table.querySelector('caption')` has `toHaveClass('visually-hidden')`. |
| ReviewTemplatesList | Extend the fixture to 2 lineages (EXTINGUISHER×QUARTERLY and ×ANNUAL). Assert that `getAllByRole('table')` has length 2, that `getByRole('table', { name: 'Fire extinguisher — Quarterly' })` and `… — Annual` each sit inside their own `review-template-group-*` section, and the scope and class checks. |
| ChecklistQuestionsList | Assert one table named `'Fire extinguisher'` inside `checklist-question-group-EXTINGUISHER`, plus the scope and class checks. A second group cannot be built: `elementTypeSchema` is `z.enum(['EXTINGUISHER'])` (`packages/validation/src/inspectable-element/inspectable-element.schema.ts:18`). |

Every test resolves the caption through the table's accessible name (dom-accessibility-api computes names from `<caption>`) and never through `getByText`. jsdom does not load `index.css`, so the CSS itself is verified only in the browser.

Existing-test impact: none of the 9 test files queries heading text with `getByText`. The only `getByText` calls are `within(row)` status labels (`ReviewSchedulePage.test.tsx:126,138,164,182-183`). No other web test queries these titles. The `toHaveTextContent` checks on group sections (`ChecklistQuestionsListPage.test.tsx:67`, `ReviewTemplatesListPage.test.tsx:66-67`) are substring checks and still pass. The `document.body.textContent` raw-enum check (`ReviewSchedulePage.test.tsx:197-209`) and the columnheader count and text check (`:249-256`) are unaffected, because a caption is not a columnheader. No existing test needs a fix. If one breaks during apply, switch it to `getByRole('heading', { name })` and do not delete the assertion.

## Browser Verification (`claude-in-chrome`, dev seed)

1. Check Users (single table), Review templates (2 groups from the seed) and Review schedule.
2. With `javascript_tool`, `getBoundingClientRect()` of each `caption` is 1×1 and the computed `clip-path` is `inset(50%)`. A screenshot shows no visible caption text.
3. In `read_page`, each table shows its heading name. On Review templates there are two distinct names.
4. For layout shift, compare the table's `offsetTop` and a screenshot before the change (on `main`) and after it.
5. For print, copy the `@media print` rules into a screen `<style>` on the review document and confirm that its rendering is unchanged.

## Delivery

Use the stacked-to-main chain with ask-on-risk.
- **PR 1** is `table-accessibility/01-captions-and-scope`, titled `feat(web): PR 1/2 — table captions and column scope`.
- **PR 2** is `table-accessibility/02-archive`.

## Migration / Rollout

No migration is required. Revert the PR to roll back.

## Open Questions

- None blocking. A shared table component is deferred (ADR-006).
