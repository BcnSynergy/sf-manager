# Archive Report: Checklist Question Pool and Review Template Versioning (FR-005 + FR-005b)

**Change**: `checklist-management` (FR-005 + FR-005b)
**Status**: ARCHIVED
**Date**: 2026-09-04
**Artifact Store**: Hybrid (OpenSpec + Engram)

## Executive Summary

The `checklist-management` (FR-005 checklist question pool + FR-005b review
template versioning) SDD change has completed all 12 phases across 12 merged
PRs to `main` (11 original apply PRs + PR 12 remediation for a CRITICAL
finding raised by the first verify pass). Specification and design both
complete. Implementation re-verified after PR 12 with a **PASS** verdict (0
CRITICAL, 2 non-blocking WARNING, 3 SUGGESTION). All 65/65 tasks marked
complete. Change is ready for archival and closure.

## Engram Observation IDs (Source of Truth)

All artifacts captured in persistent Engram memory with the following topic
keys and observation IDs:

| Artifact | Topic Key | Engram ID | Status |
|---|---|---|---|
| Proposal | `sdd/checklist-management/proposal` | 165 | Complete |
| Specification | `sdd/checklist-management/spec` | 166 | Complete |
| Design | `sdd/checklist-management/design` | 167 | Complete |
| Tasks | `sdd/checklist-management/tasks` | 168 | Complete (65/65) |
| Apply Progress | `sdd/checklist-management/apply-progress` | 169 | Complete (incl. PR 12 TDD evidence table) |
| Verification Report | `sdd/checklist-management/verify-report` | 172 | PASS (supersedes an earlier PASS-WITH-ISSUES / 1-CRITICAL version) |

## Merged Specifications (OpenSpec)

Delta specifications have been merged into the main spec files as follows:

### New Specifications (Created)

1. **`openspec/specs/checklist-question-management/spec.md`**
   - Full spec: 6 requirements, 18 scenarios
   - `ReviewFrequency` three-way declaration, create/list/update/soft-delete,
     the pool ships empty, soft-delete never blocked by template references

2. **`openspec/specs/checklist-question-admin-ui/spec.md`**
   - Full spec: 9 requirements, 18 scenarios
   - Role-gated routes, pool list, create/edit forms, confirmed soft-delete,
     verbatim text rendering, label maps, coded errors, i18n coverage

3. **`openspec/specs/review-template-management/spec.md`**
   - Full spec: 10 requirements, 26 scenarios
   - Draft creation, ordered question selection, atomic activation (freeze +
     retire predecessor), wording snapshot at activation, gapless versioning,
     retirement-only-via-activation, no review-session surface

4. **`openspec/specs/review-template-admin-ui/spec.md`**
   - Full spec: 11 requirements, 24 scenarios
   - Role-gated routes, versioned list, draft builder with inline picker,
     read-only frozen view, activate confirmation naming the retired version

### Modified Specifications (Delta Merged)

