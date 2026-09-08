# Archive Report: Perform a Review Session (FR-007)

**Change**: `review-session` (FR-007)
**Status**: ARCHIVED — source-folder removal, branch, and commit completed by the orchestrator (`sdd-archive` had no Bash/shell tool available — see Known Limitation for what it prepared vs. what the orchestrator finished)
**Date**: 2026-09-08
**Artifact Store**: Hybrid (OpenSpec + Engram)
**Branch this archive was prepared on**: `review-session/09-verify-and-archive`

## Executive Summary

`review-session` (FR-007: performing a review — open a session, resolve
elements by `code`, record answers, mark unreviewed elements with a reason,
pause/resume, complete) shipped as 8 sequential PRs, all merged to `main` in
order, culminating in `eb2ea79`. All 63/63 implementation tasks in `tasks.md`
are marked complete and were independently spot-verified against current
`main`, not trusted from checkboxes alone. `sdd-verify` returned **PASS WITH
WARNINGS** — 0 CRITICAL, 4 WARNING (all evidence/retention gaps, not
implementation defects), 5 SUGGESTION. This is a clean pass; archiving
proceeds per the verify report's own closing line: "Ready for `sdd-archive`."

This slice delivered three genuinely new mechanisms in one change — the
codebase's first resource-scoped authorization layer, the first
non-`SYSTEM_ADMIN`-reachable web UI, and a from-scratch 3-entity aggregate
(`ReviewSession`, `ElementReviewEntry`, `QuestionAnswer`) — each enforced
structurally (a property of a port signature, or an unconstructible domain
state) rather than by per-caller discipline, per design.md's stated intent.

## Engram Observation IDs (Source of Truth)

