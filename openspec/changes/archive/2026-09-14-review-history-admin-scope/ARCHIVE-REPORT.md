# Archive Report: System-Admin Review History Scope (FR-008, 4th slice)

**Change**: `review-history-admin-scope`
**Status**: ARCHIVED
**Date**: 2026-09-14
**Artifact Store**: Hybrid (OpenSpec + Engram)

## Executive Summary

`review-history-admin-scope` (FR-008's fourth and last visibility scope
being pursued now: a `SYSTEM_ADMIN` sees **every** `completed` review
session in the installation, with no scope predicate at all — the first
read in the codebase with no narrowing conjunct) shipped as 3 sequential
PRs (#110, #111, #112), all merged to `main` on the `stacked-to-main`
chain, culminating at `a66d9f6`, followed by a 4th docs-only PR (#113,
`585a699`, current `main` HEAD) that corrected the 2 CRITICAL spec-text
findings `sdd-verify` raised against `a66d9f6`. All 37/37 implementation
tasks in `tasks.md` are marked complete; 35 were independently
cross-checked as genuinely true against source on `main`, and the
remaining 2 (task 3.11's migration claim, task 3.5's "verbatim" claim)
were the exact two CRITICALs — both text-only, both now corrected by
PR4, both independently re-confirmed correct by this archive's own
direct inspection of `openspec/specs/**` (not merely trusted from PR4's
own description).

`sdd-verify` ran against `main` @ `a66d9f6` (before PR4) and returned
**PASS WITH WARNINGS** — 2 CRITICAL (both spec/documentation integrity
defects, not code defects; both resolved by PR4), 5 WARNING (all
non-blocking process/tooling gaps, none an implementation defect), 5
SUGGESTION. This archive proceeds per this repo's established policy:
CRITICAL findings block archive only until resolved, and both were
resolved before this run.

This slice's core safety property — the app's first unscoped read is
reachable from exactly one call site — is enforced **structurally**: a
source-scan guard test proves the two new repository methods
(`findCompletedAcrossInstallation`, `findCompletedByIdAcrossInstallation`)
appear in production code only in the port, both adapters, and
`ReviewHistoryAccessService`'s `SYSTEM_ADMIN` branch. The other three
roles' scopes are proven byte-unchanged by a 4-role E2E matrix with no
sampling.

## Engram Observation IDs (Source of Truth)

| Artifact | Topic Key | Notes |
|---|---|---|
| Proposal | `sdd/review-history-admin-scope/proposal` (obs #236) | Complete |
| Specification | `sdd/review-history-admin-scope/spec` (obs #238) | Complete (4 delta specs: `authorization`, `review-history`, `review-history-ui`, `review-session-management`) |
| Design | `sdd/review-history-admin-scope/design` (obs #237) | Complete (4 numbered decisions + one watch-item open question, deliberately left unresolved as a non-blocking future-work note) |
| Tasks | `sdd/review-history-admin-scope/tasks` (obs #239) | Complete (37/37 across 3 phases + 2 fix-ups per `tasks.md` on disk — the canonical count) |
| Verification Report | `sdd/review-history-admin-scope/verify-report` (obs #246) | PASS WITH WARNINGS — 2 CRITICAL (resolved by PR4), 5 WARNING, 5 SUGGESTION |
| Archive Report | `sdd/review-history-admin-scope/archive-report` | This document |

## Merged Specifications (OpenSpec)

Confirmed complete and consistent by this archive's own direct inspection
of `openspec/specs/**`, independently of PR3's own merge and PR4's own
fix — every ADDED requirement, MODIFIED replacement, and the two CRITICAL
corrections from PR4 are present in the corresponding base spec files, at
the exact locations `sdd-verify`'s fix instructions specified.

### Modified Specifications (Delta Merged)

1. **`openspec/specs/authorization/spec.md`**
   - Purpose updated: `SYSTEM_ADMIN` now holds exactly one
     `reviewSession:*` permission (`reviewSession:read`) and is the
     fourth role operational on the review-history read surface, with a
     scope dimension unlike any other role's (the whole installation, no
     predicate). Only `MANAGER` remains fully inert.
   - ADDED: *The System Admin Becomes Operational on Review History
     Reads*, *Installation-Wide Review History Scope for a System Admin*
     — 2 new requirements, 15 new scenarios.
   - MODIFIED: *Resource Scope for Review History Reads* (adds the
     `SYSTEM_ADMIN` row), *The Deferred Review Visibility Scopes Grant
     Nothing* (narrowed to the `MANAGER` half only), *Technician and
     Representative Become Operational* and *The Maintenance Company
     Manager Becomes Operational* (both note the admin's new permission).
   - **C-2 fix independently re-confirmed**: the scenario *"The manager's
     own scope is unchanged by the admin scope"* — authored in the delta
     under *The Maintenance Company Manager Becomes Operational*, dropped
     during PR3's merge, restored by PR4 — is present at
     `openspec/specs/authorization/spec.md:437-440`, in the exact
     position between *"The manager is refused on every review-session
     write endpoint"* and *"MANAGER is untouched and the admin holds read
     only"*, matching `sdd-verify`'s fix instruction precisely.

2. **`openspec/specs/review-history/spec.md`**
   - Purpose updated: four visibility scopes now exist, not three; the
     fourth narrows nothing.
   - ADDED: *A System Admin's Installation-Wide Completed Review History*,
     *A System Admin Can Read Any Completed Session by Identifier* — 2 new
     requirements, 15 new scenarios.
   - MODIFIED: *Scoped Read-Back of One Historical Session* (extends the
     read-back to the admin), *History Scope Is Carried by the Query, Not
     by the Caller* (states the admin scope explicitly), *The Deferred
     Review Visibility Scopes Are Not Built* (narrowed — the `SYSTEM_ADMIN`
     half is no longer deferred).
   - **C-1 fix independently re-confirmed**: the scenario that falsely
     claimed no migration/index was added has been corrected. Confirmed at
     `openspec/specs/review-history/spec.md:566-569`: *"Scenario: This
     change adds no new column, table or backfill"* (correctly scoped to
     the domain model's shape only, not the index), immediately followed
     at lines 571-574 by the new companion scenario *"The installation-wide
     read is backed by a covering index, not a model change"*, which
     explicitly names the composite index on
     `ReviewSession(status, completedAt, id)` and states its purpose (keep
     the unscoped read off a full table scan/filesort) — matching
     `sdd-verify`'s fix instruction precisely.

3. **`openspec/specs/review-history-ui/spec.md`**
   - Purpose updated: four roles now reach the surface, not three.
   - ADDED: *The System Admin Reaches the Shipped History Surface
     Unchanged* — 1 new requirement, 6 new scenarios.
   - MODIFIED: *Role-Gated Route Access for the History Views* (widened to
     the admin), *No Filtering, Analytics or Adjacent Controls Ship*
     (explicit coverage of the installation-wide list).

4. **`openspec/specs/review-session-management/spec.md`**
   - Purpose updated: an installation-wide review read now exists in the
     system (owned by `review-history`, reachable only by `SYSTEM_ADMIN`);
     this capability introduces none of it and its own reads stay
     byte-unchanged.
   - MODIFIED: *Adjacent Review Capabilities Are Not Introduced* (the
     FR-008 deferral guard's wording updated — the `review-history`
     capability now half-implements global visibility; this capability's
     own guard scenario *"The one installation-wide read lives in
     review-history, not here"* replaces the prior wholesale-deferral
     scenario). Wording-only per the delta's own note — no behavioural
     scenario changed (S-2 flags the Phase 2 task label calling this
     "wording-only" when the merge technically split one scenario into
     two; the delta file itself, which is authoritative, documents the
     split correctly).

*(No other existing `openspec/specs/**` capability file was touched by
this change.)*

## Verification Summary

**Verdict**: PASS WITH WARNINGS (2 CRITICAL, both resolved before this
archive; 5 WARNING; 5 SUGGESTION)

### Test Execution (re-run live by `sdd-verify` on `main` @ `a66d9f6`, before PR4; PR4 is docs-only and does not affect these results)
- API unit: 820/820 pass, 108 suites
- API integration (scripted, parallel): 124/125 — 1 pre-existing,
  unrelated flake (`modules/users`, shared-DB worker contention), NOT a
  regression introduced by this change — see W-1
- API integration (`--runInBand`): 125/125 pass, 21 suites
- API e2e: 319/319 pass, 10 suites
- Web (Vitest + RTL): 693/693 pass, 47 files
- Lint: 0 errors, 4 pre-existing warnings (unrelated, untouched)
- Build: PASS, exit 0
- One migration: `20260913210000_add_review_session_status_completed_at_index`
  — a composite index only (PR1 fix-up), no column/table/backfill; the
  only migration this change added, confirmed by direct inspection

### Compliance Matrix
- **37/37 Implementation Tasks**: all marked complete. 35 independently
  cross-checked as genuinely true against `main`; the remaining 2 were
  the exact 2 CRITICAL findings (both text-only claims about the spec/
  migration state, not code) — both corrected by PR4, both re-confirmed
  correct by this archive
- **39/41 Spec Requirements/Scenarios COMPLIANT** at verify time, 1
  PARTIAL (W-3, empty-installation path unproven against real Postgres),
  1 was UNTESTED-and-FALSE at verify time (C-1, now corrected), 1
  scenario was lost in the PR3 merge (C-2, now restored) — net after PR4:
  41/41 present and consistent with shipped behaviour
- **Design Decisions 1, 3, 4 verified exactly as designed.** Decision 2
  verified with one honestly-recorded deviation (task 1.10's NOTE: the
  call-site guard proves 3 production files, not design's stated 4,
  because design's own `**/testing/**` exclusion and its "both adapters"
  expectation are mutually exclusive — the in-memory adapter is proven
  separately by task 1.8's unit tests instead)
- **Scope Guard**: zero drift — no `ManagerCapability` mechanism, no
  `VIEW_ALL_REVIEWS` symbol, `MANAGER` still `[]`, no
  `/review-sessions*` write route widened, unscoped pair reachable from
  exactly one call site (source-scan re-run by hand at verify time) —
  independently re-audited, not only trusted from tasks.md
- **Strict TDD**: 5/6 checks pass at runtime (all 8 RED/GREEN tasks have
  real, passing test files; safety-net regression tests for the other
  three roles present, unmodified, green); the one gap is the
  `apply-progress` artifact's TDD Cycle Evidence table not surviving the
  Engram `topic_key` upsert (W-5) — compensated by direct source
  inspection + full runtime re-run at verify time, nothing left
  genuinely unverified

### Findings
- CRITICAL: 2 — both resolved before this archive, see "Merged
  Specifications" above for the independent re-confirmation of each fix:
  - **C-1** (resolved, PR4): the review-history spec's migration scenario
    falsely claimed no index was added; PR1's fix-up had in fact shipped a
    composite performance index. Corrected to state what shipped and why.
  - **C-2** (resolved, PR4): one authorization delta scenario ("the
    manager's own scope is unchanged by the admin scope") was dropped
    during PR3's spec merge. Restored verbatim at the specified location.
- WARNING: 5 — all non-blocking, all recorded as follow-ups, none fixed
  in this archive (consistent with ADR-006 walking-skeleton discipline —
  this archive closes what was actually built):
  - **W-1**: the scripted `npm run test:integration` command is
    non-deterministic against the shared dev DB (pre-existing,
    `modules/users`, third consecutive change to note a variant)
  - **W-2**: an integration test's title claims "never a draft" without
    asserting it against real Postgres (proven at e2e/in-memory layers
    instead)
  - **W-3**: the empty-installation path is proven only at the in-memory
    layer, not against real Postgres (shared-DB isolation limitation)
  - **W-4**: the `Promise.all` N+1-fix concurrency test runs as
    `COMMUNITY_REPRESENTATIVE` rather than `SYSTEM_ADMIN`, the role whose
    scope removal created the risk (the fix is still genuinely proven —
    the mechanism is role-agnostic shared code)
  - **W-5**: `apply-progress`'s TDD Cycle Evidence table did not survive
    the Engram topic-key upsert — the fourth consecutive change to record
    this exact cross-change process recommendation
- SUGGESTION: 5 — an off-by-one comment (permission table "28th"/"27th"
  entry, S-1), a mislabeled "wording-only" delta that actually split a
  scenario (S-2), a stale port-file docstring contradicting itself 130
  lines apart (S-3, pre-existing since the company-scope slice), unchecked
  proposal Success Criteria checkboxes (S-4, see below), and a
  weaker-than-ideal `resolves.not.toBeNull()` assertion pattern in a few
  soft-delete visibility tests (S-5)

All WARNING/SUGGESTION items are recorded as follow-ups (see Next Steps),
not fixed in this archive — consistent with ADR-006 walking-skeleton
discipline: this archive closes what was actually built, not what could
additionally be polished.

## Archive Contents

### Files Present in Archive (`openspec/changes/archive/2026-09-14-review-history-admin-scope/`)
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/authorization/spec.md` (ADDED + MODIFIED delta)
- `specs/review-history/spec.md` (ADDED + MODIFIED delta)
- `specs/review-history-ui/spec.md` (ADDED + MODIFIED delta)
- `specs/review-session-management/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

### Verification Checklist
- [x] All 9 files present in archive path, copied from the source change
      folder / Engram with no content changes beyond this report's own
      addition
- [x] No unchecked implementation tasks (37/37 marked complete)
- [x] Main specs merged into `openspec/specs/`: 4 existing capability
      specs extended (`authorization`, `review-history`,
      `review-history-ui`, `review-session-management`) — already done in
      PR3 (tasks 3.5-3.8), with the 2 CRITICAL findings corrected by PR4
      (#113) and independently re-confirmed correct at archive time by
      direct inspection of the merged files (see Merged Specifications
      above)
- [x] Verify report PASS WITH WARNINGS — both CRITICAL findings resolved
      before archive; no unresolved CRITICAL blocks archive per this
      repo's established policy
- [x] No stray unchecked tasks in the archived `tasks.md`

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| Phase 1 | PR 1 (#110, `00aeacd`) | Merged | Unscoped repository pair + both adapters + access-service `SYSTEM_ADMIN` branch + port-surface allowlist (8→10) + call-site source-scan guard. Fix-up: perf composite index (1.13), `Promise.all` N+1 fix (1.14), 3 WARNING-level readability/reliability fixes (1.15-1.17) from a pre-push 4R fresh-context review |
| Phase 2 | PR 2 (#111, `390b36e`) | Merged | `ROLE_PERMISSIONS` entry + unit test + 4-role E2E visibility matrix incl. deactivated/soft-deleted cases. Fix-up: pre-existing PR1 wording defect in a guard-test-adjacent comment (2.8), discovered running e2e for the first time |
| Phase 3 | PR 3 (#112, `a66d9f6`) | Merged | Web role-widening (`App.tsx`, `HealthPage.tsx` + tests), 4 delta-spec merges into `openspec/specs/**`, FR-008 status update, full-suite verification, live browser verification |
| Phase 4 (fix-up) | PR 4 (#113, `585a699`) | Merged | Docs-only follow-up: corrected the 2 CRITICAL findings from `sdd-verify` (C-1 migration-scenario text, C-2 dropped authorization scenario) |

All 4 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`,
`ask-on-risk`. No PR in this chain required a `size:exception` — the
proposal's own forecast of "materially smaller than the previous two
slices" held. Final merge `585a699`.

## Risks & Mitigations (carried from the proposal, resolved status)

| Risk | Mitigation | Status |
|---|---|---|
| The unscoped method is reachable from a non-admin path, turning the app's first "see everything" query into a leak | Called from exactly one branch of one service; source-scan call-site guard test; E2E four-role matrix, no sampling | Mitigated — verified, re-confirmed by hand-run scan at `sdd-verify` |
| The unscoped by-id method becomes a de facto bare `findById`, destroying the shipped invariant | Naming (`…AcrossInstallation`) + allowlist guard + call-site guard + intent comment (design Decisions 1-2) | Mitigated — verified |
| A reviewer or later slice "fixes" the intentional bare `WHERE` as a bug | Spec asserts the unscoped read as intended behaviour with its own scenario; port comment states it; a re-narrowing test would fail | Mitigated — verified |
| Scope creep into `MANAGER`/`VIEW_ALL_REVIEWS` | Explicit non-goal; `sdd-verify` re-confirmed `MANAGER` still `[]` and no `ManagerCapability`/`VIEW_ALL_REVIEWS` symbol exists anywhere | Mitigated — verified |
| The installation-wide list is unusable with no filter/sort/pagination | Accepted deliberately and on record; browser-verified at realistic volume (~300+ rows) with no observable pain measured | Mitigated — measured, not assumed |
| Widening the shipped pages breaks the three roles already using them | Same surface, no variant; component/route tests assert all four roles; browser-verified for the admin, test-verified for the other three (change to their paths is provably zero lines) | Mitigated — verified |
| `SYSTEM_ADMIN` gaining its first `reviewSession:*` permission reads as "admin can perform reviews" | Exactly one permission added; spec scenario asserts no create/perform/complete/discard; write routes NOT widened, confirmed | Mitigated — verified |

## FR-008 Status (confirmed accurate)

**FR-008 does NOT close with this slice.** Per
`docs/requirements/functional-requirements.md` (updated by task 3.9,
independently re-confirmed by `sdd-verify` and again by this archive):
the `SYSTEM_ADMIN` global-visibility half now ships. What explicitly
remains, named on record and not started here:

- **`MANAGER` + `VIEW_ALL_REVIEWS`** — its own later slice, which must
  also answer how the `ManagerCapability` mechanism gets granted (no
  admin UI to grant it exists; standing it up now would ship
  unreachable code). This slice deliberately touched nothing of it — no
  enum, no column, no migration, no capability-gated permission layer —
  confirmed by a source-wide symbol scan at both `sdd-verify` and this
  archive.
- **Per-element history** — FR-008's other half, a different query axis
  that would reverse `review-history-ui`'s standing "No Filtering,
  Analytics or Adjacent Controls Ship" rule. Its own future
  exploration/proposal.
- **App-wide filtering/sorting/pagination/search** — the cross-cutting
  initiative named in `review-history-company-scope`, still not started;
  the installation-wide list (now by far the largest in the app) is the
  strongest incentive for it yet, and remains an accepted, deliberate
  limitation of this slice.

## Session Activity Summary

### Phase Completion Record
- **sdd-explore / sdd-propose / sdd-spec / sdd-design**: completed in a
  prior session (2026-09-13), producing the proposal, 4 delta specs, and
  4 numbered design decisions plus a deliberately-open watch-item
- **sdd-tasks**: 37 implementation tasks across 3 phases plus 2
  in-flight fix-ups, `ask-on-risk` delivery strategy, `stacked-to-main`
  chain, following the proposal's own 3-PR sketch with no restructuring
- **sdd-apply**: 3 planned PRs implemented and merged to `main`, each
  followed by a fresh-context review that caught and fixed real issues
  before push (PR1: 2 CRITICAL + 3 WARNING from a 4R review; PR2: 1
  pre-existing PR1 wording defect found running e2e for the first time)
- **sdd-verify**: PASS WITH WARNINGS — 2 CRITICAL (both spec-text
  integrity defects, not code defects), 5 WARNING (process/tooling gaps,
  none an implementation defect), 5 SUGGESTION; all test suites
  independently re-run and confirmed (2588 total test executions across
  unit/integration/e2e/web); all 4 spec merges independently
  re-inspected, finding the 2 CRITICALs
- **PR4 (post-verify fix-up, #113)**: docs-only, corrected both
  CRITICALs per `sdd-verify`'s exact fix instructions — no code change
- **sdd-archive**: this report. Both CRITICAL corrections independently
  re-confirmed present and correct by this archive's own direct
  inspection of `openspec/specs/**` (not merely trusted from PR4's
  description) — completion of the SDD cycle

### Artifacts Persisted
- Engram: proposal (#236), design (#237), spec (#238), tasks (#239),
  verify-report (#246) already existed from the planning/apply/verify
  phases; archive-report (new, topic key
  `sdd/review-history-admin-scope/archive-report`)
- OpenSpec: 4 main spec files updated in `openspec/specs/` — already
  done in PR3 (tasks 3.5-3.8), with PR4's 2 CRITICAL corrections; this
  archive did not re-merge them, only independently re-confirmed the
  merge and both corrections
- OpenSpec: 1 archive folder created at
  `openspec/changes/archive/2026-09-14-review-history-admin-scope/`
  (9 files)
- `openspec/changes/review-history-admin-scope/` (source folder): **NOT
  removed by this archive run** — see Known Limitation below

## Known Limitation — Source Folder Not Removed, No Git Commit Performed by This Sub-Agent

This `sdd-archive` execution had access only to file-read/file-write
tools (`Read`, `Edit`, `Write`, `Glob`) and Engram tools — **no shell/Bash
tool and no file-delete/move primitive were available in this session**,
identically to the prior `review-history-company-scope` archive run. As a
direct consequence:

1. **The source folder `openspec/changes/review-history-admin-scope/`
   was NOT deleted.** All 7 of its files (proposal, design, tasks, 4
   delta specs) have been byte-for-byte copied to the new archive path
   `openspec/changes/archive/2026-09-14-review-history-admin-scope/`
   (which additionally now contains `verify-report.md`, reconstructed
   from Engram obs #246 since it was never written to disk during
   `sdd-verify`, and this `ARCHIVE-REPORT.md`), but the original folder
   still exists on disk alongside the archive copy.
2. **No `git add`/`git commit` was performed.** The user's request to
   stage and commit the archive move on a new branch
   `review-history-admin-scope/05-sdd-archive` requires shell/git access
   this run did not have.

**Recommended remediation** (for the orchestrator or a follow-up session
with shell access):
1. Create branch `review-history-admin-scope/05-sdd-archive` from `main`.
2. Delete `openspec/changes/review-history-admin-scope/` (the source
   folder) now that its full contents are duplicated, verified complete,
   and byte-identical (plus the reconstructed `verify-report.md` and this
   `ARCHIVE-REPORT.md`) in the archive path.
3. `git add openspec/changes/archive/2026-09-14-review-history-admin-scope/`
   and the deletion of the source folder (the specs under
   `openspec/specs/` were already merged and committed in PR3/PR4 —
   confirm no diff there).
4. Commit with a conventional-commit message:
   `docs(review-history-admin-scope): archive change`.
5. Do NOT push without a separate explicit confirmation, per this repo's
   established convention (CLAUDE.md: every PR/commit gets independent
   confirmation before push) — and per this repo's convention, get an
   independent fresh-context review of the archive commit before push
   and before merge, same as every other PR in this chain.

This is recorded here rather than silently worked around, per the
instruction to report accurately rather than claim an action was taken
that was not.

## Next Steps

1. **Complete the archive mechanically**: create the branch, remove the
   source `openspec/changes/review-history-admin-scope/` folder, and
   commit the archive (see Known Limitation above) — requires shell/git
   access this `sdd-archive` run did not have.
2. **Fresh-context review**: per this repo's convention, even a docs-only
   archive commit gets an independent fresh-context review before push
   and before merge — confirm with the user at each step.
3. **Follow-up items surfaced by verify (not archive-blocking, not part
   of this change)**:
   - Close W-1: scope `countActiveByRole()`'s integration test to a
     seeded role/company instead of counting the whole table, or pin the
     `test:integration` npm script to `--runInBand` (belongs to
     `modules/users`, now flagged a third time)
   - **Act on W-5's now-fourth recommendation**: switch `apply-progress`
     to per-phase/per-PR Engram topic keys, or persist a TDD evidence
     table into an on-disk `apply-progress.md` — raised at the end of
     four consecutive changes (`review-session`, `review-history`,
     `review-history-company-scope`, `review-history-admin-scope`)
     without being acted on
   - W-2: assert draft exclusion explicitly in the real-Postgres
     integration test, not just the title
   - W-3: close the empty-installation gap at the integration layer once
     per-test DB isolation exists (cross-cutting test-infra work)
   - W-4: re-point the `Promise.all` concurrency test at `SYSTEM_ADMIN`,
     the role whose scope removal created the risk it proves
   - S-1: correct the "28th"/"27th" permission-entry off-by-one in
     design.md, task 2.1, and the proposal (three artifacts)
   - S-2: correct the Phase 2 task label calling the
     `review-session-management` delta "wording-only" (it split one
     scenario into two)
   - S-3: reconcile `review-session.repository.port.ts`'s stale
     "only by-id read" docstring against the file's own correct restated
     invariant 130 lines later (pre-existing since the company-scope
     slice)
   - S-4: no action required — proposal Success Criteria checkboxes are
     historical planning artifacts inside an archived folder; not
     re-ticked, consistent with the company-scope slice's own archive
     precedent
   - S-5: tighten `resolves.not.toBeNull()` soft-delete visibility
     assertions to `resolves.toMatchObject({ id: … })` where currently
     loose
   - FR-008's remaining scope (`MANAGER` + `VIEW_ALL_REVIEWS`, the whole
     `ManagerCapability` mechanism, and per-element history) — each its
     own future slice, explicitly deferred and guarded against scope
     creep in this change (confirmed clean at both verify and archive)
   - The app-wide filtering/sorting/pagination/search initiative — named
     on record as the eventual remedy for the installation-wide list's
     unbounded size (now the largest list in the app), not started,
     stubbed or parameterized here
4. **Close**: once the source folder is removed, the fresh-context review
   + user confirmation complete, and the commit merges, the SDD cycle is
   fully complete; the change is archived and ready for reference.

## Traceability

This archive report and all supporting artifacts are linked via Engram
topic keys for cross-session recovery:
- `sdd/review-history-admin-scope/proposal` (obs #236)
- `sdd/review-history-admin-scope/design` (obs #237)
- `sdd/review-history-admin-scope/spec` (obs #238)
- `sdd/review-history-admin-scope/tasks` (obs #239)
- `sdd/review-history-admin-scope/verify-report` (obs #246)
- `sdd/review-history-admin-scope/archive-report` → this document

All specifications now reflected in the main `openspec/specs/` directory,
source of truth for future development.

---

**Archive Status**: CLOSED (artifact-complete; mechanical source-folder
removal and git commit pending shell/git access — see Known Limitation)
**Prepared by**: `sdd-archive` sub-agent (this run had file read/write and
Engram tools only; no shell/Bash tool was available for file
deletion/move or git operations)
**Date**: 2026-09-14