5. **`openspec/specs/authorization/spec.md`**
   - ADDED: Requirement "Permission Check on Checklist Question Endpoints"
     (`checklistQuestion:create|read|update|delete`, `SYSTEM_ADMIN` only)
   - ADDED: Requirement "Permission Check on Review Template Endpoints"
     (`reviewTemplate:create|read|update|delete|activate`, `activate` split
     from `update`)
   - ADDED: Requirement "No Standalone Retire Permission"
   - ADDED: Requirement "Non-Admin Roles Remain Inert After the Checklist
     Permissions Are Added"
   - All 4 non-admin roles (`MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
     `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`) remain mapped to
     `[]`; existing requirements untouched

## Verification Summary

**Verdict**: PASS (re-verified post-PR-12)

### Re-verification Scope
PR 12 (`checklist-management/12-activation-conflict-deadlock-mapping`) was a
scoped remediation of the single CRITICAL finding (C-1: a Postgres deadlock
SQLSTATE `40P01` escaped the activation-conflict mapping and surfaced as an
unmapped 500 instead of 409 `REVIEW_TEMPLATE_ACTIVATION_CONFLICT`). This pass
verified that fix and re-compiled the full open/resolved ledger; it did not
re-review the original 11 PRs from scratch.

| Finding | Status |
|---|---|
| C-1 deadlock 40P01 escapes activation-conflict mapping | RESOLVED |
| W-1 TDD evidence table not fully retrievable across PRs 1-11 | PARTIALLY RESOLVED — non-blocking (process note for future changes) |
| W-2 no HTTP-level test for the 409 | RESOLVED |
| W-3 error-mapping tests mirror the implementation | STILL OPEN — non-blocking pattern note |
| S-1 vacuous-pass risk in no-review-session guard | STILL OPEN — suggestion |
| S-2 web bundle exceeds Vite 500 kB warning | STILL OPEN — pre-existing |
| N-1 flaky `countActiveByRole` integration test | OUT OF SCOPE — belongs to `user-management-roles` |
| S-3 class-40 SQLSTATEs enumerated, not prefix-matched | NEW — suggestion |

### Test Execution (all re-run live on `main` @ `8c858a6`, 12/12 PRs merged)
- API unit: 572/572 pass, 82 suites
- API e2e: 240/240 pass, 8 suites
- Web (Vitest + RTL): 492/492 pass, 36 files
- API integration (real Postgres): 72/72 on 5 of 8 full-suite runs; 71/72 on
  3 runs, always the same unrelated N-1 flake (not this change's defect)
- Targeted C-1 stress: the concurrency spec run 20/20 clean (12 isolated runs
  + 8 full-suite runs)
- Build: clean, 4 tasks, exit 0. Lint (`--no-fix`, read-only on PR-12-touched
  files): 0 errors, 0 warnings

### Compliance Matrix
- **65/65 Implementation Tasks**: all marked complete in
  `sdd/checklist-management/tasks` (62 original + 3 added by PR 12)
- **58/58 Spec Scenarios**: all compliant across 5 delta specs (was 57/58
  before PR 12 closed the concurrent-activation scenario)
- **9/9 Design Decisions**: verified against shipped code (Decision 3 upgraded
  PARTIAL → YES once the SQLSTATE mapping was completed)
- **Scope Guard**: zero drift across the 11-PR chain; PR 12 touched exactly 4
  files (+148/-1), no opportunistic fixes bundled in
- **Strict TDD**: 17/17 TDD-designated tasks have covering, passing tests

### Findings
- CRITICAL: 0 (C-1 resolved and independently re-verified)
- WARNING: 2 (both non-blocking: W-1 evidence retention, W-3 test-design
  pattern)
- SUGGESTION: 3 (S-1 vacuous-pass guard, S-2 pre-existing bundle size, S-3
  class-40 prefix matching)

## Archive Contents

### Files Present in Archive
- `proposal.md` (Engram ID 165)
- `design.md` (Engram ID 167)
- `tasks.md` (Engram ID 168)
- `specs/checklist-question-management/spec.md` (NEW)
- `specs/checklist-question-admin-ui/spec.md` (NEW)
- `specs/review-template-management/spec.md` (NEW)
- `specs/review-template-admin-ui/spec.md` (NEW)
- `specs/authorization/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

Per this repo's established archive convention (see
`openspec/changes/archive/2026-09-02-inspectable-elements/`), the archive
folder carries `ARCHIVE-REPORT.md` rather than a standalone `verify-report.md`
— the verification findings are folded into this report's Verification
Summary section above, with the full report retrievable from Engram
observation #172 for anyone needing the complete text.

### Verification Checklist
- All 9 files present in archive path
- No unchecked implementation tasks (all 65/65 marked complete)
- Main specs merged into `openspec/specs/` (source of truth updated): 4 new
  capability specs created, 1 existing spec (`authorization`) extended with 4
  ADDED requirements, no existing requirement removed or modified
- Verify report PASS (0 CRITICAL blocks)
- Line endings preserved (files copied verbatim, no read-then-reformat)
- No stray unchecked tasks in archived `tasks.md`

## Known Bug Mitigation

