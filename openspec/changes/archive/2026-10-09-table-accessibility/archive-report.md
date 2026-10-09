# Archive Report: table-accessibility

**Archived**: 2026-10-09
**Archive path**: `openspec/changes/archive/2026-10-09-table-accessibility/`
**Artifact store**: hybrid (openspec files canonical, Engram mirror `sdd/table-accessibility/*`)
**Branch**: `table-accessibility/02-archive` (from main at 212e137)

## Outcome

Adds the `web-table-accessibility` capability: every one of the 9 web data tables has a first-child, visually hidden `<caption>` equal to its nearest heading (page `h1`, or group `h2` on grouped pages) and `scope="col"` on every `thead` `th`. No new strings, no layout change, web app only.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| web-table-accessibility | Created | New capability; 4 requirements (Table Accessible Name, Caption Visually Hidden but Exposed, Column Header Scope, Scope Limits), all scenarios preserved. Main spec at `openspec/specs/web-table-accessibility/spec.md`. |

The delta was a full spec for a new domain. The only textual change versus the delta is the section heading `## ADDED Requirements` -> `## Requirements` (main-spec format); the delta already carried a Purpose section. Line endings were normalized from CRLF to LF to match the other main specs. `diff --strip-trailing-cr` between delta and main spec shows only that heading line.

## Delivery (final state)

PR 1/2 #203 merged at 212e137, CI green. Commits:

- 4de21bf plan docs
- bdd1062 `visually-hidden` utility
- 20e02bb single-table pages
- 36c3e58 grouped pages
- c2052c3 test fix from RDD review: restore i18n language after the Spanish caption test
- c8116b0 test fix from RDD review: await the table, not the heading, before reading the Spanish caption
- b96d9fe G.1 browser verification evidence

PR 2/2 (this archive) is the closing docs-only change.

## Tasks

All tasks in `tasks.md` are checked at archive time (A.1, B.1-B.5, C.1-C.4, D.1-D.2, G.1, G.2, Phase B B.1, B.2). Unfinished tasks: none.

- G.2: Fresh-context review before push: APPROVE WITH NITS, no blockers; user approved merge on it with code unchanged; PR #203 merged at 212e137, CI green.
- Phase B B.1: evidence is `verify-report.md`, PASS WITH WARNINGS, 0 CRITICAL.
- B.2: this archive.

## Verification (final state)

- Verify result: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION), per `verify-report` (Engram #519, written 2026-10-09 after the PR 1 merge).
- Warning 2 (G.2 and B.1 unchecked at verify time) is resolved by this archive: both are now checked with the evidence above.
- Warning 1 (TDD Cycle Evidence table missing from Engram `apply-progress`) is explained below and the evidence is restored in this report and in Engram.
- Browser verification G.1 passed (2026-10-09, locale `ca`, dev seed, admin) on Users, Review templates (2 groups) and Review schedule. The print check was done on Review schedule because the review document has no table.

### Why the TDD table was missing

The apply agent's original "TDD Cycle Evidence" table was overwritten in Engram by an orchestrator save (#515) that reused the same topic key `sdd/table-accessibility/apply-progress`. This is a confirmed cause (observation #515 shows Topic `sdd/table-accessibility/apply-progress`, Revisions: 2). Evidence below is as reported by the apply agent at completion.

### TDD Cycle Evidence (restored, as reported by the apply agent at completion)

| Task | RED | GREEN | Notes |
|------|-----|-------|-------|
| A.1 | n/a | n/a | CSS-only (jsdom ignores CSS); verified in G.1 |
| B.1-B.5 | 8 failures: "Unable to find role=table and name ..." across the 7 single-table page tests | 83/83 in those test files | The empty-state no-caption test is a regression guard (passes before and after) |
| C.1-C.4 | 2 failures (same reason) | 18/18 | Grouped pages |

Safety net: existing tests in the touched files passed before any edits.

## Open Follow-ups (non-blocking)

- No-caption assertions exist only for the CommunitiesList empty state; loading and error states are browser-verified only.
- The language-follow test covers ReviewSchedule only.
- Caption-as-first-child is not test-asserted.
- Prettier is not enforced repo-wide (main already fails `prettier --check`).

## Archive Contents

- proposal.md: present
- specs/web-table-accessibility/spec.md: present
- design.md: present
- tasks.md: present, 16/16 checked (final state), 0 unfinished
- verify-report.md: present
- archive-report.md: this file

## Engram Observation IDs (traceability)

- proposal: #506
- spec: #507
- design: #508
- tasks: #509
- verify-report: #519
- apply-progress: #515 (topic `sdd/table-accessibility/apply-progress`, updated at archive to include the TDD table)
- scope decision: #505

## Readback

`diff -r openspec/changes/table-accessibility openspec/changes/archive/2026-10-09-table-accessibility` (taken before this report was added): empty output, exit 0.

## Risks

The source folder `openspec/changes/table-accessibility/` still exists; the orchestrator removes it (git mv equivalent) and commits.
