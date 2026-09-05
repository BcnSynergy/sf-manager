# Archive Report: Element Code and Single-Element Label Printing (FR-006)

**Change**: `label-printing` (FR-006)
**Status**: ARCHIVED — source-folder removal, branch, and commit completed by the orchestrator (see Known Limitation for why `sdd-archive` itself couldn't do this step)
**Date**: 2026-09-05
**Artifact Store**: Hybrid (OpenSpec + Engram)

## Executive Summary

`label-printing` (FR-006: element `code` + QR generation + single-element
label printing) shipped as 7 sequential PRs, all merged to `main` in order
(`f844044` → `514e147` → `0c35f2c` → `0182438` → `17894d6` → `36823e6` →
`638bc40`). All 45/45 implementation tasks in `tasks.md` are marked complete
and independently spot-verified against current `main`, not trusted from
checkboxes alone. `sdd-verify` returned **PASS WITH WARNINGS** — 0 CRITICAL,
5 WARNING (all evidence/record-keeping or deployment-gating, not
implementation defects), 5 SUGGESTION. The user explicitly chose to archive
now, tracking the warnings as follow-ups rather than blocking on them.

## Engram Observation IDs (Source of Truth)

| Artifact | Topic Key | Notes |
|---|---|---|
| Proposal | `sdd/label-printing/proposal` | Complete |
| Specification | `sdd/label-printing/spec` | Complete (3 delta specs) |
| Design | `sdd/label-printing/design` | Complete (9 decisions + Decision 4a + addendum 10-12) |
| Tasks | `sdd/label-printing/tasks` | Complete (45/45) |
| Apply Progress | `sdd/label-printing/apply-progress` (obs #183) | **Degraded** — collapsed to a 4-line summary by successive topic_key upserts; also stated an incorrect "38/38" total. See verify-report W-1. Reconstructed from git history + `tasks.md` for this archive. |
| Verification Report | `sdd/label-printing/verify-report` (obs #184) | PASS WITH WARNINGS |
| Archive Report | `sdd/label-printing/archive-report` | This document |

## Merged Specifications (OpenSpec)

### New Specification (Created)

1. **`openspec/specs/element-label-printing/spec.md`**
   - Full new capability spec: 9 requirements, 21 scenarios
   - Single-element label surface: QR + plain-text `code` + minimum
     identifying context, bare-code QR payload contract, print-chrome
     suppression, permission reuse, explicit non-goals (no batch sheet, no
     PDF, no by-code lookup), docs-correction requirement, i18n coverage

### Modified Specifications (Delta Merged)

2. **`openspec/specs/inspectable-element-management/spec.md`**
   - Purpose updated: `code` (10 chars, `NOT NULL UNIQUE`, immutable) added
     to the entity shape; `imageUrl`, `active`, hydrostatic-test fields
     remain deferred
   - ADDED: Element Code, Code Collisions Resolved Deterministically,
     Element Code Is Immutable, Pre-Existing Elements Are Backfilled With
     Codes, Element Code Exposed on Element Responses, Element Lifecycle
     Filtering Unchanged (6 new requirements, 21 new scenarios)
   - MODIFIED: Create Inspectable Element Under a Community (adds `code`
     generation + the `SUPPLIED_CODE_IGNORED` warning contract), Update
     Inspectable Element (adds `code` non-updatability)
   - All other existing requirements preserved verbatim (List Elements By
     Community, Soft-Delete Inspectable Element, No Uniqueness Constraints)

3. **`openspec/specs/inspectable-element-admin-ui/spec.md`**
   - Purpose updated: list now shows `code` + per-element Print entry point
   - ADDED: Element Code Shown in the List, Per-Element Print Entry Point
     (2 new requirements, 4 new scenarios)
   - MODIFIED: List Active Elements For a Community (adds `code` to the
     displayed fields), Edit Inspectable Element (adds the no-code-input
     rule)
   - All other existing requirements preserved verbatim (Role-Gated Route
     Access, Create Inspectable Element, Soft-Delete Inspectable Element,
     Generic Not-Found Handling, No Server-Message String Coupling,
     Internationalization Coverage, Element Type Label Mapping)

*(`openspec/specs/authorization/spec.md` deliberately NOT touched — this
slice reuses the existing `inspectableElement:read` permission and
introduces none, confirmed by an empty `git diff` over the authorization
module across the full PR range.)*

## Verification Summary

**Verdict**: PASS WITH WARNINGS

### Test Execution (all re-run live on `main` @ `638bc40`, 7/7 PRs merged)
- API unit: 580/580 pass, 83 suites
- API e2e: 244/244 pass, 8 suites
- API integration: 15/16 suites clean-parallel; 16/16 with `--runInBand`
  (1 pre-existing flake unrelated to this change — `users` module, W-5)
- Web (Vitest + RTL): 514/514 pass, 38 files
- Build: clean, 4 turbo tasks, exit 0
- Lint: 0 errors, 4 pre-existing warnings (unrelated file, untouched by
  this change); `no-restricted-imports` (ADR-013) passes

### Compliance Matrix
- **45/45 Implementation Tasks**: all marked complete, independently
  sampled and verified against current `main` across all 7 phases
- **44/47 Spec Scenarios COMPLIANT**, 3 PARTIAL (S-2, S-3, W-2/W-4-linked),
  0 FAILING, 0 UNTESTED
- **12/12 Design Decisions verified** (1-9, 4a, addendum 10-12) — Decision
  7 marked Partial (the `#root` centering/width rules were not fully reset
  in print CSS; low practical impact, tracked as W-3)
- **Scope Guard**: zero drift — the two explicitly named temptations (the
  community batch sheet, a by-code lookup route) were not built; grep-clean
- **Strict TDD**: all RED tasks resolve to real test files, GREEN
  re-confirmed with 1,416 total tests passing on current `main`; TDD
  evidence table itself was lost to an Engram topic-key overwrite (W-1,
  reconstructed for verification, not blocking)

### Findings
- CRITICAL: 0
- WARNING: 5 — all non-blocking for archive:
  - W-1: Engram apply-progress mirror lost detailed history (record-keeping)
  - W-2: PR6 browser verification predates the shipped print-CSS fix
    (deployment-gating, not archive-gating)
  - W-3: Design Decision 7 only half-implemented for `#root` centering
    (low practical impact)
  - W-4: Recorded browser evidence doesn't fully match design's testing
    strategy (no phone-scan or dual-color-scheme evidence recorded;
    deployment-gating)
  - W-5: `test:integration` flakes in parallel due to a pre-existing,
    unrelated `users`-module test (out of scope for this change)
- SUGGESTION: 5 (dead export, two thin test-coverage gaps, one
  partly-vacuous assertion, bundle-size watch item)

## Archive Contents

### Files Present in Archive (`openspec/changes/archive/2026-09-05-label-printing/`)
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/element-label-printing/spec.md` (NEW capability)
- `specs/inspectable-element-management/spec.md` (MODIFIED delta)
- `specs/inspectable-element-admin-ui/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

### Verification Checklist
- [x] All 8 files present in archive path, written verbatim from the
      source change folder / Engram-mirrored content
- [x] No unchecked implementation tasks (all 45/45 marked complete)
- [x] Main specs merged into `openspec/specs/`: 1 new capability spec
      created (`element-label-printing`), 2 existing specs extended with
      ADDED/MODIFIED requirements (`inspectable-element-management`,
      `inspectable-element-admin-ui`), no existing requirement removed,
      `authorization` untouched (confirmed deliberate, not an oversight)
- [x] Verify report PASS WITH WARNINGS (0 CRITICAL — does not block archive
      per the Strict-vs-OpenSpec Archive Policy)
- [x] No stray unchecked tasks in the archived `tasks.md`

## Known Limitation of This Archive Run (tooling gap — same class as prior archives)

This `sdd-archive` execution had **no Bash/shell tool available** — only
`Read`/`Write`/`Edit`/`Glob` and the Engram MCP tools. This mirrors the
documented limitation from the `2026-09-04-checklist-management` archive.
Concretely, this run was able to:

1. **Create** all 8 files above at
   `openspec/changes/archive/2026-09-05-label-printing/` (verbatim content).
2. **Overwrite** the 3 affected main spec files in `openspec/specs/`.

It was **not** able to:

1. Delete the original `openspec/changes/label-printing/` source folder
   (a true `git mv`/`git rm` requires shell access this session does not
   have — `Write`/`Edit` cannot delete files).
2. Create a branch off `main` for this archive commit.
3. Run `git add`, `git status`, `git diff --stat`, or `git commit`.
4. Verify via `git status` that the operation is a rename, not a copy —
   this cannot be confirmed without shell access in this session.

**The orchestrator (or a follow-up shell-capable step) MUST run:**

```bash
cd D:/SF-Manager
git checkout main
git pull  # if applicable
git checkout -b label-printing/08-sdd-archive
git add openspec/specs/ openspec/changes/archive/2026-09-05-label-printing/
git rm -r openspec/changes/label-printing
git status   # confirm: 3 spec files modified/created under openspec/specs/,
             # label-printing/ removed from openspec/changes/, and present
             # under openspec/changes/archive/2026-09-05-label-printing/
             # (renames, not new+untouched-old paths)
git diff --stat --cached
git commit -m "docs(label-printing): archive SDD change after PR 7/7 merge - all 45 tasks complete, verify PASS WITH WARNINGS"
```

Do NOT push — per this repo's convention, every PR (including a docs-only
archive commit) gets an independent fresh-context review before push and
before merge, confirmed with the user at each step.

**Update — orchestrator follow-up completed**: the orchestrator ran the
sequence above on branch `label-printing/08-sdd-archive`. `git status`
after staging confirmed real renames (not new+untouched-old paths) for
`proposal.md`, `design.md`, `tasks.md`, and all 3 spec files under
`specs/`; `verify-report.md` and `ARCHIVE-REPORT.md` show as new files
(they were never git-tracked in the source location, since `sdd-verify`
and this `sdd-archive` run created them directly with `Write`, which
has no git-history to rename from — their content is verified identical
to what was on disk pre-move). One untracked leftover copy of
`verify-report.md` in the old `openspec/changes/label-printing/`
directory (also never git-tracked) was diff-confirmed byte-identical to
its archived counterpart, then deleted along with the now-empty source
directory, before staging.

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| Phase 1 | PR 1 | Merged (`f844044`) | `code` column: migration + schema + backfill + transitional bridge |
| Phase 2 | PR 2 | Merged (`514e147`) | Code generation port + adapter (not wired yet) |
| Phase 3 | PR 3 | Merged (`0c35f2c`) | Wired generation into create/list/update + retry + bridge cleanup |
| Phase 4 | PR 4 | Merged (`0182438`) | Supplied-code warning mechanism |
| Phase 5 | PR 5 | Merged (`17894d6`) | Web QR rendering component |
| Phase 6 | PR 6 | Merged (`36823e6`) | Label page + route + list wiring + browser verification + print-CSS fix |
| Phase 7 | PR 7 | Merged (`638bc40`) | Docs correction + final scope-guard checks |

All 7 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`
(7 sequential PRs, last merge `638bc40`).

## Risks & Mitigations

| Risk | Likelihood | Mitigation | Status |
|---|---|---|---|
| Reprint consequence if FR-007 later wants deep-link QR | Med | Accepted deliberately in the proposal; bare-code payload is correct for today's scope | Accepted, documented |
| Backfill leaves a row without a valid code | Med | One transactional migration: index-first backfill with 10-retry loop, `SET NOT NULL` closes the door; integration test proves every row well-formed and distinct | Mitigated |
| Code collision via check-then-act race (3rd time in this codebase) | Med | DB unique index + bounded 3-attempt retry, collision-forcing fake test proves the path | Mitigated |
| `code` becomes mutable by accident | Med | Not in update DTO/schema; e2e proves PATCH-with-code leaves the value untouched; edit form has zero `code` references (grep-verified) | Mitigated |
| Scope creep into the batch sheet or FR-007's lookup route | High / Med | Explicit non-goals; grep-verified absent across the full PR range | Mitigated |
| Printed label unusable in practice (QR too small/low-contrast, print margins clip it) | Med | Browser verification performed, but predates the final print-CSS fix and does not cover a phone scan or both OS colour schemes | **Partially mitigated — W-2/W-4, deployment-gating follow-up recommended before printing at scale** |
| PR1→PR3 transitional-bridge window (any element created live during that window keeps a bridge-generated, non-retried code permanently) | Low | Accepted deliberately (Decision 4a) — this repo's chain merged within one working session, real-world window was hours; bridge function + default confirmed dropped in PR3 | Accepted, documented, verified dropped |
| No global nav bar (pre-existing gap) | Med | Carried forward unchanged, as in prior slices | Accepted, documented |
| Incomplete archive (known tooling-gap bug class, same as `checklist-management`) | Low (mitigated by this report) / **Escalated**: this pass could not delete the source folder, create a branch, or commit without shell access | See "Known Limitation of This Archive Run" — orchestrator follow-up required | **Partially mitigated — follow-up required** |

## Session Activity Summary

### Phase Completion Record
- **sdd-propose**: Proposal question round closed; 4 assumptions stated,
  none blocking
- **sdd-spec**: 3 delta specs written covering 47 scenarios (1 new
  capability, 2 modified capabilities); `authorization` deliberately
  untouched
- **sdd-design**: 9 architectural decisions + Decision 4a (transitional
  bridge) + addendum Decisions 10-12 (supplied-code warning mechanism)
- **sdd-tasks**: 45 implementation tasks across 7 PR-sized work units,
  High 400-line-budget risk forecast, `stacked-to-main` chain
- **sdd-apply**: 7 sequential PRs implemented and merged to `main`,
  including one fresh-context-review CRITICAL fix (task 3.5, P2002
  extraction) and one print-CSS fix found and closed within PR6
- **sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 5 WARNING (evidence/
  deployment-gating, none implementation defects), 5 SUGGESTION
- **sdd-archive**: This report and spec merges (completion of cycle) —
  **with the file-deletion/branch-creation/git-staging steps flagged as a
  required orchestrator follow-up** due to lack of shell tooling in this
  execution context

### Artifacts Persisted
- Engram: 4 observations already existed (proposal, spec, design, tasks) +
  apply-progress (degraded, see W-1) + verify-report (obs #184) + this
  archive-report (new)
- OpenSpec: 3 main spec files created/updated in `openspec/specs/` (1 new
  capability, 2 delta merges)
- OpenSpec: 1 archive folder created at
  `openspec/changes/archive/2026-09-05-label-printing/` (8 files, verbatim
  copies)
- **Pending**: removal of `openspec/changes/label-printing/` (source
  folder), branch creation, and the archive commit — all require a
  shell-capable step

## Next Steps

1. ~~Orchestrator/shell-capable follow-up: run the git sequence~~ — **done**,
   see the update note in "Known Limitation of This Archive Run" above.
2. **Fresh-context review**: per this repo's convention, even a docs-only
   archive commit gets an independent fresh-context review before push
   and before merge — confirm with the user at each step.
3. **Deployment follow-up (not archive-blocking, tracked from W-2/W-4)**:
   before printing labels at production scale, re-run a print preview on
   current `main` and physically print + phone-scan one label.
4. **Close**: once the source-folder removal, branch, and commit land
   (and the fresh-context review + user confirmation complete), the SDD
   cycle is fully complete; the change is archived and ready for reference.

## Traceability

This archive report and all supporting artifacts are linked via Engram
topic keys for cross-session recovery:
- `sdd/label-printing/proposal`
- `sdd/label-printing/spec`
- `sdd/label-printing/design`
- `sdd/label-printing/tasks`
- `sdd/label-printing/apply-progress` (obs #183, degraded — see W-1)
- `sdd/label-printing/verify-report` (obs #184)
- `sdd/label-printing/archive-report` → this document (persisted to Engram
  at this topic key)

All specifications now reflected in main `openspec/specs/` directory,
source of truth for future development.

---

**Archive Status**: CLOSED — files merged, source folder removed, committed
on `label-printing/08-sdd-archive`, pending fresh-context review and push
**Prepared by**: sdd-archive phase (file content) + orchestrator (git
operations, since this session's sdd-archive execution had no shell tool)
**Date**: 2026-09-05
