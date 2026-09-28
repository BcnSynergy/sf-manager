# Archive Report: hermetic-integration-tests

**Change**: hermetic-integration-tests — Hermetic Integration Tests (test-harness-only slice)
**Archived**: 2026-09-28
**Archived to**: `openspec/changes/archive/2026-09-28-hermetic-integration-tests/`
**Verdict carried from sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 3 WARNING, 7 SUGGESTION
**User approval**: 2026-09-28 — verify result approved, archive proceeds; W1 and W3 accepted as recorded tech debt; W2 recorded as a pending user follow-up; drift S5 reconciled before archiving.
**Engram traceability**: proposal `sdd/hermetic-integration-tests/proposal` (#345), spec `sdd/hermetic-integration-tests/spec` (#346), design `sdd/hermetic-integration-tests/design` (#347, reconciled and re-saved this archive), tasks `sdd/hermetic-integration-tests/tasks` (#357, reconciled and re-saved this archive), apply-progress `sdd/hermetic-integration-tests/apply-progress` (#359), verify-report `sdd/hermetic-integration-tests/verify-report` (#363)

## Task Completion Gate

Read `openspec/changes/hermetic-integration-tests/tasks.md` before starting. All 52 implementation tasks across PR 1 (27), PR 2 (6) and PR 3 (19) were checked (`[x]`). No stale-checkbox reconciliation was needed.

## Drift Reconciled Before Archive (verify-report S5)

Per user approval on 2026-09-28, the following drift between the openspec files and Engram, flagged by verify-report S5, was reconciled in **both** the files and Engram before archiving:

- **tasks.md**: forecast size estimates replaced with actuals — PR1 ~1883 lines (code ~314 / test ~748 / openspec docs ~821, size:exception); PR2 14 lines, docs-only, no exception; PR3 836 lines total (~271 code / ~165 tests / ~130 docs / ~270 package-lock.json), size:exception, user-accepted. Recorded PR 3 merged as **PR #167**, merge commit `c833086`, 2026-09-28, and PR 1 merged as **PR #166** (`5edeae6`). Removed the stale "not pushed / needs review" status text.
- **design.md**: the Open Questions item "Refresh the stale shared dev DB comments" is now marked `[x]` resolved, referencing task 3.19 (comment-only, user-approved edit).
- **spec**: the file (`openspec/changes/hermetic-integration-tests/specs/integration-test-isolation/spec.md`) is kept as the canonical spec. The engram-only non-normative "Fix-round summary" section was **not** added to the main spec — the merged main spec (`openspec/specs/integration-test-isolation/spec.md`) matches the file, not the engram copy.
- **S7 recorded**: the user approved a comment-only edit to the `prisma-user.repository.integration.spec.ts` concurrency spec (task 3.19) — no logic change, comment text only, updated to reflect the per-run isolated database.

## Specs Synced

| Capability | Action | Requirements added / modified / removed |
|---|---|---|
| `integration-test-isolation` | Created (new capability; the change's spec was a full spec, not a delta — no prior `openspec/specs/integration-test-isolation/` existed) | 7 requirements added (Real-DB Test Runs Use Only Their Own Run Database, Per-Run Test Database Preparation, Concurrent Runs Are Isolated, Fail-Fast Target Guard, Teardown Drops Only Its Own Run Database, Unit Test Run Is Unaffected, Concurrency Specs Pass Unmodified, Fixtures Honor Migration-Defined Foreign Keys, Documented Dev-Database Reset and Full-Suite Guidance — 9 requirements, 20 scenarios total) / 0 modified / 0 removed |

No other capability was touched. `Modified Capabilities: None` per the proposal.

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅ (reconciled: Open Question marked resolved by task 3.19)
- `tasks.md` ✅ (52/52 tasks complete; reconciled: actuals + merge record replace forecast + stale status)
- `verify-report.md` ✅
- `specs/integration-test-isolation/spec.md` ✅

## Source of Truth Updated

- `openspec/specs/integration-test-isolation/spec.md` (new)

## Final Verify Verdict (carried forward)

**PASS WITH WARNINGS.** 0 CRITICAL, 3 WARNING, 7 SUGGESTION. Verified against `main` @ `c833086` (PR #166 + PR #167 merged; PR 2's docs-only commit `16c9552` folded into #167). All suites green (unit 126/1042, integration 26/160 across 4 runs including 2 concurrent, e2e 10/440), lint 0 errors, type-check 0 errors, build clean. Dev database row counts and the seeded admin were proven unchanged across every integration run performed during verify.

### Accepted debt (user-approved 2026-09-28, carried forward as tech debt — not re-opened by this archive)

- **W1 — Missing TDD Cycle Evidence table in apply-progress.** The PR 1 table was lost to a topic-key upsert ("Detail in prior revisions"); PR 3 has narrative RED/GREEN evidence only (3.1 RED against the dev DB, 3.9 GREEN). Downgraded from the strict-TDD default of CRITICAL because RED/GREEN task pairs exist and all referenced tests exist and pass — an artifact-persistence gap, not missing tests. **Accepted as recorded tech debt.** Remediation for future apply batches: merge the TDD Cycle Evidence table on each save, never replace it.
- **W3 — Some abort messages don't name the expected database.** The Fail-Fast Target Guard requirement's text says an abort MUST print "a message naming the expected database and the reason." The `globalSetup`-level aborts (override trigger, missing/garbage/non-postgres base URL, malformed generated name) give the reason but not the expected database name; the worker-guard message does comply. **Accepted as recorded tech debt** — the scenario-level assertions (a clear message, naming the trigger) are met, and this is a text-literalism gap, not a functional guard defect.

### Pending user follow-up (not tech debt — an outstanding action)

- **W2 — One-time dev-DB reset not yet run.** The reset (`prisma migrate reset` then `prisma db seed`) is documented in `README.md` but has not been executed. `sfmanager` still holds pre-existing fixture rows (2086 `User` rows) from before this change. This is destructive and was deliberately not run during verify or archive. **The user must run it once** and confirm the seeded admin (`admin@sfmanager.local`) is active afterwards. `CLAUDE.md`'s *Dev data is mostly test fixtures* bullet already describes the post-reset state (QA users gone until `dev-seed-data` lands), so no further doc change is needed once the reset runs.

### Other suggestions carried forward (not re-opened, informational only)

- **S1**: `jest-environment-node@30.5.2` vs. nested `jest@30.4.1` — version-skew hygiene, not a defect. Deferred.
- **S2**: a literal Postgres-down `npm test` run (container stopped, not just an unreachable URL) is still worth doing once. Deferred.
- **S3**: `redactMigrateOutput`'s second redaction pass uses the percent-encoded password; a password with reserved characters that Prisma echoes decoded would not be redacted on the migrate-failure path. Deferred, narrow edge case.
- **S4**: `global-teardown.ts`'s `readBaseDatabaseUrl()` call is correctly-behaving but misleadingly named at teardown time (it returns the already-rewritten run URL, not the base URL). Deferred, naming-only.
- **S6**: add message assertions to the guard-first and worker-guard throw tests, plus a prepare-level "missing/unparseable baseUrl, then no port call" case. Deferred, test-quality improvement.

## PR List

Stacked-to-main, 3 PRs, `ask-on-risk` delivery strategy (user approved size exceptions for PR1 and PR3):

| PR | Scope | Merge |
|---|---|---|
| #166 | PR 1 — Pure harness modules (`src/shared/testing`) + unit specs + `tsconfig.build.json` exclusion. ~1883 lines (code ~314 / test ~748 / openspec docs ~821), size:exception. | Merged `5edeae6` |
| (folded into #167) | PR 2 — FK-violating fixture discovery + fixes. Zero violations found; 14-line docs-only commit `16c9552`. No exception needed. | Folded into #167 |
| #167 | PR 3 — Harness switch: `globalSetup`/`globalTeardown`, `TestDatabaseEnvironment`, tripwire, `jest-integration.json`, `package.json` wiring, `app.e2e-spec.ts` → `app.integration.spec.ts` rename, README/CLAUDE.md docs. 836 lines total (~271 code / ~165 tests / ~130 docs / ~270 package-lock.json), size:exception, user-accepted (lockfile delta is dependency noise, not logic). | Merged `c833086`, 2026-09-28 |

## Deferred Follow-Ups (not part of this change, tracked for future work)

1. **`dev-seed-data` slice** — QA users and realistic dev data in the seed, deferred by the original proposal's Out of Scope section.
2. **One-time dev-DB reset** (W2 above) — pending user action, not yet executed.
3. **TDD evidence table persistence** (W1 above) — process fix for future apply batches: merge, don't replace, the TDD Cycle Evidence table.
4. **Fail-Fast Guard message wording** (W3 above) — cosmetic: name the expected database in the globalSetup-level abort messages, not just the reason.
5. **Version pin**: `jest-environment-node` vs. `jest` skew (S1) — hygiene follow-up.
6. **Password redaction edge case** in `redactMigrateOutput` (S3) — narrow, migrate-failure-path only.

## SDD Cycle Complete

The change has been fully planned, implemented, verified and archived. `hermetic-integration-tests` is closed. No immediate next slice is required by this change; `dev-seed-data` (QA users + realistic dev data in the seed) is the natural next `/sdd-new` candidate whenever that need becomes active, and the user's pending one-time dev-DB reset should be run before then.

## Orchestrator Action Required (no Bash access in this agent)

This sub-agent has no Bash tool. The orchestrator must still, outside this agent:
1. Delete the source folder `openspec/changes/hermetic-integration-tests/` (superseded by the archive copy at `openspec/changes/archive/2026-09-28-hermetic-integration-tests/`).
2. Git-add and commit the archive move (new `openspec/specs/integration-test-isolation/spec.md`, new `openspec/changes/archive/2026-09-28-hermetic-integration-tests/`, deleted `openspec/changes/hermetic-integration-tests/`) on the current branch `hermetic-integration-tests/04-archive`.
