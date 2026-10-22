# Page Header Component and Edit Form Tab Order

Locator: `odd/tasks/page-header.md` (Engram mirror: `odd/page-header/tasks`).
Route: ODD (EN-69 refactor plus the EN-74 tab-order fix; the user accepted the 2-PR chain 2026-10-22). Delivery: 2-PR chain, `stacked-to-main`, branches `page-header/<NN>-<slug>`. Test runner: Vitest (`apps/web`).

## Specs

- S1 (EN-69): "Every restyled page repeats the same `<header className="sf-page-header"><h1>…</h1></header>` block" — 28 non-test pages in `apps/web/src/pages`. "A small `PageHeader` component (title plus optional actions) would remove the copies". Every page uses it; no page keeps a hand-written `header.sf-page-header`.
- S2: T1 is a pure refactor: the rendered DOM of every page header stays the same (`header.sf-page-header` > `h1` followed by the same actions markup, unwrapped Links stay unwrapped). No change to flows, routes, test ids, copy or styles.
- S3 (EN-74): "On the maintenance company and checklist question edit forms, Delete is the page header's only action, so it comes before the form fields in keyboard tab order". "The inspectable element edit form has the same order with Decommission (or Reactivate) then Delete in its header." "Options: also put Save in the header before the other actions, or move them after the form's Save. Decide once for every edit form with header actions". The user picks the option before T2 starts.

## Tasks

| ID  | Specs  | Scope                                                                                                     | Route  | Status  | Commit / PR |
| --- | ------ | --------------------------------------------------------------------------------------------------------- | ------ | ------- | ----------- |
| T1  | S1, S2 | `components/PageHeader.tsx` + test; the 28 pages use it                                                   | inline | pending |             |
| T2  | S3     | `MaintenanceCompanyEditPage`, `ChecklistQuestionEditPage`, `InspectableElementEditPage` (option per user) | inline | pending |             |

Route evidence: one PR per task, written inline by the parent; no writer trigger (units are sequential, not parallel).

## Log

- L1 (2026-10-22, user, verbatim): "me has comentado antes que EN-69 y EN-74 se podian hacer juntos?" then "si" to the proposal: one chain of 2 PRs, by ODD; PR 1 extracts `PageHeader` with no visible change, PR 2 applies the EN-74 decision to the three edit forms.
- L2 (2026-10-22): analysis. 80 `header.sf-page-header` blocks in 28 pages: 66 hold only the `h1`; the rest add actions after the `h1`, either a `div.sf-actions` (sometimes conditional, e.g. `isDraft && …`) or a bare `Link` with a comment. No header has attributes or an `h1` with attributes. Design: `PageHeader({ title, children })` renders `<header className="sf-page-header"><h1>{title}</h1>{children}</header>`, so the actions markup passes through unchanged (S2). Next: T1.
