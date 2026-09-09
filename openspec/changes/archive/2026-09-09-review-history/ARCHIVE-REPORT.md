# Archive Report: View Review History (FR-008, first slice)

**Change**: `review-history` (FR-008)
**Status**: ARCHIVED
**Date**: 2026-09-09
**Artifact Store**: Hybrid (OpenSpec + Engram)
**Branch this archive was prepared on**: `review-history/05-verify-and-archive`

## Executive Summary

`review-history` (FR-008's first slice: read-only review history for
`MAINTENANCE_TECHNICIAN` — own performed sessions — and
`COMMUNITY_REPRESENTATIVE` — all completed sessions in actively-assigned
communities, regardless of performer) shipped as 4 sequential PRs, all merged
to `main` in order, culminating in `19bb0fd`. All 40/40 implementation tasks
in `tasks.md` are marked complete and were independently spot-verified against
current `main`, not trusted from checkboxes alone. `sdd-verify` returned
**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING (all evidence/retention or
pre-existing-and-unrelated issues, not implementation defects), 6 SUGGESTION.
This is a clean pass; archiving proceeds per the verify report's own closing
line: "Ready for `sdd-archive`."

This slice's three security guarantees — no unscoped session read,
indistinguishable 404 across every rejection cause, and no mutation control on
a completed record — are each enforced **structurally** (a required parameter
in a port signature, a single throw site with a single mapping, and the
physical absence of the controls from the file), the same discipline
`review-session`'s design established and this change extended rather than
reinvented.

## Engram Observation IDs (Source of Truth)

