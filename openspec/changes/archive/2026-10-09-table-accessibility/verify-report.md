# Verify Report: table-accessibility

Date: 2026-10-09. Base: main at 212e137 (PR #203 merged). Mode: Strict TDD. Store: hybrid.

## Verdict: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION)

## Commands (observed)
| Command | Result |
|---|---|
| `npx tsc -b` (apps/web) | exit 0, no errors |
| `npm run lint --workspace=apps/web` | exit 0, no output errors |
| `npm run test --workspace=apps/web` | exit 0; 65 files, 1107 tests passed |
| `git diff --stat 4de21bf~1 HEAD` | no locale/i18n JSON in the diff (No new strings) |

Coverage tool: not run (not part of the requested checks).

## Task state
All Phase A, D and G.1 tasks checked. G.2 is unchecked in tasks.md but evidenced as done (fresh review APPROVE WITH NITS, merge approved). Phase B (B.1 this verify, B.2 archive) pending.

## Spec compliance
| Requirement / Scenario | Evidence | Status |
|---|---|---|
| Name: single-table pages named by h1 (7 pages) | `<caption>` first child in CommunitiesListPage.tsx:102, CommunityElementsListPage.tsx:104, MaintenanceCompaniesListPage.tsx:88, ReviewHistoryPage.tsx:68, ReviewSchedulePage.tsx:60, ReviewSessionsPage.tsx:75, UsersListPage.tsx:152; tests assert `getByRole('table', {name: i18n.t(h1 key)})` (e.g. UsersListPage.test.tsx, CommunitiesListPage.test.tsx) | COMPLIANT |
| Name: review templates per group | ReviewTemplatesListPage.tsx:99-104 (`groupTitle` shared by h2 and caption); test asserts 2 tables, names `Fire extinguisher — Quarterly/Annual`, each inside its own group, 2 distinct captions | COMPLIANT |
| Name: checklist questions per group | ChecklistQuestionsListPage.tsx:134; test asserts one table named `Fire extinguisher` inside `checklist-question-group-EXTINGUISHER` | COMPLIANT (single enum value, per spec note) |
| Caption follows active language | ReviewSchedulePage.test.tsx: `es` test (try/finally restores `en`), caption equals h1, es differs from en | COMPLIANT (one page tested; shared mechanism) |
| Pages with no table unchanged | CommunitiesListPage.test.tsx: empty state has no table and no caption. Loading/error: browser-verified, not test-asserted (accepted) | COMPLIANT (partial test, browser-verified) |
| Caption hidden but exposed | index.css:143-155 clip pattern, no display:none/visibility:hidden; tests assert class `visually-hidden`; G.1 browser: 1x1, clip-path inset(50%), in a11y tree, 0px shift | COMPLIANT (browser-verified; jsdom ignores CSS) |
| Caption not in print | No print rule targets caption/.visually-hidden; G.1 injected print rules on Review schedule (deviation: review document has no table) | COMPLIANT (browser-verified, with recorded deviation) |
| All thead th have scope="col" | grep of all 9 pages shows scope="col" on every thead th (40 cells); tests loop over columnheaders with length guards | COMPLIANT |
| Empty action header scoped | `<th scope="col"></th>` in Communities:108, MaintenanceCompanies:94, ReviewHistory:74, ReviewSessions:79, UsersList:159; column counts asserted | COMPLIANT |
| No row headers | tests assert `[scope="row"]` is null; no tbody th | COMPLIANT |
| Scope limits: no new strings | No locale files in diff; locales.test.ts passes | COMPLIANT |

## Strict TDD compliance
| Check | Result | Details |
|---|---|---|
| TDD Cycle Evidence table reported | WARNING | Apply-progress (Engram #515) is a prose summary; no per-task RED/GREEN/triangulate/safety-net table |
| Tests exist for tasks | OK | 9/9 page test files modified; CSS task A.1 is TDD N/A (documented) |
| GREEN on execution | OK | 1107/1107 pass |
| RED history | Unverifiable | Commits bundle code with tests per unit; RED cannot be confirmed retroactively and is not fabricated |
| Assertion quality | OK | No tautologies; loops guarded by `toHaveLength`; no mocks-heavy tests. `toHaveClass('visually-hidden')` is a class assertion, but is mandated by the design (jsdom cannot test CSS) |

Test layer: integration (RTL render) across 9 files, about 10 new tests; no unit/E2E additions.

## Findings
- WARNING: apply-progress has no "TDD Cycle Evidence" table, which tasks.md required. RED/GREEN cannot be independently confirmed from history.
- WARNING: tasks.md G.2 and B.1 remain unchecked although G.2 is evidenced done (stale bookkeeping).
- SUGGESTION: Empty-state no-caption test exists on one page only (loading/error browser-verified only); caption-follows-language tested on one page only.
- SUGGESTION: ReviewSchedulePage `th` lines are 62-67 in code vs 62-66 in design inventory (cosmetic doc drift).

## Next
Proceed to sdd-archive (PR 2/2: merge delta spec into `openspec/specs/web-table-accessibility/spec.md`). Diagnostic findings do not gate archive.
