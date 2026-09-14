# Verification Report: review-history-admin-scope (FR-008, 4th slice — installation-wide review history for SYSTEM_ADMIN)

**Verified against**: `main` @ `a66d9f6` (PR 3/3, #112). Working tree clean.
**Mode**: Strict TDD. **Artifact store**: hybrid. **Date**: 2026-09-14.

## VERDICT: PASS WITH WARNINGS — 2 CRITICAL, 5 WARNING, 5 SUGGESTION

Both CRITICALs are **spec/documentation integrity defects, not code defects**. Shipped behaviour is correct, complete and green at every layer. No finding requires a code change; both CRITICALs require spec/tasks text corrections BEFORE `sdd-archive`, because archiving freezes two false claims into `openspec/specs/**`.

35 of 37 tasks.md checkboxes verified genuinely true against source on `main`. Two are not: **3.11** ("no schema/migration change") and **3.5** ("scenarios carried over verbatim").

> **Archive note (2026-09-14)**: Both CRITICALs were fixed by a follow-up
> docs-only PR (#113, `585a699`) BEFORE this archive ran. See "Resolution"
> subsections below and the archive report's own independent re-confirmation
> against `openspec/specs/**` at archive time.

## Completeness
- Tasks: 37 total (1.1–1.17, 2.1–2.8, 3.1–3.12), 37 `[x]`, 0 `[ ]`. 35 verified true, 2 false claims (both fixed by PR4).
- PRs: 3 merged (#110 `00aeacd`, #111 `390b36e`, #112 `a66d9f6`), `stacked-to-main`. PR4 (#113, `585a699`) is the follow-up docs-only fix-up.
- Net diff `2068af9..a66d9f6`: 3505 insertions / 228 deletions, 31 files.

## Build & Tests (all re-run at runtime in this verification)
| Command | Result |
|---|---|
| `npm run test --workspace=apps/api` | PASS 108 suites, **820/820** (exit 0) |
| `npm run test:integration --workspace=apps/api` | **FAIL 124/125** (exit 1) — see W-1 |
| `npx jest --testRegex=".*\.integration\.spec\.ts$" --runInBand` | PASS 21 suites, **125/125** (exit 0) |
| `npm run test:e2e --workspace=apps/api` | PASS 10 suites, **319/319** (exit 0) |
| `npm run test --workspace=apps/web` | PASS 47 files, **693/693** (exit 0) |
| `npm run lint` | PASS 0 errors, 4 pre-existing warnings |
| `npm run build` | PASS (exit 0) |

Coverage: not configured in this repo — skipped, not a failure.
Apply phase's reported numbers are confirmed accurate.

## TDD Compliance
- TDD Evidence table: **MISSING** from apply-progress (Engram #240, rev 6 — topic-key upsert overwrote per-task evidence). See W-5. Compensated with direct source inspection + full runtime re-run.
- All RED/GREEN tasks have real, existing test files: 8/8. All passed at runtime.
- Triangulation adequate. Safety net intact: manager's `HealthPage.test.tsx:137-153` present, unmodified, passing (task 3.3's explicit requirement). Only e2e deletions in the whole diff are the two now-obsolete `SYSTEM_ADMIN → 403` tests, correctly superseded.

## Spec Compliance: 39/41 scenarios COMPLIANT, 1 PARTIAL, 1 UNTESTED-and-FALSE, 1 lost in merge
Key structural guarantees verified independently (not trusted from prior reviews):
- Port-surface exact allowlist grew 8→10; `not.toContain('findById')` intact.
- Call-site source-scan guard proves exactly 3 production call sites. I re-ran the scan by hand: `findCompletedAcrossInstallation`/`findCompletedByIdAcrossInstallation` appear in production code ONLY in the port, the Prisma adapter, the in-memory fake (under `**/testing/**`) and `review-history-access.service.ts`. No other caller.
- Unit test asserts `not.toHaveBeenCalled()` on BOTH scope checkers for the admin branch.
- 4-role e2e matrix, no sampling; admin sees deactivated-community + soft-deleted-performer + no-company sessions; `not.toContain(draftForX.id)`.
- Integration (real Postgres) exercises genuine `softDeleteById` on community, performer AND maintenance company.

PARTIAL: *An empty installation renders a successful empty list* — proven at the in-memory fake layer only (W-3).

## Proposal Success Criteria re-verified against `main`
All pass EXCEPT "No migration was added; `schema.prisma` is unchanged" — **FALSE at PR3 (C-1), corrected by PR4**.
- No `ManagerCapability` / `User.managerCapabilities` / `VIEW_ALL_REVIEWS` symbol: CONFIRMED by hand-run scan across `apps/` + `packages/` incl. `.prisma`. Only hits are the e2e guard's own regexes plus one prose comment in `permission.ts:17` which the guard deliberately exempts by requiring declaration shape (`\s*[?:=]`).
- Unscoped pair called only from the `SYSTEM_ADMIN` branch: CONFIRMED.
- No demo-mode branch, no per-element history, no list controls: CONFIRMED.

## Design Coherence
Decisions 1, 3, 4 followed exactly. Decision 2 followed with ONE honestly-recorded deviation: the call-site guard asserts 3 production files, not design's stated 4, because design's `**/testing/**` exclusion and its "both adapters" expectation are mutually exclusive. The test documents the conflict and resolution in a prominent NOTE; the in-memory adapter is proven separately by task 1.8. Correct call.

**Unrecorded deviation (1)**: design's "watch item" on list volume was escalated by the PR1 4R review into a shipped composite index + `Promise.all` N+1 fix. Recorded in tasks.md 1.13/1.14 but NOT in design.md, proposal.md, or the review-history delta spec — which is the root cause of C-1.

## CRITICAL (both resolved by PR4, #113, `585a699` — see Resolution)

**C-1 — Merged spec asserts "no migration", but a migration AND a schema change shipped.**
`openspec/specs/review-history/spec.md:566` on `main` (at PR3): *"Scenario: This change adds no migration … THEN both MUST be unchanged — installation-wide visibility MUST require no new column, index or backfill"*.
FALSE: PR1's fix-up shipped `apps/api/prisma/migrations/20260913210000_add_review_session_status_completed_at_index/migration.sql` (+25) and `schema.prisma`'s `@@index([status, completedAt, id])` (+7). The scenario explicitly forbids a new **index**.
Three compounding facts:
1. The scenario is **UNTESTED**. The only migration guard (`review-history.e2e-spec.ts:2247`) asserts exactly one `performed_by_company`-named migration exists — structurally cannot see a differently-named migration. That is why it survived three fresh-context reviews.
2. The delta file (`…/specs/review-history/spec.md:296`) carried the same scenario, authored in `sdd-spec` BEFORE the PR1 fix-up, and PR3 merged it verbatim without reconciling against what had shipped two PRs earlier.
3. tasks.md contradicts itself: **3.11** checked off claiming "no schema/migration change", while **1.13** — also checked off, 90 lines above — documents the migration in detail. Proposal Success Criteria and Rollback Plan ("no migration and no schema change, so nothing is asymmetric") are both false as written.
**Why it blocks archive**: the index is the only thing between the app's largest list and a full seq scan + filesort on every admin request. A future slice reconciling code against spec would have spec authority to DROP it. The rollback plan is also now wrong in a way that matters.
**Fix (no code change)**: restate the scenario to say what shipped and why; correct the proposal criterion + rollback plan; correct task 3.11; strengthen the e2e guard to assert the migration set explicitly rather than counting one name.
**Resolution (PR4, #113)**: the scenario was rewritten as *"This change adds no new column, table or backfill"* + a new companion scenario *"The installation-wide read is backed by a covering index, not a model change"* explicitly naming the composite index and its purpose. Task 3.11's text was corrected to scope its claim to Phase 3 itself and cross-reference 1.13. Independently re-confirmed present in `openspec/specs/review-history/spec.md` at archive time.

**C-2 — One authored delta scenario was dropped in the PR3 spec merge.**
`#### Scenario: The manager's own scope is unchanged by the admin scope` exists in the authorization delta (`…/specs/authorization/spec.md:386`, under MODIFIED *The Maintenance Company Manager Becomes Operational*) but is ABSENT from `openspec/specs/authorization/spec.md`. The requirement prose and its other four scenarios carried over verbatim — only this one was lost. Single omission across 89 delta scenarios; all 4 delta files otherwise merged correctly (verified programmatically: no other missing requirement/scenario title, no stray ADDED/MODIFIED headers).
Task 3.5 checked off claiming "scenarios carried over verbatim" — not true for this one.
**Severity rationale**: behaviour IS still covered (manager e2e block untouched + green; merged spec's "The four scopes are proven side by side" asserts the three pre-existing roles' results are identical to before). Spec-text loss, not a behaviour gap. CRITICAL because it is a checked-off task whose claim is false and archiving makes the loss permanent and invisible.
**Fix**: insert the scenario between "The manager is refused on every review-session write endpoint" and "MANAGER is untouched and the admin holds read only".
**Resolution (PR4, #113)**: the scenario was restored verbatim in `openspec/specs/authorization/spec.md`, in the exact position specified. Independently re-confirmed present at archive time.

## WARNING

**W-1 — The documented integration command is red on `main`.** `npm run test:integration --workspace=apps/api` (task 3.10's exact command) exits 1: `prisma-user.repository.integration.spec.ts > countActiveByRole() excludes soft-deleted users` fails (`expect(after).toBe(before - 1)`, 2916 vs 2917). Passes **125/125** with `--runInBand`. Cause: script lacks `--runInBand`, all integration suites share one dev DB, that assertion is a global count with no isolation.
**Diagnosed, not assumed — NOT attributable to this change.** The four integration specs that create `COMMUNITY_REPRESENTATIVE` users live in `community`, `users`, and two `review-session` attribution/migration specs; none was touched by this change. The one integration spec this change did touch creates only `MAINTENANCE_TECHNICIAN` users, so its new fixtures cannot move that count. Identical flake was diagnosed in `review-history-company-scope`'s verification (its W-1). Pre-existing fragility in an unrelated module. Still a real WARNING: task 3.10's "All green" is not reproducible from the command as written, and CI running the documented script would be red. Fix belongs to the `users` module or the npm script, not this change. **Not fixed at archive — recorded as a follow-up (third consecutive change to flag a variant of this).**

**W-2 — An integration test's title over-claims.** `…integration.spec.ts:1288` "returns every completed session … **never a draft**" creates a draft but never asserts its absence (the id isn't even captured; no `not.toContain`). Draft exclusion IS proven at e2e (`not.toContain(draftForX.id)`) and in-memory (`resolves.toBeNull()`) layers, but NOT against real Postgres — the one layer where the literal `WHERE` clause is exercised. One line closes it. **Not fixed at archive — recorded as a follow-up.**

**W-3 — The empty-installation path is unproven against real Postgres.** Task 1.12/1.16's integration test asserts only `resolves.toEqual(expect.any(Array))`. Honest — deliberately reworded in the PR1 fix-up to stop claiming what it cannot prove, and it points at the in-memory test asserting `resolves.toEqual([])`. Net effect: spec scenario *An empty installation renders a successful empty list* is PARTIAL. Closing it needs per-test transactional isolation or a dedicated empty schema — cross-cutting test-infra work, not this slice's. **Not fixed at archive — recorded as a follow-up.**

**W-4 — The concurrency test exercises the wrong role.** The test proving the `Promise.all` N+1 fix (task 1.14) runs as `COMMUNITY_REPRESENTATIVE`, not `SYSTEM_ADMIN` — the role whose removal of the scope bound created the unbounded N+1. The loop is role-agnostic shared code so the fix IS genuinely proven (the deferred-promise mock does fail under a sequential loop), but the test doesn't exercise the risk path it was written for. Recorded as a PR1 WARNING; still present. **Not fixed at archive — recorded as a follow-up.**

**W-5 — `apply-progress` carries no TDD Cycle Evidence.** Engram `sdd/review-history-admin-scope/apply-progress` (#240) is at revision 6 and holds only a short PR3-merge note; the topic-key upsert overwrote per-task RED/GREEN evidence. Strict TDD Mode expects that table as verify's primary artifact. Nothing went unverified (compensated by source inspection + full runtime re-run), but the audit trail for HOW the code was built is gone, permanently. Process note for `sdd-apply`: append per-batch evidence or keep the evidence table in `tasks.md` (canonical on disk) where it survives upserts. **This is now the fourth consecutive change to record this exact recommendation** (`review-session`, `review-history`, `review-history-company-scope`, now this change) — not acted on cross-change; out of scope for a single archive to fix.

## Assertion Quality: 0 CRITICAL, 2 WARNING
No tautologies, no ghost loops, no smoke-only tests, no CSS/implementation-detail assertions, no mock-heavy files. All `toEqual([])` uses have companion non-empty tests with the same setup in the same file. The two WARNINGs are W-2 and W-3 above. Notably, three of this change's own tests were made *weaker but honest* by the PR1 fix-up (1.15/1.16) rather than left tautological — the right instinct.

## SUGGESTION
- **S-1**: Off-by-one — design Decision 4 and task 2.1 call `reviewSession:read` `SYSTEM_ADMIN`'s "28th entry"; it is the **27th** (26 → 27, verified by diffing the pre-change file). Proposal's pre-change "27 admin permissions" was also one high (actual 26). Tests assert behaviourally, not by count, so nothing is broken — but the number appears in three artifacts.
- **S-2**: Task 3.8 / Phase 2 header call the `review-session-management` delta "wording-only"; the merge actually split *No global review visibility exists* into two scenarios, adding *The one installation-wide read lives in review-history, not here*. Delta file is authoritative and was followed correctly — only the label is wrong.
- **S-3**: `review-session.repository.port.ts:4-12` still asserts "`findByIdForPerformer` is the only by-id read, scoped to the performer". There are now FOUR by-id reads. Decision 2's restated invariant at lines 144-150 is correct, so the file says two contradictory things 130 lines apart. Stale since the company-scope slice, not introduced here — but this is precisely the file where the invariant must be unambiguous.
- **S-4**: Proposal Success Criteria are all still unchecked (20 `- [ ]`). Tick at archive, with the migration criterion annotated rather than ticked (C-1).
- **S-5**: `resolves.not.toBeNull()` appears alone in several soft-delete visibility assertions; `resolves.toMatchObject({ id: sessionOnX })` would assert the RIGHT record survived.

None of the SUGGESTION items were fixed at archive — recorded as follow-ups, consistent with ADR-006 walking-skeleton discipline (this archive closes what was actually built, not what could additionally be polished).

## Task 3.12's browser-verification caveats — assessed
| Caveat | Covered by tests? | Assessment |
|---|---|---|
| Empty-installation edge case | Partially — in-memory `resolves.toEqual([])` with zero completed sessions; `HealthPage.test.tsx` empty-state render | Adequate at unit layer, **real gap at the DB layer** (W-3). Risk low (bare `findMany`, one predicate, empty result is not a special case for Prisma) but genuinely unproven end-to-end. |
| Other-three-roles live regression | Yes, thoroughly | **Not a gap.** Three pre-existing e2e scope blocks untouched by the diff, 319/319 green; `HealthPage.test.tsx:137-153` untouched + passing as task 3.3 required; `ProtectedRoute.test.tsx` asserts all four roles; web 693/693. Test-verified rather than browser-verified is acceptable because the change to those roles' paths is provably zero lines. |

Per CLAUDE.md, stated plainly: the empty-installation state and the other three roles' UI were **test-verified, not browser-verified** on this slice.

## Confirmed correct (highlights)
- FR-008 status in `docs/requirements/functional-requirements.md` is accurate: technician/rep/company/`SYSTEM_ADMIN` live, `MANAGER`+`VIEW_ALL_REVIEWS` and per-element named as the last two pieces, FR-008 explicitly does not close.
- `/review-sessions*` write routes NOT widened — all four still `['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']`.
- `MANAGER: []` unchanged; `SYSTEM_ADMIN` diff is exactly one added line plus a comment, nothing removed.
- No new i18n key (`health.reviewHistoryLink` pre-existed); no hardcoded string.
- ADR-013 / `no-restricted-imports`: clean.
- Prisma by-id read hydrates via `loadEntriesWithAnswers`, identically to the other detail reads.

## Next
`sdd-archive` — after correcting C-1 and C-2 (text-only, no code change). **Both corrected by PR4 (#113, `585a699`) before this report was consumed by archive.**

---
Session: manual-save-sf-manager
Project: sf-manager
Scope: project
Topic: sdd/review-history-admin-scope/verify-report (Engram obs #246)
