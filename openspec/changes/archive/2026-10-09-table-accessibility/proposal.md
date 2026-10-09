# Proposal: Accessible web tables

## Intent

None of the 9 web tables has a `<caption>` or `scope` on its header cells (tech-debt #14). Screen-reader users hear an unnamed table and get weaker header-to-cell association. This change gives every table an accessible name and explicit column scope, with no visual change.

## Scope

### In Scope
- All 9 tables in `apps/web/src/pages/`: ChecklistQuestionsList, CommunitiesList, CommunityElementsList, MaintenanceCompaniesList, ReviewHistory, ReviewSchedule, ReviewTemplatesList, ReviewSessions, UsersList. A grep found no other `<table>` in `apps/web/src`, and no `<th>` in any `<tbody>`.
- A visually hidden `<caption>` on each table, using a new `visually-hidden` utility in `apps/web/src/index.css` (the standard clip pattern, still exposed to assistive tech).
- The caption repeats the nearest heading through its existing i18n call, so there are no new strings:
  - Single-table pages use the page `h1`.
  - ReviewTemplatesList uses each group's `h2` (element type + frequency).
  - ChecklistQuestionsList uses each group's `h2` (element type).
- `scope="col"` on every `<thead>` `<th>`, including the empty action-column headers.

### Out of Scope
- `scope="row"`, because no tbody `<th>` exists.
- Changes to empty, loading or error states, column layout or styling.
- A wider accessibility audit (forms, landmarks, focus).
- Any backend change. Web-only is deliberate: this is purely a markup accessibility concern.

## Capabilities

### New Capabilities
- `web-table-accessibility`: every web data table has an accessible name equal to its nearest heading, provided by a visually hidden caption, and every column header has `scope="col"`. The spec lists the 9 tables.

### Modified Capabilities
- None. The 9 owning `*-ui` specs do not specify table markup. Changing each one would mean copying 9 full `### Requirement:` blocks for one cross-cutting rule. A single new capability is the thinnest option (ADR-006).

## Approach

Edit the markup in place. No shared table component, because extracting one is beyond this slice. Add one CSS utility, declared outside `@media print`. List pages are not print surfaces, and the clip pattern keeps the caption hidden in print too. Under Strict TDD (ADR-016), each page test first asserts `getByRole('table', { name })`, with one name per group on grouped pages, and fails before the change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/index.css` | Modified | `visually-hidden` utility |
| `apps/web/src/pages/*{ListPage,HistoryPage,SchedulePage,SessionsPage}.tsx` (9 files) | Modified | `<caption>` plus `scope="col"` |
| matching `*.test.tsx` | Modified | Accessible-name assertions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A caption duplicates the heading for screen-reader users | Low | Accepted: a table name is announced in a different context than a heading |
| The utility is mis-written and the caption shows | Low | Browser check confirms it is invisible but present in the accessibility tree |
| Tests break when the visible text appears twice (`getByText`) | Med | Scope the queries or switch them to role queries |

## Rollback Plan

Revert the PR. It is markup and CSS only, with no data or API impact.

## Dependencies

- None. The PR must pass the `ci` check (ADR-017).

## Success Criteria

- [ ] Every rendered table resolves via `getByRole('table', { name: <heading> })`. On grouped pages that means one table per group.
- [ ] Every thead `<th>` has `scope="col"`.
- [ ] A browser check confirms that the caption is not visible and is exposed in the accessibility tree.

## Size

About 60-90 changed code lines, 120-200 test lines and about 0 doc lines (only the openspec artifacts). The plan is one implementation PR (`table-accessibility/01-captions-and-scope`) plus an archive PR (`table-accessibility/02-archive`), delivered stacked-to-main with ask-on-risk.
