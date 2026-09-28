## Verification Report

**Change**: hermetic-integration-tests
**Version**: spec `integration-test-isolation` (round-5 final)
**Mode**: Strict TDD
**Verified against**: `main` @ `c833086` (PR #166 + PR #167 merged; PR 2 docs-only commit `16c9552` folded into #167). Working tree clean before and after.
**Date**: 2026-09-28

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 52 (PR1 27, PR2 6, PR3 19) |
| Tasks complete | 52 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: Passed. `npm run build -w apps/api` exit 0; `dist/shared/testing` absent (tsconfig.build.json exclusion holds).
**Type check**: Passed. `npx tsc --noEmit -p apps/api/tsconfig.json` exit 0 (covers `src/` and `test/`).
**Lint**: 0 errors. `npx eslint` (without `--fix`) on `src/shared/testing`, `test/test-database`, `test/app.integration.spec.ts` and the isolation spec. `npm run lint` was not run because its `--fix` rewrites an unrelated file.

**Tests**: all passed

    npm test -w apps/api                       126 suites / 1042 tests passed
    npm run test:integration -w apps/api       26 suites / 160 tests passed (x4 runs, incl. 2 concurrent)
    npm run test:e2e -w apps/api               10 suites / 440 tests passed
    DATABASE_URL=<unreachable 127.0.0.1:1> npm test -w apps/api   126 / 1042 passed

**Coverage** (changed pure modules; `test/` glue is untested by design, D13):

| File | Line % | Branch % | Uncovered | Rating |
|------|--------|----------|-----------|--------|
| `src/shared/testing/prepare-test-database.ts` | 100 | 87.5 | L51 branch (`ports.now` absent) | Excellent |
| `src/shared/testing/test-database.ts` | 98.86 | 91.93 | L118 (`toMaintenanceUrl` invalid-URL throw) | Excellent |

### Live runtime evidence gathered in this verify
- Dev DB `sfmanager`: per-table row counts for all 15 tables snapshotted before any run and compared after the first integration run and again after every check. Identical each time. `admin@sfmanager.local` stayed active. 0 leftover `sf_manager_test_*` databases at the end.
- Sweep: created scratch DBs `sf_manager_test_backup` (lookalike), a YOUNG run name (1h old, zero connections), an AGED name (48h, unconnected) and an AGEDHELD name (49h, held open by a `pg_sleep` session). After one integration run, AGED was dropped. AGEDHELD (55006 skip), YOUNG and the lookalike survived. The run passed 160/160. The scratch DBs were dropped afterwards.
- Concurrency: two `test:integration` runs started 1s apart. Polling saw two distinct run DBs coexist (`sf_manager_test_mukwom1w_7098c3`, `sf_manager_test_mukwomt4_60f8e8`). Both exited 0 with 160/160. 0 leftovers.
- Aborts in globalSetup, with no DB created: `DOTENV_CONFIG_OVERRIDE=false` (message names the trigger `DOTENV_CONFIG_OVERRIDE`), `DATABASE_URL=not a url`, and a `mysql://` URL.
- Unit tripwire: a stray `npx jest --testPathIgnorePatterns=/node_modules/` run failed all 25 integration specs in the tripwire. The 1042 unit tests stayed green.
- Teardown glue (invoked directly via ts-node): `sfmanager`, `sf_manager_test_backup` and `undefined` each throw a clear error naming the value, before any `pg` client is created.
- Worker guard glue: `TestDatabaseEnvironment.handleTestEvent('run_start')` with a sandbox env rewritten to the dev URL throws "worker's DATABASE_URL resolves to postgresql://u:***@localhost:5432/sfmanager?schema=public, expected run database sf_manager_test_...". The password is redacted, and it passes with a matching env.

### Spec Compliance Matrix
| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Own Run Database | Full run leaves dev data untouched (procedural) | psql row-count + admin snapshot before/after 4 integration runs | COMPLIANT |
| Own Run Database | Renamed health spec runs against its run DB | `test/app.integration.spec.ts > connects to this run's own database` | COMPLIANT |
| Per-Run Preparation | First run on a fresh machine | First run today started with 0 `sf_manager_test_*` DBs, then created, migrated and passed 160/160 | COMPLIANT |
| Per-Run Preparation | Fresh run DB starts empty every time | `organization-profile-migration.integration.spec.ts` (exactly one migration-seeded row) passes on each fresh DB. The "not cleared between files" clause is proven by source only (no truncate/cleanup code exists) | PARTIAL |
| Concurrent Isolation | Two concurrent runs each get their own DB | Live concurrent run (above) | COMPLIANT |
| Concurrent Isolation | Live run's DB with zero connections not dropped | Live YOUNG DB survived; `planStaleSweep > keeps a name aged 23h59m`; `prepareTestDatabase > does not drop a run database aged 23h` | COMPLIANT |
| Concurrent Isolation | Stale sweep removes unused leftover | Live AGED DB dropped; `planStaleSweep > drops a name aged just over 24h` | COMPLIANT |
| Concurrent Isolation | Sweep skips DB in use (55006) | Live AGEDHELD survived and the run proceeded; 2 prepare unit tests | COMPLIANT |
| Concurrent Isolation | Stale DB already dropped (3D000) is skipped | `prepareTestDatabase > skips ... 3D000` + `continues sweeping ... 3D000` (the race was not reproduced live) | COMPLIANT |
| Concurrent Isolation | Lookalike never swept | Live `sf_manager_test_backup` survived; `planStaleSweep > never selects lookalike names` | COMPLIANT |
| Fail-Fast Guard | Misconfigured run aborts | Live garbage and mysql base URL aborts with no DB created; `prepareTestDatabase > does not call any port when the generated run name is malformed`; derive missing/garbage/mysql unit tests | COMPLIANT |
| Fail-Fast Guard | Dotenv override trigger aborts | Live `=false` abort naming the trigger; `findDotenvOverride` + prepare no-port unit tests | COMPLIANT |
| Fail-Fast Guard | Worker resolving dev URL is stopped | `assertWorkerDatabase` 7 unit tests + direct `run_start` glue exercise | COMPLIANT |
| Teardown | Drops the run's own DB | Every run ended with 0 own DBs left; the scratch DBs survived teardown | COMPLIANT |
| Teardown | Refuses an invalid name | `planTeardownDrop > returns null`; live glue throw naming the value, no DROP | COMPLIANT |
| Unit Run Unaffected | Unit run without database | Unit run 1042/1042 green with `DATABASE_URL` unreachable. The unit config has no globalSetup. A literal Postgres-down unit run was not done (container must stay up) | PARTIAL |
| Concurrency Specs | Concurrency specs on the test DB | 160/160 includes all 4 concurrency specs; no logic diffs (only a comment-only edit in `prisma-user.repository`, task 3.19) | COMPLIANT |
| FK Fixtures | Fixtures pass with FKs enforced | Full suite green on a freshly migrated DB; no skip/disable anywhere in the diff | COMPLIANT |
| Docs | Reset restores seeded users (manual) | Documented in README L92-102, but NOT executed. The dev DB is still polluted (2086 `User` rows) | NOT EXECUTED (manual) |
| Docs | Full-suite warning removed (doc review) | CLAUDE.md has no prohibition, and the Dev-DB pollution bullet is rewritten. README documents naming, the 24h retention and the reset | COMPLIANT |

**Compliance summary**: 17/20 COMPLIANT, 2 PARTIAL, 1 manual scenario not executed.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| Own Run Database | Implemented | globalSetup publishes `DATABASE_URL` + `SF_TEST_RUN_DATABASE`; specs connect via the inherited env |
| Per-Run Preparation | Implemented | `prepareTestDatabase`: guard, list (no SQL LIKE), JS filter, age sweep, create, migrate; once per run in globalSetup |
| Concurrent Isolation | Implemented | Age-based `planStaleSweep`, 55006/3D000 skip, 42P04 no-drop, migrate-fail force-drop of its own DB |
| Fail-Fast Guard | Implemented, with a message gap | See W3 |
| Teardown | Implemented | `globalThis` handoff + `planTeardownDrop` + `WITH (FORCE)` |
| Unit Run Unaffected | Implemented | Unit block has only the tripwire; `crypto` lazy-require fix keeps the spec mock effective |
| Docs | Implemented | README + CLAUDE.md |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D1 publish via env, sandbox re-check | Yes | Reads `this.global.process.env` in `setup()` and `run_start` |
| D2 base URL source + name shape | Yes | Shell env, else `dotenv.parse` with BOM strip; 31-byte name |
| D3 guard order + tripwire | Yes | |
| D4 sweep/create/migrate semantics | Yes | Separate queries, quoted identifiers from validated names only |
| D5 `pg` Client | Yes | |
| D6 `spawnSync` + env-only URL | Yes | Plus additive `redactMigrateOutput` (see S3) |
| D7 separate `jest-integration.json` | Yes | `--runInBand`, `roots` src+test |
| D8 rename, `jest-e2e.json` untouched | Yes | `git diff b87bee2 c833086 -- apps/api/test/jest-e2e.json` is empty |
| D9 documented reset | Yes | No `--force` |
| D12 teardown | Yes | Naming nit, see S4 |
| D13 pure worker guard | Yes | |

### TDD Compliance
| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Warning | No "TDD Cycle Evidence" table in the current apply-progress. The PR 1 table was lost to a topic-key upsert ("Detail in prior revisions"). PR 3 has narrative evidence only (3.1 RED against the dev DB, 3.9 GREEN). PR 1 commits co-commit tests and code, so git cannot show RED-first ordering |
| All tasks have tests | Yes | PR1 RED/GREEN task pairs 1.1-1.24 map to `test-database.spec.ts` / `prepare-test-database.spec.ts`. PR3 `test/` glue is untested by design (D13), covered by the isolation spec + manual checks |
| RED confirmed (tests exist) | Yes | 4/4 test files exist |
| GREEN confirmed (tests pass) | Yes | 4/4 pass on execution today |
| Triangulation adequate | Yes | Multiple cases per behavior with varied expectations |
| Safety net for modified files | Yes | `test-database.ts` modified in PR3; apply-progress records a `git stash` pre-check |

**TDD Compliance**: 5/6 checks passed (evidence table missing; see W1)

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 66 | 2 | jest + ts-jest |
| Integration | 3 | 2 | jest + real Postgres (per-run DB) |
| E2E | 0 new | 0 | jest-e2e (unchanged, 440 pass) |
| **Total** | **69** | **4** | |

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `prepare-test-database.spec.ts` | 66, 81 | `rejects.toThrow()` | No message asserted (the trigger and expected DB are not checked) | SUGGESTION |
| `test-database.spec.ts` | 239-258 | `toThrow()` | Worker-guard throws are not message-checked | SUGGESTION |

**Assertion quality**: 0 CRITICAL, 0 WARNING. There are no tautologies, ghost loops or orphan empty checks. The lookalike `toEqual([])` has a non-empty companion test.

### Quality Metrics
**Linter**: 0 errors on changed files
**Type Checker**: 0 errors

### Issues Found

**CRITICAL**: None

**WARNING**:
- **W1: No Strict-TDD evidence table.** apply-progress lacks the "TDD Cycle Evidence" table. The PR 1 table was overwritten by the topic-key upsert, and PR 3 reports only in narrative. `strict-tdd-verify.md` defaults this to CRITICAL. It was downgraded because RED/GREEN task pairs exist and all referenced tests exist and pass, so this is an artifact-persistence gap, not missing tests. Escalate to CRITICAL if the protocol should be applied literally. Remediation: going forward, apply batches must merge the table, not replace it.
- **W2: "Reset restores seeded users" was never executed.** The one-time dev reset is documented but has not been run. `sfmanager` still holds 2086 `User` rows and fixture data. CLAUDE.md already speaks as if the reset happened ("After the one-time dev reset ... QA users are gone"). The user must run it once (it is destructive, so not done in verify) and confirm the seeded admin is active.
- **W3: Some abort messages do not name the expected database.** The Fail-Fast Guard requirement says an abort MUST print "a message naming the expected database and the reason". The globalSetup-level aborts give only the reason: override trigger, missing, garbage or non-postgres base URL, and malformed generated name ("Refusing to run against non-test database <url>"). The worker-guard message complies. The scenario-level assertions (a clear message, naming the trigger) are met.

**SUGGESTION**:
- **S1 (known a): version skew.** `jest-environment-node@30.5.2` is at the top level while `jest@30.4.2` nests 30.4.1. It works (every integration file ran through the custom environment), but pin it to the jest line (`~30.4.1`) or bump jest together, to avoid future type/behavior skew.
- **S2 (known b): Postgres-down unit run.** Postgres-down was verified only for `test:e2e` (3.15). This verify added a unit run with an unreachable `DATABASE_URL` (1042/1042), and the unit config has no globalSetup. A literal Postgres-down `npm test` is still worth one run when stopping the container is acceptable.
- **S3 (known c): redaction pass.** `global-setup.ts` `redactMigrateOutput` does its second pass with `new URL(testUrl).password`, which is the percent-encoded form. If the password contains reserved characters and Prisma echoes it decoded, that string is not redacted. This only matters on the migrate-failure path with local credentials, and it goes beyond the spec. Also redact `decodeURIComponent(password)`.
- **S4 (known d): teardown naming.** `global-teardown.ts` calls `readBaseDatabaseUrl()`, which at teardown time returns the run URL that globalSetup published into `process.env.DATABASE_URL`, not the base URL. The result is correct because it is rewritten to `/postgres`, but the name misleads. Add a comment or rename.
- **S5: artifact drift.** The openspec `tasks.md` Review Workload Forecast still shows the pre-apply estimates (PR1 ~580, PR3 ~290), while engram shows the actuals (~885, ~552). Both the engram tasks/apply-progress and the file header still describe PR 3 as "not pushed / needs review", and neither records that PR 2 was folded into #167 or that #167 merged at `c833086`. The `design.md` Open Question "Refresh the stale shared dev DB comments" is still unchecked although task 3.19 resolved it. The spec file matches engram, except for an engram-only non-normative "Fix-round summary" section. Reconcile these at archive.
- **S6: message assertions.** Add message assertions to the guard-first and worker-guard throw tests, plus a prepare-level "missing/unparseable baseUrl, then no port call" case (today it is covered by the derive unit tests and the live check).
- **S7: concurrency spec edit.** The spec says the concurrency specs pass "without changes to their source". `prisma-user.repository.integration.spec.ts` got a comment-only, user-approved edit (3.19) with no logic change. Record it at archive.

### Verdict
**PASS WITH WARNINGS**

0 CRITICAL, 3 WARNING, 7 SUGGESTION. All suites green, every automatable scenario has a passing runtime test, and dev data was proven untouched. Nothing blocks `sdd-archive`. W2 (run the dev reset once) is a user action.
