# Tasks: Hermetic Integration Tests

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~580 (code ~210 / test ~370); PR2 TBD after discovery; PR3 ~290 (code ~190 / test ~100) |
| 400-line budget risk | High (PR1 only) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3, stacked-to-main |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

PR1 is ~580 lines total, over budget, but growth is code + its own unit
tests for pure functions (size-exception convention). PR1 **code alone**
is ~210 lines — past the ~200-line code-only mark. **A 1a/1b split is
advisable**: PR 1a = `test-database.ts` pure functions + specs (~120
code / ~230 test); PR 1b = `prepare-test-database.ts` orchestration +
specs (~90 code / ~140 test). Ask the user before apply: proceed with
PR1 as one size-exception PR, or split into 1a/1b.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1(a/b) | Pure harness modules (`test-database.ts`, `prepare-test-database.ts`) + unit specs + tsconfig.build exclusion | PR 1 (or 1a/1b) | Base: main. Includes committing the untracked `openspec/changes/hermetic-integration-tests/` folder |
| 2 | FK-violating fixture fixes, found by local discovery run | PR 2 | Base: PR 1's merge point. Size TBD |
| 3 | Harness switch: globalSetup/Teardown, environment, jest-integration.json, package.json wiring, app rename, docs | PR 3 | Base: PR 2's merge point |

## PR 1: Pure Harness Modules (`src/shared/testing`)

- [x] 1.1 RED: `test-database.spec.ts` — `generateRunDatabaseName`/`isRunDatabaseName` cases (valid, `sfmanager`, bare prefix, lookalikes, byte limit, no collision same ms)
- [x] 1.2 GREEN: implement `generateRunDatabaseName`, `isRunDatabaseName`, `TEST_DATABASE_PREFIX`
- [x] 1.3 RED: `parseRunDatabaseCreatedAt` cases (valid, non-run name, pre-epoch-floor, unparseable)
- [x] 1.4 GREEN: implement `parseRunDatabaseCreatedAt`
- [x] 1.5 RED: `deriveTestDatabaseUrl`/`toMaintenanceUrl`/`assertTestDatabaseUrl` cases (swap db name, missing/garbage/mysql URL, password redaction)
- [x] 1.6 GREEN: implement `deriveTestDatabaseUrl`, `toMaintenanceUrl`, `assertTestDatabaseUrl`
- [x] 1.7 RED: `assertWorkerDatabase` cases (mismatch, both-valid-but-differ, both-agree-on-invalid, missing value)
- [x] 1.8 GREEN: implement `assertWorkerDatabase`
- [x] 1.9 RED: `findDotenvOverride` cases (env var any value incl. `"false"`, argv form, none set)
- [x] 1.10 GREEN: implement `findDotenvOverride`
- [x] 1.11 RED: `isIntegrationSpecPath` cases (both path separators)
- [x] 1.12 GREEN: implement `isIntegrationSpecPath`
- [x] 1.13 RED: `planStaleSweep` cases (23h59m kept, >24h dropped, unparseable/future kept, excludes current run, lookalikes excluded)
- [x] 1.14 GREEN: implement `planStaleSweep`, `STALE_RUN_DATABASE_AGE_MS`
- [x] 1.15 RED: `isObjectInUseError`(55006)/`isDatabaseMissingError`(3D000) cases (recognize + reject other codes)
- [x] 1.16 GREEN: implement both classifiers
- [x] 1.17 RED: `planTeardownDrop` cases (valid → instruction, invalid → null)
- [x] 1.18 GREEN: implement `planTeardownDrop`
- [x] 1.19 RED: `stripUtf8Bom` cases (BOM stripped, BOM-free unchanged)
- [x] 1.20 GREEN: implement `stripUtf8Bom`
- [x] 1.21 REFACTOR: dedupe helpers in `test-database.ts`; confirm exports match design Interfaces/Contracts
- [x] 1.22 RED: `prepare-test-database.spec.ts` — guard-first ordering (no port call on guard failure, incl. malformed-name case), sweep classify (55006/3D000 skip+continue, other rethrow), create/migrate happy path, 42P04 no-drop-rethrow, migrate-fail-drops-own-db-rethrows-original
- [x] 1.23 GREEN: implement `prepareTestDatabase` + `TestDatabasePorts`
- [x] 1.24 REFACTOR: extract shared fakes/test helpers if duplicated
- [x] 1.25 Modify `apps/api/tsconfig.build.json`: exclude `src/shared/testing`
- [x] 1.26 Commit the untracked `openspec/changes/hermetic-integration-tests/` folder in this PR
- [x] 1.27 Verify: `npm test -w apps/api` green; `npm run build -w apps/api` excludes `src/shared/testing` from `dist`

