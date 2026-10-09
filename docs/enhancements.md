# Enhancements

Register of optional improvements to SF-Manager: things that would make the
system better but that nothing currently requires. Known defects, gaps, and
shortcuts live in [technical-debt.md](technical-debt.md); new product
behavior belongs in `docs/requirements/functional-requirements.md`.

## How to use this file

- Each item has a stable ID (`EN-<n>`). IDs are never reused or renumbered.
- New items go at the end of **Open** with the next free number. Include the
  area, the evidence (file path or source review), and the origin.
- Typical sources: non-blocking suggestions from fresh-context reviews, RDD
  reviews, `sdd-verify`, and `sdd-archive` follow-ups.
- When an item is done, move it to **Done** with the change name and PR
  numbers. If it is dropped, move it to **Done** marked "dropped" with a
  one-line reason.
- If an item turns out to fix a real gap, add it to
  [technical-debt.md](technical-debt.md) with the next free `TD-<n>` and
  "(ex EN-<n>)", and move the EN item to **Done** marked "moved to TD-<n>".

## Open

- **EN-1** (web tests): Assert that no `<caption>` renders in the loading and
  error states of the table pages. Today only the CommunitiesList empty state
  is asserted; the other states are browser-verified only. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-2** (web tests): Assert that each `<caption>` is the table's first
  child, as `web-table-accessibility` requires. It is browser-verified only.
  Origin: `table-accessibility` RDD review, 2026-10-09.
- **EN-3** (web tests): Test that captions follow the active language on the
  grouped pages (ReviewTemplatesList, ChecklistQuestionsList). Today only
  ReviewSchedule has a non-English caption test. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-4** (specs): Reword the two scenarios in
  `openspec/specs/web-table-accessibility/spec.md` that compare against the
  state "before this change" ("Pages with no table are unchanged" and "No new
  strings"). In a living spec they cannot be checked. For example, state that
  each caption uses the same translation key as its heading. Origin:
  `table-accessibility` archive RDD review, 2026-10-09.

## Done

None yet.
