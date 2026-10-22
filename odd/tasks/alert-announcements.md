# Alert Announcements

Locator: `odd/tasks/alert-announcements.md` (Engram mirror: `odd/alert-announcements/tasks`).
Route: ODD; adds the main spec `openspec/specs/web-alert-announcements/spec.md` (CLAUDE.md "Keeping `openspec/specs/` Current": the specs are silent, so treat as Yes; precedent `web-table-accessibility`). Delivery: 4-PR chain, `stacked-to-main`, branches `alert-announcements/<NN>-<slug>`. Test runner: Vitest (`apps/web`).

## Specs

- S1 (EN-76): "The save confirmations on the organization profile and review session element pages (`role="status"`) are added already filled, and many screen readers only announce changes inside a live region that was on the page before." Each save confirmation renders inside a `role="status"` region that is on the page before the confirmation appears.
- S2 (EN-76): "a repeated validation error with the same text (cleared and set again in the same handler tick, so React batches both) keeps the same `role="alert"` element, so it is not announced again". Every action error alert is a new element each time its message is shown, even with the same text.
- S3 (EN-76): "A shared approach, such as a persistent live region per page or an alert component that remounts on each message, would cover every form at once." One shared `Alert` component and `useAlertMessage` hook; pages stop repeating the alert markup.
- S4: `PageSuspense`'s chunk-load error is out of scope (a load failure, not a repeatable action).
- S5: EN-76's third point ("On a long form at phone width, the element page's confirmation sits above the form, out of view of the Save button just pressed, and it stays up … when the user then edits the answers") is split out to a new enhancement, EN-80: it changes the `review-session-ui` flow, not how alerts are announced.
- S6: The new main spec `web-alert-announcements` describes S1 and S2 and lands with the last PR, when every page complies. EN-76 moves to Done there.
- S7: No change to copy, styles, test ids, flows or validation; only the alert elements and their live regions.

## Tasks

| ID  | Specs          | Scope                                                                                                                                                    | Route  | Status  | Commit / PR |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | ----------- |
| T1  | S2, S3, S5     | `components/Alert.tsx`, `components/use-alert-message.ts` + tests; EN-80                                                                                 | inline | done    | (T1 commit) |
| T2  | S2, S3, S7     | Community (Create, Edit, List, `AssignmentSection`), MaintenanceCompany (Create, Edit, List), User (Create, Edit, List)                                  | inline | pending |             |
| T3  | S1, S2, S3, S7 | ChecklistQuestion (Create, Edit, List), InspectableElement (Create, Edit), ReviewTemplate (Create, Detail), OrganizationProfile (with its status region) | inline | pending |             |
| T4  | S1, S2, S3, S6 | ReviewSession (Detail, New, Element with its status region); spec `web-alert-announcements`; EN-76 to Done                                               | inline | pending |             |

Route evidence: one PR per task, written inline by the parent; no writer trigger (units are sequential, not parallel).

## Log

- L1 (2026-10-22, user, verbatim): "seguimos con EN-76", then "si, SDD", then (SDD tooling gone) "la opción B y modificamos CLAUDE.md" (ODD with the main spec edited in the PR; CLAUDE.md changed in #270), then "si" to: new spec `web-alert-announcements` covering points 1 and 2, point 3 split out.
- L2 (2026-10-22): analysis. 29 `role="alert"` elements in 21 files (one is `PageSuspense`), 2 `role="status"` confirmations (`OrganizationProfilePage`, `ReviewSessionElementPage`), no `aria-live` anywhere. Error state is `useState<string | null>` in each page. Design: `useAlertMessage()` keeps `{ text, id }` with `id` from a ref counter that never resets, so `clear()` then `show(sameText)` in one tick still yields a new id; the page renders `<Alert key={id} …>` so the element remounts and a `role="alert"` insertion is announced. Save confirmations keep a persistent `<div role="status">` wrapper with the visible box inside. Next: T1.
- L3 (2026-10-22): T1 done on `alert-announcements/01-alert-component`. `Alert` (danger with `role="alert"`, success without a role, optional children in an `sf-section`), `StatusRegion` and `useAlertMessage`; 8 tests observed failing first (missing modules), then passing; `tsc -b` and eslint clean. EN-80 added; EN-76 now points to it. No page uses them yet (T2–T4).