| Artifact | Topic Key | Notes |
|---|---|---|
| Proposal | `sdd/review-session/proposal` | Complete |
| Specification | `sdd/review-session/spec` | Complete (6 delta specs: `review-session-management` new, `review-session-ui` new, `authorization`/`inspectable-element-management`/`inspectable-element-admin-ui`/`review-template-management` modified) |
| Design | `sdd/review-session/design` | Complete (11 numbered decisions + a 2026-09-06 confirmation + a 2026-09-07 correction to Decision 4) |
| Tasks | `sdd/review-session/tasks` | Complete (63/63 across 8 phases) |
| Apply Progress | `sdd/review-session/apply-progress` (obs #198) | **Degraded** — 28 `topic_key` upserts collapsed it to a one-paragraph status note; its own header's "Full PR1-8 history preserved verbatim" claim is false (verify-report W-1). Reconstructed from git history + `tasks.md` for this archive. |
| Verification Report | `sdd/review-session/verify-report` (obs #203) | PASS WITH WARNINGS |
| Archive Report | `sdd/review-session/archive-report` | This document |

## Merged Specifications (OpenSpec)

### New Specifications (Created)

1. **`openspec/specs/review-session-management/spec.md`**
   - Full new capability: 13 requirements, ~50 scenarios
   - Opening a session against a community and a frozen `active` template;
     at-most-one-open-draft rule; opener-only resume; discard; scope-checked
     by-code resolution; the indistinguishable-rejection security requirement;
     frozen-snapshot rendering; recording answers; mandatory unreviewed
     reasons; partial completion with explained gaps; permanent
     completed-session immutability; no deletion path for review records;
     explicit non-goals guarding FR-008/FR-009/FR-010

2. **`openspec/specs/review-session-ui/spec.md`**
   - Full new capability: 10 requirements, ~25 scenarios
   - The field flow: role-gated routes (first non-`SYSTEM_ADMIN`-reachable
     surface in the app), a reachable entry point for both non-admin roles,
     assigned-communities-only session start, manual code entry with no
     camera/scanner dependency, per-element answer flow, one uniform
     rejection message for every code-rejection cause, pause/resume/discard,
     completion with gap-explanation, i18n coverage, explicit non-goals

### Modified Specifications (Delta Merged)

3. **`openspec/specs/authorization/spec.md`**
   - Purpose updated: `SYSTEM_ADMIN` remains operational everywhere;
     `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` become
     operational **only** on the review-session surface, gated by a second
     composable dimension (active-community-assignment resource scope);
     `MANAGER`/`MAINTENANCE_COMPANY_MANAGER` remain fully inert
   - ADDED: Permission Check on Review Session Endpoints, Technician and
     Representative Become Operational, Resource Scope — an Active
     Assignment Is Required Beyond the Permission (with the confirmed
     `communityId`-on-open indistinguishability exception), Assignments
     Confer No Permission Outside the Review-Session Surface (4 new
     requirements, ~30 new scenarios)
   - MODIFIED: Permission Check on Community and Assignment Endpoints,
     Maintenance-Role Permissions Stay Inert, Permission Check on
     Inspectable Element Endpoints, Non-Admin Roles Remain Inert After the
     Checklist Permissions Are Added (4 requirements updated to reflect the
     two roles' new operational status without weakening any existing
     admin-only guarantee)
   - All other existing requirements preserved verbatim (Role Enum
     Declaration, Permission Check on Protected/Maintenance
     Company/Checklist Question/Review Template Endpoints, Permission Check
     Order, No Standalone Retire Permission)

4. **`openspec/specs/inspectable-element-management/spec.md`**
   - Purpose updated: an element now carries an active/decommissioned state
     (`deactivatedAt`, orthogonal to `deletedAt`) settable by a
     `SYSTEM_ADMIN`, plus scope-constrained by-code resolution consumed by
     `review-session-management`
   - ADDED: Element Active State, Decommission and Reactivate an Element,
     Pre-Existing Elements Are Active After the Migration, Element State
     Exposed on Element Responses, Resolving an Element by Code Is Always
     Scope-Constrained (5 new requirements, ~20 new scenarios)
   - REMOVED: Element Lifecycle Filtering Unchanged (its "no `active` field"
     prohibition is superseded now that `ReviewSession` supplies the
     referent it required; replaced by the ADDED requirements above)
   - All other existing requirements preserved verbatim (Create/List/
     Update/Soft-Delete, No Uniqueness Constraints, the full Element Code
     family from `label-printing`)

5. **`openspec/specs/inspectable-element-admin-ui/spec.md`**
   - Purpose updated: the list now shows each element's state and a
     per-element decommission/reactivate control
   - ADDED: Element State Shown in the List, Decommission and Reactivate
     Control, Internationalization Coverage for the State Controls (3 new
     requirements, ~11 new scenarios)
   - All other existing requirements preserved verbatim (Role-Gated Route
     Access, List/Create/Edit/Soft-Delete, Generic Not-Found Handling, No
     Server-Message String Coupling, Internationalization Coverage, Element
     Type Label Mapping, Element Code Shown in the List, Per-Element Print
     Entry Point)

6. **`openspec/specs/review-template-management/spec.md`**
   - Purpose updated: templates are now **consumed** — the capability gains
     a read query for the currently `active` template of an element type;
     authoring itself is unchanged
   - ADDED: Resolve the Currently Active Template for an Element Type,
     Session Consumption Reads the Frozen Snapshot, Template Authoring Is
     Unchanged by Session Consumption (3 new requirements, ~13 new
     scenarios)
   - REMOVED: No Review Session Surface (superseded — this change *is* the
     FR-007 consumer that requirement was reserving room for)
   - All other existing requirements preserved verbatim (Create Draft
     Template, Replace a Draft's Ordered Question Selection, Activation
     Freezes/Retires Atomically, Activation Snapshots Each Question's
     Wording, Drafts Track the Live Pool, Frozen Templates Are Immutable,
     Retirement Only Follows Activation, Version Numbers Are Gapless Audit
     Facts, List and Read Templates, Only Drafts May Be Soft-Deleted)

*(No other existing `openspec/specs/**` capability file was touched by this
change — `community-management`, `community-admin-ui`,
`community-assignments`, `user-management`, `user-admin-ui`,
`maintenance-company-management`, `maintenance-company-admin-ui`,
`checklist-question-management`, `checklist-question-admin-ui`,
`element-label-printing`, `authentication` are all unaffected, confirmed by
this change's own File Changes table in design.md and by the proposal's
explicit "Untouched by design" list.)*

## Verification Summary

**Verdict**: PASS WITH WARNINGS

### Test Execution (re-run live on `main` @ `eb2ea79`, 8/8 PRs merged, verified by `sdd-verify`)
- API unit: 727/727 pass, 102 suites
- API integration: 104/104 pass, 19 suites
- API e2e: 271/271 pass, 9 suites
- Web (Vitest + RTL): 636/636 pass, 45 files
- **Total: 1738/1738 pass**
- Build: clean, 4 turbo tasks, exit 0
- Lint: 0 errors, 4 pre-existing warnings (unrelated file, untouched by this
  change); `no-restricted-imports` (ADR-013) passes

### Compliance Matrix
- **63/63 Implementation Tasks**: all marked complete, independently
  cross-checked against current `main` across all 8 phases — not trusted
  from checkboxes
- **40/40 Spec Requirements COMPLIANT or PARTIAL**, 36 fully COMPLIANT with
  passing runtime evidence, 4 PARTIAL (evidence gaps, not behavior defects —
  see W-2 through W-4 below), 0 FAILING, 0 UNTESTED
- **11/11 Design Decisions verified** (plus the 2026-09-07 correction to
  Decision 4's soft-deleted-community edge case) — all implemented exactly
  as designed; 6 documented deviations, all assessed as accepted
  improvements (e.g. `findReviewableById` closing a PR5 fresh-context
  review's CRITICAL cross-community write bug)
- **Scope Guard**: zero drift — no review-history route (FR-008), no
  scheduling/due-date logic (FR-009), no `signed` transition or export
  (FR-010), no camera/scanner runtime dependency, no offline infrastructure,
  no `deletedAt` on any of the three new review tables — all independently
  grep-verified and/or asserted against live Postgres
- **Strict TDD**: every `RED/GREEN`-annotated task maps to an existing spec
  file; 1738/1738 tests pass at runtime; triangulation evidenced by
  `it.each`/`describe.each` tables in the sources themselves (the detailed
  per-PR TDD Cycle Evidence report was lost to an Engram topic-key overwrite
  — W-1, reconstructed for verification, not blocking)

### Findings
- CRITICAL: 0
- WARNING: 4 — all non-blocking for archive, all evidence/retention gaps
  rather than behavior defects:
  - W-1: `apply-progress` Engram mirror lost detailed per-PR history to
    successive `topic_key` upserts (record-keeping)
  - W-2: "wrong-element-type code behaves like a nonsense code" has no
    covering test — `ElementType` only declares `EXTINGUISHER` today, so
    the fixture is unconstructible; must be added the moment a second type
    ships
  - W-3: "a completed session reads back as it was answered" is not
    directly asserted — the frozen-snapshot e2e test exercises only a
    draft session; the inference is sound (the read path is
    status-agnostic) but not directly evidenced
  - W-4: "Assignments Confer No Permission Outside the Review-Session
    Surface" has no runtime test combining an **active assignment** with a
    403 on admin endpoints — `PermissionsGuard` provably cannot see
    assignment state by construction, but the combination itself is
    untested end-to-end
- SUGGESTION: 5 (an imprecise task-wording nit re: a pre-existing
  QR-decoder devDependency, a scope-list/scope-checker role-filtering edge
  case with no security impact, a self-scoped-endpoint judgment call in the
  8-route scope matrix, a coverage-command scope note, and a reminder that
  the ADR-011 addendum — deliberately deferred by the user — should now be
  resurfaced since the feature has fully shipped)

## Archive Contents

### Files Present in Archive (`openspec/changes/archive/2026-09-08-review-session/`)
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/review-session-management/spec.md` (NEW capability)
- `specs/review-session-ui/spec.md` (NEW capability)
- `specs/authorization/spec.md` (MODIFIED delta)
- `specs/inspectable-element-admin-ui/spec.md` (MODIFIED delta)
- `specs/inspectable-element-management/spec.md` (MODIFIED delta)
- `specs/review-template-management/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

### Verification Checklist
- [x] All 11 files present in archive path, written verbatim from the
      source change folder's content
- [x] No unchecked implementation tasks (all 63/63 marked complete)
- [x] Main specs merged into `openspec/specs/`: 2 new capability specs
      created (`review-session-management`, `review-session-ui`), 4
      existing specs extended with ADDED/MODIFIED/REMOVED requirements
      (`authorization`, `inspectable-element-management`,
      `inspectable-element-admin-ui`, `review-template-management`), no
      existing requirement dropped without an explicit REMOVED/replacement
      pair, every other capability untouched (confirmed deliberate per
      design.md's own File Changes and the proposal's "Untouched by
      design" list)
- [x] Verify report PASS WITH WARNINGS (0 CRITICAL — does not block archive
      per this repo's established archive policy, same as `label-printing`
      and `checklist-management` before it)
- [x] No stray unchecked tasks in the archived `tasks.md`

## Known Limitation of This Archive Run (tooling gap — same class as prior archives)

This `sdd-archive` execution had **no Bash/shell tool available** — only
`Read`/`Write`/`Edit`/`Glob` and the Engram MCP tools. This mirrors the
documented limitation from the `2026-09-04-checklist-management` and
`2026-09-05-label-printing` archives. Concretely, this run was able to:

1. **Create** all 11 files above at
   `openspec/changes/archive/2026-09-08-review-session/` (verbatim content
   from the source change folder).
2. **Overwrite/extend** the 4 affected main spec files and **create** the 2
   new ones in `openspec/specs/`.

It was **not** able to:

1. Delete the original `openspec/changes/review-session/` source folder (a
   true `git mv`/`git rm` requires shell access this session does not have
   — `Write`/`Edit` cannot delete files).
2. Create a branch off `main` for this archive commit (note: this session
   was already working on `review-session/09-verify-and-archive`, which the
   orchestrator provided — the branch itself was not created by this
   phase).
3. Run `git add`, `git status`, `git diff --stat`, or `git commit`.
4. Verify via `git status` that the operation is a rename, not a copy —
   this cannot be confirmed without shell access in this session.

**The orchestrator (or a follow-up shell-capable step) MUST run**, from the
current branch `review-session/09-verify-and-archive` (or a fresh archive
branch off `main`, per this repo's stacked-to-main convention):

```bash
cd D:/SF-Manager
git status   # confirm nothing unexpected is staged/dirty first
git add openspec/specs/authorization/spec.md \
        openspec/specs/inspectable-element-management/spec.md \
        openspec/specs/inspectable-element-admin-ui/spec.md \
        openspec/specs/review-template-management/spec.md \
        openspec/specs/review-session-management/ \
        openspec/specs/review-session-ui/ \
        openspec/changes/archive/2026-09-08-review-session/
git rm -r openspec/changes/review-session
git status   # confirm: 4 spec files modified, 2 new spec dirs created,
             # review-session/ removed from openspec/changes/, and present
             # under openspec/changes/archive/2026-09-08-review-session/
             # (renames where content is identical, new files where this
             # phase authored fresh content — see below)
git diff --stat --cached
git commit -m "docs(review-session): archive SDD change after PR 8/8 merge - all 63 tasks complete, verify PASS WITH WARNINGS"
```

Note on renames vs. new files: `proposal.md`, `design.md`, and `tasks.md`
in the archive destination are byte-identical copies of the source change
folder's files, so `git status` should show these as renames once staged
together with the `git rm`. `verify-report.md` was written directly to the
source change folder by `sdd-verify` in a prior phase and is also
byte-identical when copied to the archive destination — also a rename.
`ARCHIVE-REPORT.md` is new (authored by this phase, never existed in the
source folder). The 6 `specs/**/spec.md` files under the archive
destination are byte-identical copies of the source change folder's delta
specs — also renames. The 4 MODIFIED files under `openspec/specs/` are
edits to pre-existing tracked files; the 2 NEW capability files under
`openspec/specs/review-session-{management,ui}/` are new files with no
prior git history to rename from (their content matches the source delta
spec files verbatim, since these are brand-new capabilities with no prior
merge).

Do NOT push — per this repo's convention, every PR (including a docs-only
archive commit) gets an independent fresh-context review before push and
before merge, confirmed with the user at each step.

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| Phase 1 | PR 1 | Merged | `InspectableElement` active state: migration (no backfill needed — nullable `ADD COLUMN` defaults every existing row to active), entity, mapper, DTO, admin decommission/reactivate control |
| Phase 2 | PR 2 | Merged | Scoped-authorization foundation: 5 new `reviewSession:*` permissions, role activation, `CommunityScopeChecker` port + adapter, `findActiveByUser` on both assignment ports |
| Phase 3 | PR 3 | Merged | Review-session schema (3 tables, 2 enums, 6 hand-written FKs, partial unique draft index, `observations` CHECK) + domain entities and invariants |
| Phase 4 | PR 4 | Merged | Open/resume/list/discard use cases + `SessionAccess` service + template `findActiveByElementType` query + 5 endpoints |
| Phase 5 | PR 5 | Merged | By-code resolution (scope-checked) + record-answer/mark-unreviewed use cases + 2 more endpoints — includes a fresh-context-review CRITICAL fix (`findReviewableById` closing a cross-community write bug) |
| Phase 6 | PR 6 | Merged | Complete-session use case + immutability enforcement + full e2e suite (scope matrix, indistinguishability, immutability x2, frozen snapshot, scope guards, discard cascade, partial completion) |
| Phase 7 | PR 7 | Merged | Web flow: api client, 4 pages (Sessions/New/Detail/Element), first non-`SYSTEM_ADMIN` routes, `HealthPage` entry link, i18n |
| Phase 8 | PR 8 | Merged (`eb2ea79`) | Docs correction (`domain-model-inspections.md`), browser verification (both non-admin roles + admin decommission round-trip), final checks |

All 8 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`
(8 sequential PRs, final merge `eb2ea79`).

## Risks & Mitigations (carried from the proposal, resolved status)

| Risk | Likelihood | Mitigation | Status |
|---|---|---|---|
| The scope check is bypassed on one path | High | `SessionAccess` is the sole session-load path; port exposes no `findById`; e2e scope matrix hits all 8 routes, no sampling | Mitigated — verified |
| Cross-community leakage through by-code lookup | High | `findReviewableByCode` requires `communityId`+`elementType` in the signature, never in the request; indistinguishable rejection proven by e2e deep-equal | Mitigated — verified |
| Slice size overwhelms review | High | Chained `stacked-to-main`, 8 PRs, each independently reviewed; PRs 1-2 shipped independently first | Mitigated — realized as designed |
| `ReviewSession` immutability leaks | Med | Domain-layer guard on all 4 mutators; no `updateById`/status setter on the repository; e2e proves both the permission-gate (403) and domain-guard (409) paths | Mitigated — verified |
| Draft sessions accumulate with no discard path | Med | Discard shipped (Phase 4/6); partial unique index scoped to `draft` frees the pair | Resolved — shipped |
| `observations` gets decided by accident | Med | Design Decision 1 settled it explicitly (on `ElementReviewEntry`, answers XOR observations, 3-layer enforcement) before `sdd-tasks` started | Resolved — decided deliberately |
| The frozen snapshot is bypassed | Med | `findFrozenWithSnapshot` is the sole read path; e2e proves a live-pool edit does not change an open session's rendered wording | Mitigated — verified (post-completion readback W-3, non-blocking) |
| Non-admin users land in a dead app | Med | `HealthPage` role-conditional entry link shipped; browser-verified for both roles | Mitigated — verified |
| `active` ships unsettable | Med | Admin decommission/reactivate control shipped in PR 1 | Resolved — shipped |
| Scope creep into FR-008/FR-009/FR-010 | High | Explicit non-goals; e2e 6.10 + independent grep assert no history route, no scheduling, no `signed`, no export | Mitigated — verified |
| The domain-model doc drifts a fifth time | High | Doc correction shipped in PR 8 | Resolved — shipped |
| ES/CA translations stubbed with English placeholders | Med | 67 real `reviewSession.*` keys in all 3 locales; parity-enforced | Mitigated — verified |
| Incomplete archive (tooling-gap bug class) | Low (mitigated by this report) / **Escalated**: this pass could not delete the source folder, stage, or commit without shell access | See "Known Limitation of This Archive Run" — orchestrator follow-up required | **Partially mitigated — follow-up required** |

## Session Activity Summary

### Phase Completion Record
- **sdd-propose**: 5 product questions closed with stated working
  assumptions, none blocking; two upstream dependencies (element `code`,
  resource-scoped authorization) resolved as CLOSED/OPEN-closed-here
- **sdd-spec**: 6 delta specs written — 2 new capabilities
  (`review-session-management` 13 requirements, `review-session-ui` 10
  requirements), 4 modified capabilities (`authorization`,
  `inspectable-element-management`, `inspectable-element-admin-ui`,
  `review-template-management`)
- **sdd-design**: 11 numbered architecture decisions, each making a novel
  mechanism structural rather than disciplinary; a 2026-09-06 product-owner
  confirmation on the `communityId`-on-open indistinguishability exception;
  a 2026-09-07 correction to Decision 4 for a soft-deleted-community edge
  case found by a PR2 fresh-context review
- **sdd-tasks**: 63 implementation tasks across 8 PR-sized work units, High
  400-line-budget risk forecast, `stacked-to-main` chain, ADR-011 addendum
  explicitly deferred by the user
- **sdd-apply**: 8 sequential PRs implemented and merged to `main`,
  including a fresh-context-review CRITICAL fix in PR5 (cross-community
  write bug on the entry-update endpoint, closed by adding
  `findReviewableById`) and the Decision 4 correction found during PR2's
  review
- **sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 4 WARNING
  (evidence/retention gaps, none implementation defects), 5 SUGGESTION;
  1738/1738 tests independently re-run and confirmed
- **sdd-archive**: This report and spec merges (completion of cycle) —
  **with the file-deletion/staging/commit steps flagged as a required
  orchestrator follow-up** due to lack of shell tooling in this execution
  context, same known limitation class as `checklist-management` and
  `label-printing` before it

### Artifacts Persisted
- Engram: proposal, spec, design, tasks observations already existed;
  apply-progress (degraded, see W-1); verify-report (obs #203); this
  archive-report (new, topic key `sdd/review-session/archive-report`)
- OpenSpec: 6 main spec files created/updated in `openspec/specs/` (2 new
  capabilities, 4 delta merges)
- OpenSpec: 1 archive folder created at
  `openspec/changes/archive/2026-09-08-review-session/` (11 files, verbatim
  copies plus this new report)
- **Pending**: removal of `openspec/changes/review-session/` (source
  folder), staging, and the archive commit — all require a shell-capable
  step (see "Known Limitation of This Archive Run")

## Next Steps

1. **Orchestrator/shell-capable follow-up**: run the git sequence in "Known
   Limitation of This Archive Run" above, on the current branch
   `review-session/09-verify-and-archive`.
2. **Fresh-context review**: per this repo's convention, even a docs-only
   archive commit gets an independent fresh-context review before push and
   before merge — confirm with the user at each step.
3. **Follow-up items surfaced by verify (not archive-blocking)**:
   - Add the wrong-element-type code-rejection test the moment a second
     `ElementType` ships (W-2)
   - Add a completed-session frozen-snapshot readback assertion to the
     existing e2e describe block (W-3, ~10 lines)
   - Add an e2e block proving an active assignment confers no admin-surface
     permission (W-4)
   - Resurface and write the ADR-011 addendum now that the whole feature
     has shipped, including correcting ADR-011's stale
     `CommunityMaintenanceAssignment` reference (S-5)
4. **Close**: once the source-folder removal, staging, and commit land (and
   the fresh-context review + user confirmation complete), the SDD cycle is
   fully complete; the change is archived and ready for reference.

## Traceability

This archive report and all supporting artifacts are linked via Engram
topic keys for cross-session recovery:
- `sdd/review-session/proposal`
- `sdd/review-session/spec`
- `sdd/review-session/design`
- `sdd/review-session/tasks`
- `sdd/review-session/apply-progress` (obs #198, degraded — see W-1)
- `sdd/review-session/verify-report` (obs #203)
- `sdd/review-session/archive-report` → this document (persisted to Engram
  at this topic key)

All specifications now reflected in the main `openspec/specs/` directory,
source of truth for future development.

---

**Archive Status**: CLOSED (content) / PENDING (git operations) — files
merged and written by this phase; source-folder removal, staging, and
commit require the orchestrator's shell-capable follow-up
**Prepared by**: sdd-archive phase (file content) + orchestrator (git
operations, since this session's sdd-archive execution had no shell tool)
**Date**: 2026-09-08