This archive was performed with explicit attention to the documented
"duplicate-folder" bug from the prior `maintenance-company` and
`inspectable-elements` archives:
- Verified all 9 source files exist and are non-empty before archiving
- All files copied verbatim (byte-for-byte) into the new archive destination,
  not paraphrased or regenerated from summary
- No file was left half-written; each `Write` call was confirmed successful
  before proceeding to the next
- This report documents the exact file count, names and paths for
  cross-verification

**Known limitation of this archive run**: the `sdd-archive` executor in this
session had no shell/Bash tool available — only `Read`/`Write`/`Edit`/`Glob`
and Engram MCP tools. It could therefore **create** the new archive files at
`openspec/changes/archive/2026-09-04-checklist-management/` and **overwrite**
the main specs, but it could **not**:
1. Delete the original `openspec/changes/checklist-management/` folder
   (a true `git mv`/`rm` requires shell access this session did not have).
2. Run `git add` to stage the changes.

**The orchestrator (or a follow-up shell-capable step) MUST still run:**

```bash
cd D:/SF-Manager
git rm -r openspec/changes/checklist-management
git add openspec/specs/ openspec/changes/archive/2026-09-04-checklist-management/
git status   # confirm: 5 new/modified main specs, checklist-management folder
             # removed from openspec/changes/, present under
             # openspec/changes/archive/2026-09-04-checklist-management/
git commit -m "feat(checklist-management): archive SDD change after PR 12 merge - all 65 tasks complete, verify PASS"
```

Until that `git rm` runs, `openspec/changes/checklist-management/` and
`openspec/changes/archive/2026-09-04-checklist-management/` will both exist on
disk simultaneously — the archive copy is complete and correct, but the
active-changes directory has not yet been cleared. This is a **known, reported
gap in this pass**, not a silent partial archive.

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| A.1 | PR 1 | Merged | `ReviewFrequency` enum + `ChecklistQuestion` migration |
| A.2 | PR 2 | Merged | `checklist-question` domain (entity, review-frequency, errors) |
| A.3 | PR 3 | Merged | `checklist-question` application + validation (4 use cases) |
| A.4 | PR 4 | Merged | `checklist-question` infra + presentation + permissions |
| A.5 | PR 5 | Merged | Web question pool (list/create/edit) + i18n + E2E |
| B.6 | PR 6 | Merged | `ReviewTemplateStatus` enum + `ReviewTemplate`/`ReviewTemplateQuestion` migration |
| B.7 | PR 7 | Merged | `review-template` domain + `DraftSelectionCleaner` cascade |
| B.8 | PR 8 | Merged | `review-template` application + validation (6 use cases) |
| B.9 | PR 9 | Merged | `review-template` infra (atomic activation transaction) + presentation |
| B.10 | PR 10 | Merged | Web review templates (list/create/builder/activate) + i18n |
| B.11 | PR 11 | Merged | E2E both modules, docs correction, browser verification, final checks |
| Remediation | PR 12 | Merged | sdd-verify C-1 fix: SQLSTATE 40P01 deadlock mapping + HTTP-level 409 test |