## PR 2: FK Fixture Fixes (discovery-driven)

- [ ] 2.1 Manually create a scratch Postgres DB (`createdb` or `psql -c "CREATE DATABASE sf_manager_test_scratch"` against the docker-compose Postgres), run `prisma migrate deploy` against it — never against `sfmanager`
- [ ] 2.2 Run the full integration suite against the scratch DB using PR 3's harness code from the working tree (or a manual `DATABASE_URL` pointed at the scratch DB), list every failing spec and the FK it violates. Check migrations: `20260825120000_add_community_and_assignments`, `20260827091950_add_maintenance_company`, `20260901094525_add_inspectable_element`, `20260903072531_add_review_template`, `20260907090000_add_review_session`, `20260909090000_add_review_session_performed_by_company`
- [ ] 2.3 If the failing-spec count is large, STOP and escalate to the user before continuing
- [ ] 2.4 Fix each FK-violating fixture so the constraint holds (no skip/disable)
- [ ] 2.5 Verify: re-run the discovery suite against the scratch DB — zero FK violations
- [ ] 2.6 Drop the scratch DB; commit only fixture corrections (no harness files)

## PR 3: Harness Switch + Docs

- [ ] 3.1 RED: create `apps/api/src/shared/infrastructure/persistence/test-database-isolation.integration.spec.ts` asserting `current_database()` matches the run-name pattern, is not `sfmanager`, equals `SF_TEST_RUN_DATABASE` — fails today (no run DB)
- [ ] 3.2 Create `test/test-database/read-base-database-url.ts` (shell env else `dotenv.parse(.env)`, BOM-stripped)
- [ ] 3.3 Create `test/test-database/global-setup.ts` (wires `pg`+`spawnSync` into `prepareTestDatabase`; publishes `DATABASE_URL`, `SF_TEST_RUN_DATABASE`, `globalThis.__SF_TEST_RUN_DATABASE__`)
- [ ] 3.4 Create `test/test-database/global-teardown.ts` (reads `globalThis` name, calls `planTeardownDrop`, drops `WITH (FORCE)` or throws)
- [ ] 3.5 Create `test/test-database/test-database.environment.ts` (calls `assertWorkerDatabase` in `setup()` and `run_start`, reading sandbox `process.env`)
- [ ] 3.6 Create `test/test-database/refuse-integration-spec.setup.ts` (unit tripwire) and wire into unit `setupFilesAfterEnv`
- [ ] 3.7 Create `apps/api/test/jest-integration.json` (`roots: src+test`, `globalSetup`, `globalTeardown`, `testEnvironment`)
- [ ] 3.8 Modify `apps/api/package.json`: `test:integration` script (`jest --config ./test/jest-integration.json --runInBand`), unit block `setupFilesAfterEnv`, devDeps `pg`, `@types/pg`, `jest-environment-node`
- [ ] 3.9 GREEN: run 3.1's isolation spec — passes unmodified
- [ ] 3.10 Rename `test/app.e2e-spec.ts` → `test/app.integration.spec.ts`; add `current_database()` assertion; fix header comment
- [ ] 3.11 Verify: full `test:integration` run — the 3 concurrency specs pass unmodified
- [ ] 3.12 Manual: two concurrent `test:integration` runs each get their own DB, both pass, `psql` confirms neither DB was dropped by the other's sweep
- [ ] 3.13 Manual: `DOTENV_CONFIG_OVERRIDE=true npm run test:integration` aborts before any query
- [ ] 3.14 Manual: stray `npx jest x.integration.spec.ts` fails in the tripwire
- [ ] 3.15 Manual: `npm run test:e2e` still passes with no Docker running (10 remaining specs)
- [ ] 3.16 Manual: dev-DB row counts and seeded admin unchanged before/after a full `test:integration` run (`psql`)
- [ ] 3.17 Update `README.md`: run-name scheme, embedded timestamp, 24h stale-DB retention, run commands, one-time dev reset (`prisma migrate reset` then `prisma db seed`)
- [ ] 3.18 Update `CLAUDE.md`: rewrite *Dev-DB pollution* bullet (remove "never run the full suite"; state runs are isolated and safe concurrently); update *Dev data is mostly test fixtures* (QA users gone post-reset until `dev-seed-data`)
- [ ] 3.19 **Open decision (unresolved):** refresh the stale "shared dev DB" comments in `prisma-user.repository.integration.spec.ts:13-17` and `organization-profile-migration.integration.spec.ts:63-76` in this PR, or defer? Ask the user — do not assume.
