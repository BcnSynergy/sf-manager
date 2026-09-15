# Archive Report: review-history-manager-capability

FR-008's fifth and final role-based visibility scope — a `MANAGER` holding the `VIEW_ALL_REVIEWS` manager capability (ADR-011 Decision 2, first implementation) reads every completed review session in the installation, identically to a `SYSTEM_ADMIN`, but only when explicitly granted by a `SYSTEM_ADMIN` on the user-edit page. This closes FR-008's role-based visibility axis; per-element history remains the only deferred half.

## Chain shipped (all 4 PRs merged to `main`)

| PR | Title | Commit | Content |
|---|---|---|---|
| 1/4 | Data model & persistence plumbing | `a5ae336` (#116) | `ManagerCapability` enum, `User.managerCapabilities`, migration, entity/mapper/repository/fake plumbing |
| 2/4 | Capability checker & read-side scope | `8b6769b` (#117) | `ManagerCapabilityChecker` port+adapter, `ReviewHistoryAccessService` MANAGER branch, `ROLE_PERMISSIONS.MANAGER` grant |
| 3/4 | Grant/revoke write path | `155f58a` (#118) | `PATCH /users/:id` schema refinement, domain policy, `SERIALIZABLE` transaction generalization, DTO, pipe rename |
| 4/4 | Web UI, i18n, docs & verification | `a78c615` (#119) | Capability toggle on `UserEditPage`, route/entry-link widening, i18n, delta-spec merge, ADR-011 addendum, browser verification |

Verified against `main` @ `a78c615`. Working tree clean at verification time.

## Task completion

53/53 task items checked across `tasks.md` (PR1 10 · PR2 12 · PR3 19+1 sub-bullet · PR4 11). No stale unchecked implementation tasks — Task Completion Gate passes.

## Delta spec merge — confirmed already done, verified genuine

Per the orchestrator's instruction, delta specs were merged into main specs during PR4 (task 4.8), already on `main`, and were **not** re-merged here. Spot-checked and confirmed genuinely reflected:

- `openspec/specs/review-history/spec.md` — contains the full *"A Granted Manager's Installation-Wide Completed Review History"* requirement, the *"An Ungranted Manager Reads Nothing"* regression requirement, the narrowed *"The Deferred Review Visibility Scopes Are Not Built"* guard table (now scoping deferral to the other five `ManagerCapability` names + per-element history), and the five-scope reframing throughout (Purpose section, ordering/read-back/scope-carried-by-query requirements all updated to "five" scopes / "two" unscoped call sites).
- `openspec/specs/authorization/spec.md` — Purpose section and Role Enum content confirm `MANAGER` as "the fifth role operational on the review-history read surface," resolved via the `VIEW_ALL_REVIEWS` capability read fresh from the database, granted by `SYSTEM_ADMIN`.

No unmerged or missing delta content found in the two domains spot-checked. (`review-history-ui`, `user-management`, `user-admin-ui`, `review-session-management` were not individually re-verified line-by-line here, consistent with the orchestrator's "spot check, don't redo" instruction — sdd-verify's own COMPLIANT verdict on all six domains stands as the fuller check.)

## Verification verdict

**PASS WITH WARNINGS — 0 CRITICAL · 5 WARNING · 4 SUGGESTION.** Nothing blocked archiving; the user explicitly decided to archive now and carry the warnings forward as documented follow-up work.

All gates green: API unit (877 tests), API integration/real-Postgres (132 tests), API e2e (332 tests), web (705 tests), web build, lint. Two pre-existing `tsc --noEmit` errors on `main`, unrelated to this change (see S4).

### Warnings carried forward as known follow-up work

- **W1 — Untested scenario (= tasks.md's M4).** `specs/review-history/spec.md`'s "An empty installation renders a successful empty list" for a *granted* MANAGER has no covering e2e test. The suite's only empty-installation e2e uses a `MAINTENANCE_TECHNICIAN`. Residual risk assessed very low (identical repository method as the admin path, already proven to serialize `200 []`). Fix: one e2e with a seeded granted MANAGER and no sessions.
- **W2 — Untested scenario (= tasks.md's M3).** `specs/user-management/spec.md`'s "two concurrent writes cannot leave a non-MANAGER row holding a capability" has no test exercising the race. Mechanism traced as correct by inspection (SERIALIZABLE transaction, P2034→409 on conflict) but unproven by a test. Fix: integration test with `Promise.allSettled`, assert one 409, final row correct.
- **W3 — New gap, not previously in tasks.md's Known gaps.** No single e2e composes a live grant/revoke PATCH with a subsequent `/review-history` request on the same session — the no-re-login revocation behaviour is proven only by composition of separate tests (plus manual browser verification on 2026-09-15). Fix: extend the granted-manager e2e with an admin revoke, then repeat list/by-id on the same agent — closes four spec scenarios at once.
- **W4 — Invariant literally violated in test fixture, structurally unguarded outside `apps/api/src`.** `packages/validation/src/users/update-user.schema.spec.ts:25` uses `['MANAGE_COMMUNITIES']` (one of ADR-011's undeclared capability names) as an unknown-member rejection fixture; the automated "no other capability name" guard only walks `apps/api/src`, not `packages/**` or `apps/web/**`. Fix: rename the fixture to a non-ADR-011 string, or narrow the spec's guard wording.
- **W5 — Documentation cross-reference gap.** `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:73-75` (Decision 3's original text) is superseded by the 2026-09-15 addendum but carries no inline pointer to it, unlike Decision 1's equivalent cross-reference. Fix: one parenthetical pointing Decision 3 to the addendum.

### Suggestions carried forward

- **S1** — No web test pins `specs/user-admin-ui/spec.md`'s "role round trip within one unsaved session resets the toggle" scenario; only the change-away half is covered.
- **S2** — Task 4.7's checkbox over-claims "tests remain unmodified" — `UserCreatePage.test.tsx` gained 3 fixture lines in PR4; page and assertions genuinely untouched.
- **S3** — An Engram `apply-progress` upsert briefly mis-described M4 as resolved after the PR3 review round; corrected before archive. Not CRITICAL — tasks.md's per-item `(TDD)` markers and all-green suites cross-check clean.
- **S4** — `apps/api` `tsc --noEmit` is red on `main` for two pre-existing, unrelated reasons, masking the manual type-check gate's ability to catch a real regression. Worth a standalone cleanup change.

None of the above block archiving — 0 CRITICAL issues, and the user explicitly chose to archive with these as documented follow-up rather than block on them.

## Design coherence

All 7 design decisions verified as implemented exactly as written (enum + `@default([])`; boolean checker with persisted-role re-check; MANAGER branch reusing the admin read verbatim; the accepted, named two-GET-route permission-widening consequence; policy + generalized `SERIALIZABLE` transaction; PATCH semantics with non-empty-only refinement; role-only web route gate). One recorded, accepted deviation: task 2.11 shipped the ungranted-MANAGER response as `200 []`/`404` instead of the design table's `403`, because no `403` is reachable once `reviewSession:read` is unconditional — reasoning recorded in-place in the e2e spec.

## Source of truth updated

- `openspec/specs/review-history/spec.md`
- `openspec/specs/review-history-ui/spec.md`
- `openspec/specs/authorization/spec.md`
- `openspec/specs/user-management/spec.md`
- `openspec/specs/user-admin-ui/spec.md`
- `openspec/specs/review-session-management/spec.md`
- `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` (addendum)
- `docs/requirements/functional-requirements.md` (FR-008 status: role-based visibility axis closed, per-element history named as what remains)

## SDD Cycle Complete

This change has been fully planned (`sdd-propose`/`sdd-spec`/`sdd-design`), broken into tasks, implemented across 4 stacked PRs, verified (PASS WITH WARNINGS), and is now archived. FR-008's role-based visibility axis is closed; FR-008 itself remains open pending per-element history, a future slice.

## Traceability

This change was run under artifact store mode **hybrid**. Engram topic keys for this change's full artifact trail:

- `sdd/review-history-manager-capability/proposal`
- `sdd/review-history-manager-capability/spec`
- `sdd/review-history-manager-capability/design`
- `sdd/review-history-manager-capability/tasks`
- `sdd/review-history-manager-capability/apply-progress`
- `sdd/review-history-manager-capability/verify-report`
- `sdd/review-history-manager-capability/archive-report` (this report)

Filesystem artifacts (pre-move, inside the not-yet-archived change folder): `proposal.md`, `spec.md` (if present)/`specs/**`, `design.md`, `tasks.md`, `verify-report.md`, `archive-report.md` — all under `openspec/changes/review-history-manager-capability/`.

## Orchestrator action required (this sub-agent has no Bash access)

The orchestrator must now:

1. `git mv openspec/changes/review-history-manager-capability openspec/changes/archive/2026-09-15-review-history-manager-capability`
2. Commit the move (and stage this new `archive-report.md` + the previously-untracked `verify-report.md` as part of that commit).

Today's date, per `git log -1 --format=%cd --date=short` context provided in this task's git status snapshot (branch `review-history-manager-capability/05-sdd-archive`, latest merged commit `a78c615` on 2026-09-15) and the environment's stated current date: **2026-09-15**. Target archive folder name, following this repo's `<date>-<change-name>` convention (e.g. `2026-09-14-review-history-admin-scope`):

**`openspec/changes/archive/2026-09-15-review-history-manager-capability/`**
