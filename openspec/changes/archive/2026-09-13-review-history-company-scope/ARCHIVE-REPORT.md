# Archive Report: Company-Scoped Review History (FR-008, third slice)

**Change**: `review-history-company-scope`
**Status**: ARCHIVED
**Date**: 2026-09-13
**Artifact Store**: Hybrid (OpenSpec + Engram)

## Executive Summary

`review-history-company-scope` (FR-008's third visibility scope: a
`MAINTENANCE_COMPANY_MANAGER` sees every `completed` review session
performed on behalf of their own maintenance company, across every
technician and community, attributed by a company snapshot frozen onto
the session at performance time) shipped as 7 sequential PRs (#103-#109),
all merged to `main` in order on the `stacked-to-main` chain, culminating
in `809c628`. All 71/71 implementation tasks in `tasks.md` are marked
complete and were independently cross-checked against `main` by
`sdd-verify`, not trusted from checkboxes alone. `sdd-verify` returned
**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING (both evidence/tooling
gaps, not implementation defects), 4 SUGGESTION. This is a clean pass;
archiving proceeds per the verify report's own closing line: "No CRITICAL
issue blocks it."

This slice's three security guarantees — fail-closed on a null company on
both sides, an indistinguishable 404 across all three roles, and
attribution frozen at creation with no update path — are each enforced
**structurally** (an early return before any repository call, a single
throw site, and the physical absence of any second write path), the same
discipline the `review-session` and `review-history` slices established.

## Engram Observation IDs (Source of Truth)

| Artifact | Topic Key | Notes |
|---|---|---|
| Proposal | `sdd/review-history-company-scope/proposal` | Complete |
| Specification | `sdd/review-history-company-scope/spec` | Complete (4 delta specs: `authorization`, `review-history`, `review-history-ui`, `review-session-management`, all modified/extended) |
| Design | `sdd/review-history-company-scope/design` | Complete (11 numbered decisions, an Open Questions section with both items closed with real content at archive time) |
| Tasks | `sdd/review-history-company-scope/tasks` | Complete (71/71 across 6 phases per `tasks.md` on disk — the canonical count) |
| Apply Progress | `sdd/review-history-company-scope/apply-progress` (13+ revisions) | Full Phase 1-6 history recorded across successive upserts; per-task TDD Cycle Evidence detail did not survive to the final revision (verify-report W-2 — same recurring class of loss flagged in the prior two archived changes) |
| Verification Report | `sdd/review-history-company-scope/verify-report` (obs #232) | PASS WITH WARNINGS — 0 CRITICAL, 2 WARNING, 4 SUGGESTION |
| Archive Report | `sdd/review-history-company-scope/archive-report` | This document |

## Merged Specifications (OpenSpec)

Confirmed complete and consistent by this archive's own inspection of
`openspec/specs/**`, independently of `sdd-verify`'s own confirmation —
every ADDED requirement, MODIFIED replacement, RENAME and Purpose
amendment from all 4 delta specs is present in the corresponding base
spec, with no stale requirement name surviving except inside an intended
`(Previously: ...)`/`(Reason: ...)` provenance note. No gap found; no
reconciliation was needed.

### Modified Specifications (Delta Merged)

1. **`openspec/specs/authorization/spec.md`**
   - Purpose updated: `MAINTENANCE_COMPANY_MANAGER` is no longer fully
     inert — it becomes operational on review-history reads only, holding
     `reviewSession:read` alone, and is the first role whose resource
     scope is not a set of communities.
   - ADDED: *The Maintenance Company Manager Becomes Operational*,
     *Company-Wide Review History Scope for a Maintenance Company
     Manager* — 2 new requirements, ~13 new scenarios.
   - MODIFIED: *Resource Scope for Review History Reads* (adds the
     company scope row and the technician's own-history-survives-
     deactivation reversal), *The Deferred Review Visibility Scopes Grant
     Nothing* (narrowed to global/`ManagerCapability` only), *Technician
     and Representative Become Operational* and *Non-Admin Roles Remain
     Inert After the Checklist Permissions Are Added* (both note the
     manager's new single permission).
   - RENAMED: *Maintenance-Role Permissions Stay Inert* → *The Company
     Association Itself Confers No Permission* (the old name no longer
     holds once the manager gains a permission).

2. **`openspec/specs/review-history/spec.md`**
   - Purpose updated: three visibility scopes now exist, not two; the
     third is not resolved by the community-scope check.
   - ADDED: *A Maintenance Company Manager's Company-Wide Completed
     Review History* — 1 new requirement, 8 new scenarios.
   - MODIFIED: *Scoped Read-Back of One Historical Session* (extends the
     read-back to the manager), *History Scope Is Carried by the Query,
     Not by the Caller* (adds the company dimension), *History Access
     Requires a Currently Active Community Assignment, Except for One's
     Own Performed Sessions* (the technician own-history reversal — see
     RENAMED below), *The Deferred Review Visibility Scopes Are Not
     Built* (narrowed — company-wide visibility is no longer deferred).
   - RENAMED: *History Access Requires a Currently Active Community
     Assignment, Including for One's Own Sessions* → *…, Except for
     One's Own Performed Sessions* — the 2026-09-08 confirmation was
     reversed by the product owner on 2026-09-09; the E2E scenario was
     inverted in place per the migration note, not deleted.

3. **`openspec/specs/review-history-ui/spec.md`**
   - Purpose updated: three roles now reach the surface, not two; the
     manager reaches it without crossing the `/review-sessions` write
     surface.
   - ADDED: *A Reachable Entry Point for the Maintenance Company Manager
     That Bypasses the Write Surface* — 1 new requirement, 4 new
     scenarios.
   - MODIFIED: *Role-Gated Route Access for the History Views* (widened
     to the manager), *The History List Renders the Server-Scoped Result
     Unfiltered* (adds the performer-identification requirement for a
     multi-performer caller), *No Filtering, Analytics or Adjacent
     Controls Ship* (explicit coverage of the company-wide list).

4. **`openspec/specs/review-session-management/spec.md`**
   - Purpose updated: company-wide visibility no longer out of scope
     (owned by `review-history`); this capability gains a write-path
     fact only — the frozen company attribution.
   - ADDED: *A Session Records the Company on Whose Behalf It Was
     Performed* — 1 new requirement, 7 new scenarios.
   - MODIFIED: *Adjacent Review Capabilities Are Not Introduced*
     (narrowed — company-wide is no longer deferred; global visibility
     and per-element history remain forbidden).

*(No other existing `openspec/specs/**` capability file was touched by
this change.)*

## Verification Summary

**Verdict**: PASS WITH WARNINGS

### Test Execution (re-run live by `sdd-verify` on `main` @ `ee2c00c`, 7/7 PRs merged)
- API unit: 813/813 pass, 108 suites
- API integration: 122/122 pass, 21 suites (serially; one pre-existing,
  unrelated flake in `modules/users` under parallel-worker contention —
  see W-1 below)
- API e2e: 310/310 pass, 10 suites
- Web (Vitest + RTL): 690/690 pass, 47 files
- **Total: 1935/1935 pass**
- Build: clean, forced non-cached run, 4 turbo tasks, exit 0
- Lint: 0 errors, 4 pre-existing warnings (unrelated file, untouched by
  this change)
- One migration: `20260909090000_add_review_session_performed_by_company`
  — column, index, hand-written FK (ADR-013), all-rows backfill; the only
  migration directory added by this change, confirmed by direct
  inspection

### Compliance Matrix
- **71/71 Implementation Tasks**: all marked complete, independently
  cross-checked against current `main` across all 6 phases — not trusted
  from checkboxes
- **52/52 Spec Requirements/Scenarios COMPLIANT**, 0 UNTESTED, 0 FAILING,
  0 PARTIAL
- **11/11 Design Decisions verified** — all implemented exactly as
  designed, zero unrecorded deviations; the five documented deviations in
  `tasks.md` (2.6's deferred two-method deletion — fully discharged by
  Phase 3; 4.6's inverted-in-place test; 4.11's declaration-shaped symbol
  match; 4.12's direct seeding; 5.6/5.8's `ProtectedRoute.test.tsx`
  placement) were each independently confirmed correct
- **Scope Guard**: zero drift — no `ManagerCapability` mechanism, no
  global/per-element history route, no list-control parameter on any
  scope including the company-wide one, repository port still exposes no
  unscoped `findById`, `modules/users/**`/`modules/maintenance-company/**`
  gained no new manager-facing CRUD — independently re-audited by
  `sdd-verify`, not only trusted from task 6.9
- **Strict TDD**: 5/6 checks pass at runtime (1935/1935 tests green,
  table-driven triangulation visible in the sources — e.g.
  `user-company-scope.checker.spec.ts`'s describe.each over 5 roles × 3
  states — and `session-access.service.spec.ts` unmodified/green as the
  write-path sibling's own proof of non-interference); the one gap is the
  apply-progress artifact's TDD Cycle Evidence table not surviving 13
  Engram `topic_key` upserts (W-2)

### Findings
- CRITICAL: 0
- WARNING: 2 — both non-blocking for archive, both process/tooling gaps
  rather than implementation defects:
  - **W-1**: `npm run test:integration`'s scripted (parallel) form is
    non-deterministic — `prisma-user.repository.integration.spec.ts >
    countActiveByRole()` failed once under worker contention against a
    shared, non-reset dev Postgres, passed both in isolation and with
    `--runInBand`. Pre-existing, in an unrelated module (`modules/users`,
    inherited from the archived `user-management-roles` change), not a
    `review-history-company-scope` regression. This is the **third**
    consecutive verify report to note a variant of shared-DB test
    contention in this repo.
  - **W-2**: the Engram `apply-progress` artifact carries no per-task
    TDD Cycle Evidence table — the topic key is an upsert, and 13
    revisions overwrote earlier phases' records down to a Phase 6
    narrative. The evidence the table exists to protect is present by
    other means (RED/GREEN markers on 22 tasks in `tasks.md`, every named
    test file exists and passes at runtime, assertion-quality audit found
    nothing trivial) — what is genuinely not provable retroactively is
    test-FIRST ordering. This is the **third** consecutive change's
    verify/archive report to raise this exact recommendation
    (`review-session`'s W-1, `review-history`'s W-2, now this change's
    W-2): switch `apply-progress` to per-phase or per-PR Engram topic
    keys so revisions do not destroy earlier phases' evidence, or persist
    a TDD evidence table into an on-disk `apply-progress.md` alongside
    `proposal.md`/`design.md`/`tasks.md`. Not acted on in this archive
    (it is a cross-change process change, out of scope for a single
    change's archive) but now recorded a third time.
- SUGGESTION: 4 — an untested by-id counterpart of an already-tested
  fail-closed backstop (S-1), a weaker-than-ideal placeholder assertion
  mirroring a pre-existing pattern (S-2), Swagger 404-description drift
  that under-describes two new cases while behavior stays correct (S-3),
  and a recorded-but-accepted layering seam where the e2e matrix exercises
  in-memory doubles rather than the real Postgres predicate for the
  company scope, covered instead by a dedicated integration suite plus
  browser verification (S-4).

All WARNING/SUGGESTION items are recorded as follow-ups (see Next Steps),
not fixed in this change — consistent with ADR-006 walking-skeleton
discipline: this archive closes what was actually built, not what could
additionally be polished.

## Archive Contents

### Files Present in Archive (`openspec/changes/archive/2026-09-13-review-history-company-scope/`)
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/authorization/spec.md` (MODIFIED delta)
- `specs/review-history/spec.md` (MODIFIED delta)
- `specs/review-history-ui/spec.md` (MODIFIED delta)
- `specs/review-session-management/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

### Verification Checklist
- [x] All 9 files present in archive path, copied from the source change
      folder with no content changes beyond this report's own addition
- [x] No unchecked implementation tasks (71/71 marked complete)
- [x] Main specs merged into `openspec/specs/`: 4 existing capability
      specs extended/narrowed (`authorization`, `review-history`,
      `review-history-ui`, `review-session-management`) — already done in
      PR 7 (tasks 6.3-6.6), independently re-confirmed byte-for-byte
      faithful by both `sdd-verify` and this archive's own direct
      inspection (see Merged Specifications above)
- [x] Verify report PASS WITH WARNINGS (0 CRITICAL — does not block
      archive per this repo's established policy)
- [x] No stray unchecked tasks in the archived `tasks.md`

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| Phase 1 | PR 1 (#103) | Merged | Migration + backfill + write-path snapshot (`performedByCompanyId`), `UserDirectory.findMaintenanceCompanyId` |
| Phase 2a | PR 2a (#104) | Merged | `CompanyScopeChecker` Layer 2 authorization port + adapter + module wiring |
| Phase 2b | PR 2b (#105) | Merged | Repository scope methods (+4), both adapters. Deviation: the two orphaned `…ForPerformerInCommunities` methods deliberately kept, deferred to Phase 3 |
| Phase 3 | PR 3 | Merged | Access-service reversal (technician own-history) + company branch + use cases + performer-email read. Over budget (~1105 lines, `size:exception` accepted) |
| Phase 4 | PR 4 | Merged | `ROLE_PERMISSIONS` wiring + full E2E three-role visibility matrix. Over budget (~721 lines, `size:exception` accepted) |
| Phase 5 | PR 5 | Merged | Web: role-widening, manager entry point, performer column, i18n. Under budget (~337 lines) |
| Phase 6 | PR 6/7 (#109, merged at `809c628`) | Merged | ADR-011 addendum, FR-008 status, 4 delta-spec merges, full-suite checks, browser verification (6.8), final scope-guard confirmation (6.9) |

All 7 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`,
`ask-on-risk` delivery strategy; three phases (2b, 3, 4) plus the docs
phase exceeded the 400-line review budget, each accepted as a
`size:exception` with the user's explicit sign-off at the time — recorded
by `sdd-verify` as "the process working, not silent drift." Final merge
`809c628`.

## Risks & Mitigations (carried from the proposal, resolved status)

| Risk | Mitigation | Status |
|---|---|---|
| A company query leaks another company's sessions, or a null company degrades to an unfiltered read | Fail-closed stated as binding in the proposal; scope lives in the port signature; E2E asserts the full three-role matrix plus both null cases explicitly, no sampling | Mitigated — verified (e2e + integration) |
| The backfill is wrong or partially applied | Migration is its own PR with a real-Postgres integration test asserting row-level attribution; wrongness for already-transferred technicians is a stated, accepted limitation | Mitigated — verified |
| The write path forgets the snapshot on some creation route | Column written in the session's own creation path only, no second writer exists; test asserts every newly created session carries the performer's company | Mitigated — verified (structural, not just test-enforced) |
| The manager is forced through the community-assignment gate | Manager scope resolution bypasses `CommunityScopeChecker` entirely by design; e2e asserts the manager's scope requires no community assignment of any kind | Mitigated — verified |
| Scope creep into global visibility | Explicit non-goal; `sdd-verify` re-confirmed `MANAGER` still `[]`, `SYSTEM_ADMIN` holds no `reviewSession:*`, no `ManagerCapability`/`VIEW_ALL_REVIEWS` symbol exists | Mitigated — verified |
| The company list is large and unusable with no filter/sort/pagination | Accepted deliberately and on record; browser-verified at seeded volume with no observable pain (design.md Open Questions, closed) | Mitigated — measured, not assumed |
| A migration on `ReviewSession` breaks the hand-written FK/index conventions Prisma cannot see | Extended the shipped migration integration-test precedent rather than trusting Prisma's diff | Mitigated — verified |
| Widening the shipped pages breaks the two roles already using them | Same surface, no variant, per the shipped UI requirement; component tests assert all three roles' rendering; browser-verified | Mitigated — verified |
| The ADR-011 addendum slips a third time | Shipped in Phase 6 per the settled decision, all 5 required content points present in order | Mitigated — realized as designed |
| ES/CA translations stubbed with English placeholders | Real translations shipped; `locales.test.ts` parity guard covers new keys | Mitigated — verified |

## Session Activity Summary

### Phase Completion Record
- **sdd-explore / sdd-propose / sdd-spec / sdd-design**: completed in a
  prior session (2026-09-09), producing the proposal, 4 delta specs, and
  11 design decisions plus an Open Questions section
- **sdd-tasks**: 71 implementation tasks across 6 phases, `ask-on-risk`
  delivery strategy, `stacked-to-main` chain, refined from the proposal's
  5-PR sketch to 6-7 PRs (PR 2 split into 2a/2b post-implementation)
- **sdd-apply**: 7 sequential PRs implemented and merged to `main`. Four
  phases (2b, 3, 4, and the docs phase) exceeded the 400-line review
  budget, each explicitly confirmed with the user as a `size:exception`
  rather than silently accepted
- **sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 2 WARNING (both
  process/tooling gaps: shared-DB integration test flake, apply-progress
  TDD-evidence retention — neither an implementation defect), 4
  SUGGESTION; 1935/1935 tests independently re-run and confirmed; all 4
  spec merges independently re-verified byte-for-byte faithful; a
  prior-risk item (PR 2b's malformed-UUID integration-test bug)
  explicitly re-checked and confirmed fixed
- **sdd-archive**: this report. Delta-spec merge into
  `openspec/specs/**` independently re-confirmed complete and consistent
  by direct file inspection before archiving (no gaps found, no
  reconciliation needed) — completion of the SDD cycle

### Artifacts Persisted
- Engram: proposal, spec, design, tasks, apply-progress observations
  already existed from the planning and apply phases; verify-report
  (obs #232); archive-report (new, topic key
  `sdd/review-history-company-scope/archive-report`)
- OpenSpec: 4 main spec files updated in `openspec/specs/` — already done
  in PR 6/7 (this archive did not re-merge them, only independently
  re-confirmed the merge)
- OpenSpec: 1 archive folder created at
  `openspec/changes/archive/2026-09-13-review-history-company-scope/`
  (9 files)
- `openspec/changes/review-history-company-scope/` (source folder):
  **NOT removed by this archive run** — see Known Limitation below

## Known Limitation — Source Folder Not Removed, No Git Commit Performed

This `sdd-archive` execution had access only to file-read/file-write
tools (`Read`, `Edit`, `Write`, `Glob`) and Engram tools — **no shell/Bash
tool and no file-delete/move primitive were available in this session**.
As a direct consequence:

1. **The source folder `openspec/changes/review-history-company-scope/`
   was NOT deleted.** All 8 of its files (proposal, design, tasks,
   verify-report, 4 delta specs) have been byte-for-byte copied to the
   new archive path
   `openspec/changes/archive/2026-09-13-review-history-company-scope/`,
   but the original folder still exists on disk alongside the archive
   copy. A "move" in the sense the `sdd-archive` skill specifies (source
   folder relocated, not duplicated) was not achievable with the tools
   available this run.
2. **No `git add`/`git commit` was performed.** Step 5 of the requested
   task ("stage and commit the result directly") requires shell/git
   access this run did not have.

**Recommended remediation** (for the orchestrator or a follow-up session
with shell access):
- Delete `openspec/changes/review-history-company-scope/` (the source
  folder) now that its full contents are duplicated, verified complete,
  and byte-identical in the archive path.
- `git add openspec/changes/archive/2026-09-13-review-history-company-scope/
  openspec/specs/` (the specs were already merged and committed in PR
  6/7 — confirm no diff) and the deletion of the source folder, then
  commit with a conventional-commit message, e.g.:
  `docs(review-history-company-scope): archive change`.
- Do not push without a separate explicit confirmation, per this repo's
  established convention (CLAUDE.md: every PR/commit gets independent
  confirmation before push).

This is recorded here rather than silently worked around, per the
instruction to report accurately rather than claim an action was taken
that was not.

## Next Steps

1. **Complete the archive mechanically**: remove the source
   `openspec/changes/review-history-company-scope/` folder and commit
   the archive (see Known Limitation above) — requires shell/git access
   this `sdd-archive` run did not have.
2. **Fresh-context review**: per this repo's convention, even a
   docs-only archive commit gets an independent fresh-context review
   before push and before merge — confirm with the user at each step.
3. **Follow-up items surfaced by verify (not archive-blocking, not part
   of this change)**:
   - Close W-1: scope `countActiveByRole()`'s integration test to a
     seeded role/company instead of counting the whole table, or pin it
     to `--runInBand` (belongs to `modules/users`, inherited from
     `user-management-roles`)
   - **Act on W-2's now-third recommendation**: switch `apply-progress`
     to per-phase or per-PR Engram topic keys, or persist a TDD evidence
     table into an on-disk `apply-progress.md` — this exact
     recommendation has now been raised at the end of three consecutive
     changes (`review-session`, `review-history`,
     `review-history-company-scope`) without being acted on
   - S-1: add the `loadByRole` by-id counterpart of the already-tested
     `listForActor` out-of-union fail-closed backstop test
   - S-2: tighten the unresolved-performer placeholder assertion (and
     its pre-existing `communityName` sibling) to assert the actual
     localized text, not just non-emptiness
   - S-3: extend `review-history.controller.ts`'s `ApiNotFoundResponse`
     Swagger description to name the two new indistinguishable-404 causes
     (another company's session, a manager with no company)
   - S-4: no action required — recorded as an accepted layering seam,
     not a gap; the union of the e2e matrix (in-memory doubles) plus the
     dedicated Postgres integration suite plus browser verification
     already covers the requirement
   - FR-008's remaining scope (global visibility, `SYSTEM_ADMIN`/
     `MANAGER` + `VIEW_ALL_REVIEWS`, the whole `ManagerCapability`
     mechanism) and per-element history filtering — each its own future
     slice, explicitly deferred and guarded against scope creep in this
     change
   - The company manager's other ADR-011 powers (scoped CRUD on their
     technicians, onboarding/disabling users) — deferred, named in the
     proposal's non-goals
   - The app-wide filtering/sorting/pagination/search initiative — named
     on record as the eventual remedy for the company-wide list's
     unbounded size, not started, stubbed or parameterized here
4. **Close**: once the source folder is removed, the fresh-context review
   + user confirmation complete, and the commit merges, the SDD cycle is
   fully complete; the change is archived and ready for reference.

## Traceability

This archive report and all supporting artifacts are linked via Engram
topic keys for cross-session recovery:
- `sdd/review-history-company-scope/proposal`
- `sdd/review-history-company-scope/spec`
- `sdd/review-history-company-scope/design`
- `sdd/review-history-company-scope/tasks`
- `sdd/review-history-company-scope/apply-progress`
- `sdd/review-history-company-scope/verify-report` (obs #232)
- `sdd/review-history-company-scope/archive-report` → this document

All specifications now reflected in the main `openspec/specs/` directory,
source of truth for future development.

---

**Archive Status**: CLOSED (artifact-complete; mechanical folder removal
and git commit pending shell/git access — see Known Limitation)
**Prepared by**: `sdd-archive` sub-agent (this run had file read/write
and Engram tools only; no shell/Bash tool was available for file
deletion/move or git operations)
**Date**: 2026-09-13