| Artifact | Topic Key | Notes |
|---|---|---|
| Proposal | `sdd/review-history/proposal` | Complete |
| Specification | `sdd/review-history/spec` | Complete (5 delta specs: `review-history` new, `review-history-ui` new, `authorization` modified, `review-session-management`/`review-session-ui` modified/narrowed) |
| Design | `sdd/review-history/design` | Complete (7 numbered decisions, an Open Questions section tracking 3 deferred follow-ups plus 2 resolved-in-flight items, corrected at this archive per S-6) |
| Tasks | `sdd/review-history/tasks` | Complete (40/40 across 6 phases per `tasks.md` on disk — the canonical count; see Known Issue below on Engram mirror drift) |
| Apply Progress | `sdd/review-history/apply-progress` (obs #211, 16+ revisions) | Full PR1-4 history recorded across successive upserts; per-PR TDD Cycle Evidence detail did not survive to the final revision (verify-report W-2 — same class of loss as `review-session`'s W-1, not yet fixed) |
| Verification Report | `sdd/review-history/verify-report` | PASS WITH WARNINGS — 0 CRITICAL, 4 WARNING, 6 SUGGESTION |
| Archive Report | `sdd/review-history/archive-report` | This document |

## Merged Specifications (OpenSpec)

### New Specifications (Created)

1. **`openspec/specs/review-history/spec.md`**
   - Full new capability: 9 requirements
   - A performer's own completed history; a representative's community-scoped
     completed history (any performer); completed-only filtering; scoped
     read-back of one historical session (frozen question wording + live,
     nullable `elementCode`); scope carried by the query itself (no
     identifier-only read exists); indistinguishable 404; active-assignment
     requirement including for one's own performed sessions; no write path;
     explicit non-goal that the deferred visibility scopes (company-wide,
     global, per-element) are not built here

2. **`openspec/specs/review-history-ui/spec.md`**
   - Full new capability: 7 requirements
   - Role-gated routes (same two non-admin roles as `review-session-ui`); a
     reachable entry point from the existing review-session surface; the list
     renders the server-scoped result unfiltered (no client-side pagination,
     sort or search); a genuinely read-only detail view; one uniform
     unreachable-session message; full i18n coverage including enum-to-label
     mapping; explicit non-goal that no filtering/analytics/adjacent control
     ships

### Modified Specifications (Delta Merged)

3. **`openspec/specs/authorization/spec.md`**
   - Purpose updated: review-history reads are now explicitly part of the
     review-session surface's permission family and resource-scope dimension
   - ADDED: Resource Scope for Review History Reads (technician = own
     performed sessions in actively-assigned communities; representative =
     every completed session, any performer, in actively-assigned
     communities; deactivation revokes on the very next request, including
     for a technician's own performed sessions), The Deferred Review
     Visibility Scopes Grant Nothing (`MANAGER`/`MAINTENANCE_COMPANY_MANAGER`
     stay `[]`, `SYSTEM_ADMIN` gains no `reviewSession:*` member, no
     `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` mechanism
     anywhere) — 2 new requirements, ~13 new scenarios
   - All other existing requirements preserved verbatim

4. **`openspec/specs/review-session-management/spec.md`**
   - Purpose updated: acknowledges the per-performer/per-community reads
     (FR-008) now ship, owned by the separate `review-history` capability —
     this capability still owns the write flow only
   - MODIFIED: "Adjacent Review Capabilities Are Not Introduced" narrowed —
     company-wide/global visibility and per-element history remain forbidden;
     FR-009/FR-010/offline/photos/attachments/notifications rows untouched.
     The narrowed scenario explicitly preserves the shipped
     performer-scoped, status-agnostic `GET /review-sessions/:sessionId`
     read — a fix a PR4 fresh-context review caught (an earlier draft of the
     narrowing over-claimed that *every* completed-session read moved to
     `review-history`, which contradicted the still-legitimate shipped
     route) and which is confirmed present in the merged canonical file by
     this verification, not just the delta

5. **`openspec/specs/review-session-ui/spec.md`**
   - Purpose updated: acknowledges the history list + read-only detail view
     now exist, owned by `review-history-ui`; the field flow gains only a
     navigation entry point
   - MODIFIED: "No Offline, History or Scheduling Surface" narrowed with the
     equivalent preservation clause for the shipped by-id detail view;
     strengthened in one respect — list filtering/pagination/sorting/search
     is now forbidden **anywhere** in the web app, not only in the field flow

*(No other existing `openspec/specs/**` capability file was touched by this
change.)*

## Verification Summary

**Verdict**: PASS WITH WARNINGS

### Test Execution (re-run live on `main` @ `19bb0fd`, 4/4 PRs merged, verified by `sdd-verify`)
- API unit: 773/773 pass, 105 suites
- API integration: 108/108 pass, 19 suites (one transient run failed on an
  unrelated, pre-existing shared-database flake in `user-management-roles`'s
  `countActiveByRole` test — see W-3 below; a clean re-run passed)
- API e2e: 295/295 pass, 10 suites
- Web (Vitest + RTL): 670/670 pass, 47 files
- **Total: 1846/1846 pass**
- Build: clean, 4 turbo tasks, exit 0
- Lint: 0 errors, 4 pre-existing warnings (unrelated file, untouched by this
  change)
- No migration: zero files under `apps/api/prisma/` in the diff, confirmed by
  direct `git log --name-only` inspection

### Compliance Matrix
- **40/40 Implementation Tasks**: all marked complete, independently
  cross-checked against current `main` across all 6 phases — not trusted
  from checkboxes
- **19/19 Spec Requirements COMPLIANT or PARTIAL**, 18 fully COMPLIANT with
  passing runtime evidence, 1 PARTIAL (evidence gap, not a behavior defect —
  W-1 below), 0 FAILING, 0 UNTESTED
- **7/7 Design Decisions verified** — all implemented exactly as designed; 3
  documented deviations, all assessed as accepted improvements (defensive
  second `mapError` case, tighter `communityName` resolution cardinality
  than originally sketched, task 3.6's deliberate `mapError` deferral from
  PR1 to PR2)
- **Scope Guard**: zero drift — no `ManagerCapability` mechanism, no
  company-wide/global/per-element history route, no new permission, no list
  filtering/pagination control, no migration — all independently
  grep-verified and/or asserted against live Postgres
- **Strict TDD**: 5/6 checks pass at runtime (1846/1846 tests green,
  table-driven triangulation visible in the sources, the write-path
  `SessionAccessService` suite passes unmodified as its own safety-net
  proof); the one gap is the per-PR TDD Cycle Evidence table's retention in
  Engram, not protocol compliance (W-2)

### Findings
- CRITICAL: 0
- WARNING: 4 — all non-blocking for archive:
  - W-1: the spec scenario "Multiple assignments produce one flat list" (a
    representative assigned to two communities, both with completed
    sessions) has no covering test at any layer. Not raised to CRITICAL: the
    underlying multi-element `{ in: [...] }` predicate *is* exercised
    end-to-end by the technician sibling method, which differs by exactly
    one predicate — there is no untested branch, only the scenario's own
    runtime evidence is missing. ~15 lines to close as a follow-up
  - W-2: `apply-progress`'s per-PR TDD Cycle Evidence table did not survive
    16 Engram `topic_key` upserts to a chain-complete summary — the
    **second consecutive change** to lose this (the `review-session` verify
    report raised the identical issue as its own W-1 and recommended
    per-PR topic keys; the recommendation was not adopted). Everything the
    table would have claimed is independently corroborated by the tests
    themselves, so this is a record-keeping gap, not a TDD-compliance
    failure — but it will keep recurring until the recommendation is acted
    on
  - W-3: a pre-existing, unrelated flaky integration test
    (`PrismaUserRepository > countActiveByRole()`, from the archived
    `user-management-roles` change) produced one red run under shared-DB
    worker contention, clean on re-run. Not a `review-history` file, not a
    `review-history` regression
  - W-4: three artifacts disagreed on the total task count (40 on disk in
    `tasks.md`, "33/33" in one `apply-progress` revision, "35/38" in one
    `tasks` note) — the canonical, correct count is **40/40** from
    `tasks.md` on disk, per this archive; the Engram mirrors are corrected
    below
- SUGGESTION: 6 — a raw-UUID fallback that's believed unreachable (S-1), an
  uncovered `satisfies never` backstop mirroring an already-tested twin
  (S-2), a 401 e2e test that covers only one of two routes though the
  guarantee is structural on both (S-3), a before/after pair proven in two
  separate tests rather than one continuous assertion (S-4), a coverage-tool
  scope artifact understating the controller's real coverage (S-5, a repeat
  of `review-session`'s S-4), and the Decision 6 `communityName` wording
  correction — applied in this archive, see below (S-6)

### Findings acted on during this archive
- **S-6** (design.md correction): Decision 6's `communityName` resolution
  cardinality is corrected in the archived `design.md` from "once per
  community in the actor's scope" to "once per distinct community in the
  result" — a strictly tighter bound than originally sketched, matching
  what `list-review-history.use-case.ts` actually does and its own test
  name ("resolves communityName once per distinct community, not per row").
- **W-4** (task-count correction): this archive report and the Engram
  `tasks`/`apply-progress` mirrors are corrected to state **40/40**, taking
  `tasks.md` on disk as the source of truth per the verify report's
  explicit instruction.

All other WARNING/SUGGESTION items are recorded as follow-ups (see Next
Steps), not fixed in this change — consistent with ADR-006 walking-skeleton
discipline: this archive closes what was actually built, not what could
additionally be polished.

## Archive Contents

### Files Present in Archive (`openspec/changes/archive/2026-09-09-review-history/`)
- `proposal.md`
- `design.md` (S-6 correction applied at archive)
- `tasks.md`
- `verify-report.md`
- `specs/review-history/spec.md` (NEW capability)
- `specs/review-history-ui/spec.md` (NEW capability)
- `specs/authorization/spec.md` (MODIFIED delta)
- `specs/review-session-management/spec.md` (MODIFIED delta)
- `specs/review-session-ui/spec.md` (MODIFIED delta)
- `ARCHIVE-REPORT.md` (this document)

### Verification Checklist
- [x] All 10 files present in archive path, byte-verified against the source
      change folder's content (`diff -q`, all identical) before the source
      folder was removed
- [x] No unchecked implementation tasks (40/40 marked complete)
- [x] Main specs merged into `openspec/specs/`: 2 new capability specs
      created (`review-history`, `review-history-ui`), 3 existing specs
      extended/narrowed (`authorization`, `review-session-management`,
      `review-session-ui`) — already done in PR4 (tasks 6.1-6.3), confirmed
      byte-identical/faithful by both the PR4 fresh-context review and this
      formal `sdd-verify` pass, independently, before this archive
- [x] Verify report PASS WITH WARNINGS (0 CRITICAL — does not block archive
      per this repo's established policy)
- [x] No stray unchecked tasks in the archived `tasks.md`

## SDD Cycle Summary

| Phase | PR # | Status | Details |
|---|---|---|---|
| Phase 1-3 | PR 1 (`a3673b1`, #98) | Merged | Layer 2 active-community-scope listing; 4 new repository port methods + Prisma/in-memory adapters; `ReviewHistoryAccessService.listForActor` + `ListReviewHistoryUseCase` + `GET /review-history` |
| Phase 4 | PR 2 (`8f78e33`, #99) | Merged | `loadCompletedForActor` by-id access gate; `ReadReviewHistoryUseCase` (frozen wording + live nullable `elementCode`); `GET /review-history/:sessionId`; full indistinguishable-404 + retroactive-revocation E2E matrix |
| Phase 5 | PR 3 (`375b398`, #100) | Merged | Web: api client, `ReviewHistoryPage`, `ReviewHistoryDetailPage` (read-only fork), routes, entry-point link, full en/es/ca i18n. A fresh-context review caught and fixed a build-breaking test fixture and a raw-enum-rendered-to-user bug pre-merge |
| Phase 6 | PR 4 (`19bb0fd`, #101) | Merged | Spec-guard narrowing + delta merge into `openspec/specs/`, full-suite checks, real browser verification (both roles, cross-performer, multi-community, revocation, empty state), follow-ups recorded. A fresh-context review caught and fixed a spec over-narrowing that contradicted the shipped by-id session read |

All 4 PRs merged to `main` in order. Delivery strategy: `stacked-to-main`
(4 sequential PRs, each accepted a `size:exception` over the 400-line budget
— PR3 at ~721 lines, PR4 at ~711 lines, both coherent single-phase units with
the user's explicit sign-off), final merge `19bb0fd`.

## Risks & Mitigations (carried from the proposal, resolved status)

| Risk | Mitigation | Status |
|---|---|---|
| A representative could see another community's sessions | `findCompletedInCommunities` requires `communityIds` as a parameter drawn from `listAssignedCommunityIds`, re-read per request, no cache | Mitigated — verified (e2e 506, 1123) |
| A technician could see another technician's sessions | `findCompletedForPerformerInCommunities` requires `performedById` as a parameter | Mitigated — verified (e2e 444) |
| Out-of-scope access disclosed via a distinguishable error | One throw site, one mapping; e2e deep-equals the whole body across 4 causes | Mitigated — verified |
| Deactivating an assignment doesn't revoke history access | `listAssignedCommunityIds` has no cache, re-read every request | Mitigated — verified (e2e 1061, 1123) |
| The web detail view accidentally exposes a mutation control | Genuine fork, zero button/form/input in the file, non-vacuous test | Mitigated — verified |
| Scope creep into company-wide/global/per-element history | Explicit non-goals in both new specs; grep-verified no `ManagerCapability` mechanism exists | Mitigated — verified |
| Slice size overwhelms review | Chained `stacked-to-main`, 4 PRs, each independently fresh-context reviewed, catching 2 real bugs (PR3, PR4) before merge | Mitigated — realized as designed |

## Session Activity Summary

### Phase Completion Record
- **sdd-explore / sdd-propose / sdd-spec / sdd-design**: completed in a prior
  session (2026-09-08), producing the proposal, 5 delta specs, and 7 design
  decisions plus an Open Questions section
- **sdd-tasks**: 40 implementation tasks across 6 phases, `ask-on-risk`
  delivery strategy, `stacked-to-main` chain, ADR-011 addendum explicitly
  deferred by the user (second change in a row to defer it)
- **sdd-apply**: 4 sequential PRs implemented and merged to `main`, including
  two fresh-context-review fixes: PR3's build-breaking test fixture + raw
  enum rendered to the user, and PR4's spec over-narrowing contradicting a
  shipped route. Both size exceptions (PR3 ~721 lines, PR4 ~711 lines)
  explicitly confirmed with the user rather than assumed
- **sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 4 WARNING (evidence/
  retention/pre-existing-unrelated, none implementation defects), 6
  SUGGESTION; 1846/1846 tests independently re-run and confirmed; all 5 spec
  merges independently re-verified byte-identical/faithful
- **sdd-archive**: this report, plus the S-6 design.md correction and the
  W-4 task-count correction — completion of the cycle. This run's own
  execution hit a mid-flight interruption (an earlier `sdd-archive`
  sub-agent invocation failed partway through on a session rate limit,
  having copied 4 of the change's files with a minor transcription drift in
  one — a semicolon rendered as an em-dash in `design.md`); the orchestrator
  detected the drift via byte-level diff, discarded the partial copy, and
  redid the entire archive copy with exact file-level copies, verified
  byte-identical before proceeding. Also corrected: this work had begun
  directly on `main` rather than a dedicated branch, moved to
  `review-history/05-verify-and-archive` before any commit

### Artifacts Persisted
- Engram: proposal, spec, design, tasks observations already existed from
  the planning phase; apply-progress (#211, full PR1-4 history across
  revisions); verify-report (new); archive-report (new, topic key
  `sdd/review-history/archive-report`) — the `tasks` and `apply-progress`
  Engram mirrors are corrected to 40/40 as part of this archive
- OpenSpec: 5 main spec files created/updated in `openspec/specs/` — already
  done in PR4 (this archive did not re-merge them, only confirmed the merge)
- OpenSpec: 1 archive folder created at
  `openspec/changes/archive/2026-09-09-review-history/` (10 files)
- `openspec/changes/review-history/` (source folder) removed as part of this
  archive's git commit

## Next Steps

1. **Fresh-context review**: per this repo's convention, even a docs-only
   archive commit gets an independent fresh-context review before push and
   before merge — confirm with the user at each step.
2. **Follow-up items surfaced by verify (not archive-blocking, not part of
   this change)**:
   - Close W-1: seed a second representative community assignment in the
     existing e2e fixture, assert both communities' rows appear
     (~15 lines)
   - Act on W-2's repeated recommendation: switch `apply-progress` to
     per-PR Engram topic keys (`sdd/{change}/apply-progress/pr-N`) instead
     of one upserted topic — this has now been raised twice
   - W-3: make `countActiveByRole()`'s integration test self-scoped instead
     of counting the whole table (belongs to `user-management-roles`, not
     this change — file a note for whoever touches that suite next)
   - S-1: give `ReviewHistoryDetailPage.tsx`'s question-id fallback a
     localized neutral label, for symmetry with the `elementCode` treatment
   - S-2/S-3/S-4: minor test additions, no behavior risk
   - S-5: document or fix the `test:cov` scope gap that understates
     E2E-covered controller lines — a second recurrence of the same note
     from `review-session`'s archive
   - Resurface and write the ADR-011 addendum — now deferred by **two**
     consecutive changes (`review-session`, `review-history`); needs
     explicit user confirmation to schedule
   - Backlog, each its own future slice: performer identity in the
     representative's list view (needs a `users` read), frozen (not live)
     element codes on `ElementReviewEntry` (needs a schema change), and the
     app-wide raw-ISO-timestamp formatting gap (touches the already-shipped
     `review-session` UI too, confirmed out of scope for this change)
3. **Close**: once the fresh-context review + user confirmation complete and
   this branch merges, the SDD cycle is fully complete; the change is
   archived and ready for reference.

## Traceability

This archive report and all supporting artifacts are linked via Engram
topic keys for cross-session recovery:
- `sdd/review-history/proposal`
- `sdd/review-history/spec`
- `sdd/review-history/design`
- `sdd/review-history/tasks`
- `sdd/review-history/apply-progress` (obs #211)
- `sdd/review-history/verify-report`
- `sdd/review-history/archive-report` → this document

All specifications now reflected in the main `openspec/specs/` directory,
source of truth for future development.

---

**Archive Status**: CLOSED
**Prepared by**: orchestrator (this `sdd-archive` sub-agent invocation hit a
session rate limit mid-copy; the orchestrator detected the resulting
transcription drift, discarded the partial work, and completed the archive
directly with byte-verified file copies)
**Date**: 2026-09-09
