# Archive Report: web-locale-switch

**Archived**: 2026-10-08
**Mode**: hybrid
**Verdict carried from verify**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 3 SUGGESTION)
**Delivery**: PR 1/2 #198 merged at c7995d1 (`web-locale-switch/01-locale-selector`); PR 2/2 `web-locale-switch/02-archive`.

## Specs merged

| Capability | Action |
|------------|--------|
| `web-locale-selection` | New main spec created at `openspec/specs/web-locale-selection/spec.md` (4 requirements) |
| `app-navigation` | Requirement "The Navigation Stays a Link Bar and Nothing More" replaced by the MODIFIED version (adds the single language selector scenario) |
| `app-navigation` Purpose | D9 hand edit: "a language switcher (deferred by ADR-007)" became "any language switcher other than the single selector defined by `web-locale-selection`" |

## Follow-up debts

1. The ES nav wraps to 3 lines with the selector (ten links in a constrained width). Nav styling is out of scope per `app-navigation`.
2. `ReviewHistoryPage.tsx:85` and `ReviewHistoryDetailPage.tsx:96` render raw ISO `completedAt` in every language (pre-existing).
3. "Dates follow language" is browser-verified only; no automated test.
4. ADR-007 open questions: per-user persisted `User.locale`; walking the whole `navigator.languages` list.

## Artifacts

proposal.md, specs/web-locale-selection/spec.md, specs/app-navigation/spec.md, design.md, tasks.md (B.2 and B.3 ticked), verify-report.md. Engram: `sdd/web-locale-switch/{proposal,spec,design,tasks,apply-progress,verify-report,archive-report}`.