All 12 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`
(12 sequential PRs, last merge `8c858a6`).

## Risks & Mitigations

| Risk | Likelihood | Mitigation | Status |
|---|---|---|---|
| Scope creep toward FR-007 (`ReviewSession`) | Low | Explicit non-goal; grep-verified absent | Mitigated |
| Two new modules + 6 pages exceeds 400-line PR budget | Realized (High forecast) | Two-phase `stacked-to-main` chain, 12 PRs; each PR independently reviewed | Mitigated |
| Activation race leaves two `active` versions | Low (mechanism sound) / Realized narrowly (C-1 edge case) | Serializable transaction + partial unique index by construction; the one gap (40P01 SQLSTATE) found by verify and closed by PR 12, independently re-verified 20/20 | Mitigated (post-remediation) |
| Frozen version missing its wording snapshot | Low | `questionText NOT NULL` on rows that exist only for frozen versions — structurally unrepresentable | Mitigated |
| Frozen read path silently joins live pool | Low | Dedicated `findFrozenWithSnapshot` query never references `ChecklistQuestion`; edit-after-freeze e2e proves byte-identical | Mitigated |
| `ReviewFrequency` / `ReviewTemplateStatus` drift across TS/Postgres/Zod | Low | Parity integration specs for both, cloned from `element-type.ts` precedent | Mitigated |
| Raw enum values rendered in UI | Low | Label maps shipped with pages; grep-checked | Mitigated |
| No global nav bar (6th URL-only admin section) | Med | Pre-existing gap, explicitly carried forward and named as its own future slice | Accepted, documented |
| Incomplete archive (known bug class) | Low (mitigated by this report) / **Escalated**: this pass could not delete the source folder without shell access | See "Known limitation of this archive run" above — orchestrator follow-up required | **Partially mitigated — follow-up required** |

## Session Activity Summary

### Phase Completion Record
- **sdd-init**: Project context and testing capabilities detected (`strict_tdd: true`)
- **sdd-propose**: Proposal question round closed 2026-09-02; 4 settled decisions confirmed by product owner (Engram ID 165)
- **sdd-spec**: 5 delta specs written covering 58 scenarios (Engram ID 166)
- **sdd-design**: 9 architectural decisions, 5 core invariants with distinct enforcement mechanisms (Engram ID 167)
- **sdd-tasks**: 65 implementation tasks broken into 11 PR-sized work units across 2 phases (Engram ID 168)
- **sdd-apply**: 11 sequential PRs implemented and merged to `main` (git log)
- **sdd-verify (pass 1)**: PASS WITH ISSUES — 1 CRITICAL (C-1) blocking archive
- **sdd-apply (PR 12)**: Scoped remediation of C-1 — SQLSTATE 40P01 mapping + HTTP-level test (Engram ID 169)
- **sdd-verify (pass 2)**: PASS — 0 CRITICAL, 2 WARNING, 3 SUGGESTION, ready to archive (Engram ID 172)
- **sdd-archive**: This report and spec merges (completion of cycle) — **with the file-deletion/git-staging step flagged as a required orchestrator follow-up** due to lack of shell tooling in this execution context

### Artifacts Persisted
- Engram: 6 observations (proposal, spec, design, tasks, apply-progress, verify-report) + this archive-report
- OpenSpec: 5 main spec files created/updated in `openspec/specs/` (4 new capabilities + 1 delta merge into `authorization`)
- OpenSpec: 1 archive folder created at `openspec/changes/archive/2026-09-04-checklist-management/` (9 files, verbatim copies)
- **Pending**: removal of `openspec/changes/checklist-management/` (source folder) — requires `git rm` by a shell-capable step

## Next Steps

1. **Orchestrator/shell-capable follow-up (required, not optional)**:
   ```bash
   cd D:/SF-Manager
   git rm -r openspec/changes/checklist-management
   git add openspec/specs/ openspec/changes/archive/2026-09-04-checklist-management/
   git status
   git commit -m "feat(checklist-management): archive SDD change after PR 12 merge - all 65 tasks complete, verify PASS"
   ```
2. **PR (if applicable)**: orchestrator creates a PR to `main` with the archive changes, per this repo's `stacked-to-main` convention
3. **Close**: once the source folder removal is committed, the SDD cycle is fully complete; change is archived and ready for reference

## Traceability

This archive report and all supporting artifacts are linked via Engram topic
keys for cross-session recovery:
- `sdd/checklist-management/proposal` → Engram ID 165
- `sdd/checklist-management/spec` → Engram ID 166
- `sdd/checklist-management/design` → Engram ID 167
- `sdd/checklist-management/tasks` → Engram ID 168
- `sdd/checklist-management/apply-progress` → Engram ID 169
- `sdd/checklist-management/verify-report` → Engram ID 172
- `sdd/checklist-management/archive-report` → this document (persisted to Engram at this topic key)

All specifications now reflected in main `openspec/specs/` directory, source
of truth for future development.

---

**Archive Status**: FILES WRITTEN — CLOSED PENDING SOURCE-FOLDER REMOVAL
**Prepared by**: sdd-archive phase (no shell tool available this session)
**Date**: 2026-09-04
**Session ID**: manual-save-sf-manager
