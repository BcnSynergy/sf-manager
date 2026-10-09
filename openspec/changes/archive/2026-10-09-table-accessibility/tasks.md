# Tasks: Accessible web tables

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~230-280 (code ~110, tests ~120-170, docs 0); PR 2 archive only (docs) |
| 400-line budget risk | Low |
| Chained PRs recommended | No (PR 2 is archive-only, per convention) |
| Suggested split | PR 1 (captions + scope) then PR 2 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `visually-hidden` utility + captions and `scope="col"` on all 9 tables | PR 1/2 | Base: main. Branch `table-accessibility/01-captions-and-scope`. Title `feat(web): PR 1/2 — table captions and column scope` |
| 2 | Verify report, archive, spec merge | PR 2/2 | Base: main (after PR 1 merges). Branch `table-accessibility/02-archive` |

Strict TDD: RED then GREEN per unit; apply records a "TDD Cycle Evidence" table. One commit per work unit (tests with code); each must pass `npx tsc -b` in apps/web. Run `npm run test --workspace=apps/web`. Paths are under `apps/web/src/`. Test queries use the table's accessible name, never `getByText`.

## Phase A: PR 1 (sdd-apply)

Unit A, utility (D1; Caption Visually Hidden but Exposed)
- [x] A.1 `index.css`: add `.visually-hidden` (D1 clip pattern, no `!important`) after `.app-nav` rule, before `@media print`, with a short comment. jsdom ignores CSS, so TDD N/A; verified in G.1.

Unit B, single-table pages (D2, D5; Single-table page named by h1, Header cells scoped, Empty action header scoped, No row headers, Caption follows language)
- [x] B.1 RED: in `pages/{Communities,CommunityElements,MaintenanceCompanies}ListPage.test.tsx`, assert `getByRole('table', { name: i18n.t('<h1 key>') })`, every `columnheader` has `scope="col"`, caption has class `visually-hidden`, no `scope="row"`.
- [x] B.2 GREEN: add first-child `<caption className="visually-hidden">{t('<h1 key>')}</caption>` and `scope="col"` on each thead `<th>` per the design inventory.
- [x] B.3 RED: same assertions in `ReviewHistoryPage`, `ReviewSchedulePage`, `ReviewSessionsPage`, `UsersListPage` tests; add one ES (or CA) caption-equals-h1 assertion in one page test.
- [x] B.4 GREEN: captions and `scope="col"` in those 4 pages. Existing `ReviewSchedulePage.test.tsx` columnheader and `textContent` checks must still pass.
- [x] B.5 Empty/loading/error state: assert no `caption` in at least one page's empty state (Pages with no table unchanged).

Unit C, grouped pages (D3, D4; per-group scenarios)
- [x] C.1 RED: `ReviewTemplatesListPage.test.tsx`: extend fixture to 2 lineages (EXTINGUISHER x QUARTERLY and ANNUAL); assert 2 tables, names `Fire extinguisher — Quarterly` / `— Annual`, each in its own `review-template-group-*`, distinct names, scope and class checks.
- [x] C.2 GREEN: `ReviewTemplatesListPage.tsx`: `const groupTitle` in the map callback; use in `<h2>` and caption; `scope="col"`.
- [x] C.3 RED: `ChecklistQuestionsListPage.test.tsx`: one table named `Fire extinguisher` inside `checklist-question-group-EXTINGUISHER`, scope and class checks.
- [x] C.4 GREEN: `ChecklistQuestionsListPage.tsx`: inline `{t(mapElementTypeToLabelKey(elementType))}` caption; `scope="col"`.

Unit D, wrap-up
- [x] D.1 Run `npx tsc -b`, web lint, full `npm run test --workspace=apps/web`; confirm no locale JSON diff (No new strings) via `git diff --stat`.
- [x] D.2 Commit by work unit: utility; single-table pages; grouped pages.

## Gate (orchestrator)

- [x] G.1 Browser verification (`claude-in-chrome`, dev seed, user logs in) on Users, Review templates (2 groups), Review schedule: caption `getBoundingClientRect()` 1x1, `clip-path: inset(50%)`, no visible caption in screenshot, names in `read_page` (two distinct on templates), no layout shift (`offsetTop` and screenshot vs `main`), and print check by copying `@media print` rules into a screen `<style>` on the review document. Report browser- or test-verified.
  - Evidence (2026-10-09, browser-verified, locale `ca`, dev seed, admin): Users (1 table), Review templates (2 tables: `Extintor — Trimestral`, `Extintor — Anual`), Review schedule (1 table). Every caption equals its heading, is the table's first child, measures 1x1 with `clip-path: inset(50%)`, and is invisible in screenshots; every thead `th` has `scope="col"`, with no `scope="row"`. Removing the caption leaves the thead position unchanged (0px shift). `read_page` lists the caption text inside the table node, so it stays in the accessibility tree. Print check deviation: the review document renders no table, so the 11 `@media print` rules were injected as a screen `<style>` on Review schedule instead; the caption stayed 1x1 and hidden, and no print rule targets `caption` or `.visually-hidden`.
- [x] G.2 Fresh-context PR review before push and before merge; user confirms push, PR and merge.
  - Evidence: Fresh-context review before push: APPROVE WITH NITS, no blockers; user approved merge on it with code unchanged; PR #203 merged at 212e137, CI green.

## Phase B: Close

- [x] B.1 `sdd-verify` against spec scenarios after PR 1 merges.
  - Evidence: `verify-report.md`, PASS WITH WARNINGS, 0 CRITICAL.
- [x] B.2 `sdd-archive` via `table-accessibility/02-archive`: merge the new capability into `openspec/specs/web-table-accessibility/spec.md`; orchestrator does `git mv` and commit.
